import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = join(import.meta.dirname, "../..");
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, "package.json"), "utf-8")
) as { scripts: Record<string, string> };

describe("dev-runtime hydration gate tooling (issue #121)", () => {
  it("routes test:e2e through the dev-runtime Playwright project only", () => {
    expect(packageJson.scripts["test:e2e"]).toBe("npm run test:e2e:dev-smoke");
    expect(packageJson.scripts["test:e2e:dev-smoke"]).toContain(
      "--project=dev-runtime"
    );
    expect(packageJson.scripts["test:e2e:dev-smoke"]).not.toContain("chromium");
    expect(packageJson.scripts["test:e2e:dev-smoke"]).not.toContain("pixel-7");
  });

  it("keeps test:e2e:run project selection byte-for-byte unchanged", () => {
    expect(packageJson.scripts["test:e2e:run"]).toBe(
      "npx playwright test --project=chromium --project=pixel-7"
    );
  });

  it("documents the routine test command in AGENTS.md", () => {
    const agentsMd = readFileSync(join(projectRoot, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("npm run test:unit && npm run test:e2e");
    expect(agentsMd).toContain("dev-runtime");
  });

  it("asserts on all page errors without substring filtering", () => {
    const specSource = readFileSync(
      join(projectRoot, "tests/e2e/dev-runtime-integrity.spec.ts"),
      "utf-8"
    );

    expect(specSource).toContain('page.on("pageerror"');
    expect(specSource).not.toContain("error.message.includes");
    expect(specSource).not.toMatch(/if\s*\(\s*error\.message/);
  });

  it("declares a dev-runtime Playwright project for the integrity spec", () => {
    const playwrightConfig = readFileSync(
      join(projectRoot, "playwright.config.ts"),
      "utf-8"
    );

    expect(playwrightConfig).toContain('name: "dev-runtime"');
    expect(playwrightConfig).toContain("dev-runtime-integrity\\.spec\\.ts");
  });
});
