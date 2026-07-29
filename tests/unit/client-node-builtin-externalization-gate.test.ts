import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractImporterFromExternalizationWarning,
  findTopLevelNodeBuiltinStaticImports,
  formatClientNodeBuiltinExternalizationFailures,
  isClientNodeBuiltinExternalizationWarning,
  isNodeBuiltinSpecifier,
  normalizeImporterPath,
  relativizeImporterPath,
} from "../../scripts/client-node-builtin-externalization-gate.ts";

const SAMPLE_WARNING =
  'Module "node:fs" has been externalized for browser compatibility, imported by "/home/doug/github.com/douglasdemoura/fitness/src/db/index.ts". See https://vite.dev/guide/troubleshooting.html#module-externalized-for-browser-compatibility for more details.';

describe("client node builtin externalization parser (issue #120)", () => {
  const projectRoot = join(import.meta.dirname, "../..");

  it("detects Vite client externalization warnings", () => {
    expect(isClientNodeBuiltinExternalizationWarning(SAMPLE_WARNING)).toBe(
      true
    );
    expect(
      isClientNodeBuiltinExternalizationWarning("Module not found: node:fs")
    ).toBe(false);
  });

  it("extracts the importing file path from a warning", () => {
    expect(
      extractImporterFromExternalizationWarning(SAMPLE_WARNING, projectRoot)
    ).toBe("src/db/index.ts");
  });

  it("relativizes absolute importer paths", () => {
    expect(
      relativizeImporterPath(join(projectRoot, "src/db/paths.ts"), projectRoot)
    ).toBe("src/db/paths.ts");
  });

  it("normalizes virtual module query strings from importer paths", () => {
    expect(
      normalizeImporterPath("src/routes/index.tsx?tsr-split=component")
    ).toBe("src/routes/index.tsx");
  });

  it("detects node built-in specifiers", () => {
    expect(isNodeBuiltinSpecifier("node:fs")).toBe(true);
    expect(isNodeBuiltinSpecifier("fs")).toBe(true);
    expect(isNodeBuiltinSpecifier("react")).toBe(false);
  });

  it("finds top-level node built-in imports in client module sources", () => {
    const source = [
      'import { readFileSync } from "node:fs";',
      'import { createFileRoute } from "@tanstack/react-router";',
      "async function load() {",
      '  const { db } = await import("~/db");',
      "}",
    ].join("\n");

    expect(findTopLevelNodeBuiltinStaticImports(source)).toEqual(["node:fs"]);
  });

  it("formats failures with every unique importer path", () => {
    const message = formatClientNodeBuiltinExternalizationFailures([
      "src/db/paths.ts",
      "src/db/index.ts",
      "src/db/index.ts",
    ]);

    expect(message).toContain("src/db/index.ts");
    expect(message).toContain("src/db/paths.ts");
    expect(message.match(/src\/db\/index\.ts/g)).toHaveLength(1);
  });
});

describe("client node builtin externalization build gate (issue #120)", () => {
  const projectRoot = join(import.meta.dirname, "../..");

  function runBuild(cwd: string = projectRoot): {
    status: number;
    output: string;
  } {
    try {
      const output = execSync("npm run build", {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { output, status: 0 };
    } catch (error) {
      const execError = error as {
        status?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        output: `${execError.stdout ?? ""}${execError.stderr ?? ""}`,
        status: execError.status ?? 1,
      };
    }
  }

  function installGateIntoWorktree(worktreeRoot: string): void {
    writeFileSync(
      join(worktreeRoot, "vite.config.ts"),
      readFileSync(join(projectRoot, "vite.config.ts"), "utf-8")
    );
    writeFileSync(
      join(worktreeRoot, "scripts/client-node-builtin-externalization-gate.ts"),
      readFileSync(
        join(
          projectRoot,
          "scripts/client-node-builtin-externalization-gate.ts"
        ),
        "utf-8"
      )
    );
    execSync(
      `ln -s ${join(projectRoot, "node_modules")} ${join(worktreeRoot, "node_modules")}`,
      { stdio: "ignore" }
    );
  }

  function withDetachedWorktree(run: (worktreeRoot: string) => void): void {
    const worktreeParent = mkdtempSync(join(tmpdir(), "fittrack-gate-"));
    const worktreeRoot = join(worktreeParent, "tree");
    execSync(`git worktree add --detach ${worktreeRoot} HEAD`, {
      cwd: projectRoot,
      stdio: "ignore",
    });
    installGateIntoWorktree(worktreeRoot);

    try {
      run(worktreeRoot);
    } finally {
      execSync(`git worktree remove --force ${worktreeRoot}`, {
        cwd: projectRoot,
        stdio: "ignore",
      });
      rmSync(worktreeParent, { force: true, recursive: true });
    }
  }

  it("passes on the fixed root route tree", () => {
    const result = runBuild();
    expect(result.status, result.output).toBe(0);
  }, 120_000);

  it("fails on the pre-#118 root route leak and names src/db/index.ts", () => {
    withDetachedWorktree((worktreeRoot) => {
      const rootRoutePath = join(worktreeRoot, "src/routes/__root.tsx");
      const brokenRoot = execSync("git show 8fe8b15:src/routes/__root.tsx", {
        cwd: projectRoot,
        encoding: "utf-8",
      });
      writeFileSync(rootRoutePath, brokenRoot, "utf-8");

      const result = runBuild(worktreeRoot);
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain("src/db/index.ts");
    });
  }, 120_000);

  it("fails when a route module adds a top-level node:fs import", () => {
    withDetachedWorktree((worktreeRoot) => {
      const indexRoutePath = join(worktreeRoot, "src/routes/index.tsx");
      const currentIndex = readFileSync(indexRoutePath, "utf-8");
      writeFileSync(
        indexRoutePath,
        `import { readFileSync } from "node:fs";\n${currentIndex}`,
        "utf-8"
      );

      const result = runBuild(worktreeRoot);
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain("src/routes/index.tsx");
    });
  }, 120_000);
});
