import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { perEnvironmentPlugin } from "vite";
import type { Plugin } from "vite";

const EXTERNALIZATION_WARNING_PATTERN =
  /Module "(?:node:)?[^"]+" has been externalized for browser compatibility, imported by "([^"]+)"/;

const NODE_BUILTIN_MODULES = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);

const TOP_LEVEL_NODE_BUILTIN_IMPORT_PATTERN = new RegExp(
  String.raw`^import\s+(?!type\b)(?:[\w*{}\s,$]+\s+from\s+)?["']((?:node:)?(${[...NODE_BUILTIN_MODULES].join("|")}))["']`,
  "gm"
);

/** True when Vite externalized a Node builtin while building the client graph. */
export function isClientNodeBuiltinExternalizationWarning(
  message: string
): boolean {
  return EXTERNALIZATION_WARNING_PATTERN.test(message);
}

/** True when a module specifier targets a Node built-in. */
export function isNodeBuiltinSpecifier(specifier: string): boolean {
  if (specifier.startsWith("node:")) {
    return NODE_BUILTIN_MODULES.has(specifier.slice("node:".length));
  }
  return NODE_BUILTIN_MODULES.has(specifier);
}

/** Strip virtual-module query strings from an importer path. */
export function normalizeImporterPath(importerPath: string): string {
  return importerPath.split("?")[0]?.split("\\").join("/") ?? importerPath;
}

/** Return the project-relative importer path from a Vite externalization warning. */
export function extractImporterFromExternalizationWarning(
  message: string,
  projectRoot: string
): string | null {
  const match = EXTERNALIZATION_WARNING_PATTERN.exec(message);
  if (!match?.[1]) {
    return null;
  }
  return relativizeImporterPath(match[1], projectRoot);
}

/** Normalize an absolute importer path to a stable project-relative path. */
export function relativizeImporterPath(
  importerPath: string,
  projectRoot: string
): string {
  const absoluteImporter = resolve(importerPath);
  const relativePath = relative(resolve(projectRoot), absoluteImporter);
  return normalizeImporterPath(relativePath.split("\\").join("/"));
}

/** Find static node built-in imports at module top level in client bundle sources. */
export function findTopLevelNodeBuiltinStaticImports(source: string): string[] {
  const specifiers: string[] = [];
  for (const [, specifier] of source.matchAll(
    TOP_LEVEL_NODE_BUILTIN_IMPORT_PATTERN
  )) {
    if (specifier && isNodeBuiltinSpecifier(specifier)) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

/** Format a build failure that names every offending importer file. */
export function formatClientNodeBuiltinExternalizationFailures(
  importerPaths: readonly string[]
): string {
  const uniquePaths = [
    ...new Set(importerPaths.map(normalizeImporterPath)),
  ].sort();
  const lines = uniquePaths.map((path) => `  ${path}`);
  return [
    "Client build externalized Node built-ins for browser compatibility:",
    ...lines,
    "",
    "Move the import behind a createServerFn handler, a .server.ts module, or another server-only boundary.",
  ].join("\n");
}

function recordImporter(
  importerPaths: string[],
  importer: string,
  projectRoot: string
): void {
  const relativePath = relativizeImporterPath(importer, projectRoot);
  if (relativePath.startsWith("..")) {
    return;
  }
  importerPaths.push(relativePath);
}

function scanSourceForTopLevelNodeBuiltinImports(
  importerPaths: string[],
  source: string,
  importer: string,
  projectRoot: string
): void {
  if (findTopLevelNodeBuiltinStaticImports(source).length === 0) {
    return;
  }
  recordImporter(importerPaths, importer, projectRoot);
}

function shouldScanClientModule(id: string): boolean {
  const cleanId = normalizeImporterPath(id);
  return cleanId.includes("/src/") || cleanId.includes("\\src\\");
}

/** Fail production client builds that externalize Node built-ins for the browser. */
export function clientNodeBuiltinExternalizationGate(
  projectRoot: string = process.cwd()
): Plugin {
  return perEnvironmentPlugin(
    "fittrack:client-node-builtin-externalization-gate",
    (environment) => {
      if (environment.name !== "client") {
        return false;
      }

      const importerPaths: string[] = [];

      return {
        buildEnd() {
          if (importerPaths.length === 0) {
            return;
          }
          throw new Error(
            formatClientNodeBuiltinExternalizationFailures(importerPaths)
          );
        },
        enforce: "pre",
        load(id) {
          if (!shouldScanClientModule(id)) {
            return null;
          }
          const cleanId = normalizeImporterPath(id);
          try {
            const source = readFileSync(cleanId, "utf-8");
            scanSourceForTopLevelNodeBuiltinImports(
              importerPaths,
              source,
              cleanId,
              projectRoot
            );
          } catch {
            return null;
          }
          return null;
        },
        name: "fittrack:client-node-builtin-externalization-gate:client",
        onLog(level, log) {
          if (level !== "warn" && level !== "info") {
            return;
          }
          const importer = extractImporterFromExternalizationWarning(
            log.message,
            projectRoot
          );
          if (importer) {
            importerPaths.push(importer);
          }
        },
        resolveId(source, importer) {
          if (!importer || !isNodeBuiltinSpecifier(source)) {
            return null;
          }
          recordImporter(importerPaths, importer, projectRoot);
          return null;
        },
        transform(code, id) {
          if (!shouldScanClientModule(id)) {
            return null;
          }
          scanSourceForTopLevelNodeBuiltinImports(
            importerPaths,
            code,
            id,
            projectRoot
          );
          return null;
        },
      };
    }
  );
}
