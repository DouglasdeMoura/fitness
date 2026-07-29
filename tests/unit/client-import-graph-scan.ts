import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

import ts from "typescript";

/**
 * Deliberately reachable Node builtin imports and why they are safe (issue #87).
 * Prefer `.server.ts` modules or dynamic imports inside server-function bodies.
 */
export const ALLOWED_NODE_BUILTIN_IMPORTS = {} as const satisfies Record<
  string,
  Record<string, string>
>;

const ROUTE_TREE_ENTRY = "src/routeTree.gen.ts";

const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;

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

export interface ClientImportGraphViolation {
  filePath: string;
  line: number;
  specifier: string;
}

interface RelativeSource {
  filePath: string;
  sourceText: string;
}

function parseTypeScriptSource(
  sourceText: string,
  filePath: string
): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function readRelativeSource(
  projectRoot: string,
  absolutePath: string
): RelativeSource {
  const filePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");
  return { filePath, sourceText: readFileSync(absolutePath, "utf-8") };
}

function isNodeBuiltinSpecifier(specifier: string): boolean {
  if (specifier.startsWith("node:")) {
    return true;
  }
  return NODE_BUILTIN_MODULES.has(specifier);
}

function isServerOnlyModule(filePath: string): boolean {
  return filePath.endsWith(".server.ts") || filePath.startsWith("src/db/");
}

function isAllowlistedImport(filePath: string, specifier: string): boolean {
  const fileAllowlist = ALLOWED_NODE_BUILTIN_IMPORTS[filePath];
  return fileAllowlist !== undefined && specifier in fileAllowlist;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  if (node.importClause?.isTypeOnly) {
    return true;
  }
  const namedBindings = node.importClause?.namedBindings;
  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return false;
  }
  return namedBindings.elements.every((element) => element.isTypeOnly);
}

function moduleSpecifierText(node: ts.Node): string | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  return undefined;
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  return node.isTypeOnly === true;
}

function resolveProjectModule(
  specifier: string,
  fromFilePath: string,
  projectRoot: string
): string | null {
  if (
    specifier.startsWith("node:") ||
    (!specifier.startsWith(".") && !specifier.startsWith("~/"))
  ) {
    return null;
  }

  const fromAbsolute = join(projectRoot, fromFilePath);
  const fromDirectory = dirname(fromAbsolute);

  let candidateBase: string;
  if (specifier.startsWith("~/")) {
    candidateBase = join(projectRoot, "src", specifier.slice(2));
  } else {
    candidateBase = resolve(fromDirectory, specifier);
  }

  if (extname(candidateBase)) {
    return existsSync(candidateBase)
      ? relative(projectRoot, candidateBase).replaceAll("\\", "/")
      : null;
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const withExtension = `${candidateBase}${extension}`;
    if (existsSync(withExtension)) {
      return relative(projectRoot, withExtension).replaceAll("\\", "/");
    }
  }

  for (const extension of SOURCE_EXTENSIONS) {
    const indexFile = join(candidateBase, `index${extension}`);
    if (existsSync(indexFile)) {
      return relative(projectRoot, indexFile).replaceAll("\\", "/");
    }
  }

  return null;
}

function collectTraversableSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (isTypeOnlyImport(statement)) {
        continue;
      }
      const specifier = moduleSpecifierText(statement);
      if (specifier) {
        specifiers.push(specifier);
      }
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (isTypeOnlyExport(statement)) {
        continue;
      }
      const specifier = moduleSpecifierText(statement);
      if (specifier) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

/** Return top-level Node builtin imports that must not ship in the client graph. */
export function findTopLevelNodeBuiltinImports(
  sourceText: string,
  filePath: string
): ClientImportGraphViolation[] {
  if (isServerOnlyModule(filePath)) {
    return [];
  }

  const sourceFile = parseTypeScriptSource(sourceText, filePath);
  const violations: ClientImportGraphViolation[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || isTypeOnlyImport(statement)) {
      continue;
    }

    const specifier = moduleSpecifierText(statement);
    if (!specifier || !isNodeBuiltinSpecifier(specifier)) {
      continue;
    }

    if (isAllowlistedImport(filePath, specifier)) {
      continue;
    }

    const line =
      sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    violations.push({ filePath, line, specifier });
  }

  return violations;
}

/** Format one actionable gate failure with its source location. */
export function formatClientImportGraphViolation(
  violation: ClientImportGraphViolation
): string {
  return `${violation.filePath}:${violation.line} imports ${violation.specifier} into the client-reachable graph`;
}

/** Walk the route-tree import graph and flag Node builtins outside server-only modules. */
export function scanClientImportGraphViolations(
  projectRoot: string
): ClientImportGraphViolation[] {
  const queue = [ROUTE_TREE_ENTRY];
  const visited = new Set<string>();
  const violations: ClientImportGraphViolation[] = [];

  while (queue.length > 0) {
    const filePath = queue.shift();
    if (!filePath || visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);

    const absolutePath = join(projectRoot, filePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const source = readRelativeSource(projectRoot, absolutePath);
    violations.push(
      ...findTopLevelNodeBuiltinImports(source.sourceText, source.filePath)
    );

    const sourceFile = parseTypeScriptSource(
      source.sourceText,
      source.filePath
    );
    for (const specifier of collectTraversableSpecifiers(sourceFile)) {
      const resolved = resolveProjectModule(
        specifier,
        source.filePath,
        projectRoot
      );
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }
  }

  return violations.sort((left, right) => {
    if (left.filePath !== right.filePath) {
      return left.filePath.localeCompare(right.filePath);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.specifier.localeCompare(right.specifier);
  });
}
