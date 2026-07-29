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

/**
 * Deliberately reachable server-only value imports and why the compiler strips
 * them from the client graph (issue #119).
 */
export const ALLOWED_SERVER_ONLY_VALUE_IMPORTS = {
  "src/lib/auth.ts": {
    "~/db": "Better Auth adapter is only invoked from server-function handlers",
    "~/db/schema":
      "Drizzle schema is only consumed by the Better Auth adapter in this module",
  },
  "src/lib/notification-preferences.ts": {
    "~/db/notification-queries":
      "Notification preference helpers are only called from createServerFn handlers",
  },
  "src/lib/push.ts": {
    "~/db/push-queries":
      "Push query helpers are only called from createServerFn handlers",
  },
  "src/lib/require-auth.ts": {
    "~/db": "requireAuth() is only called from createServerFn handlers",
    "~/db/user-body-queries":
      "ensureSessionUserRecord is only called from requireAuth()",
  },
  "src/lib/schemas/user.ts": {
    "~/db/schema":
      "THEME_PREFERENCE_VALUES is a const array with no Node or SQLite runtime",
  },
  "src/lib/theme-preference-persistence.ts": {
    "~/db/user-body-queries":
      "Theme persistence helpers are only called from createServerFn handlers",
  },
} as const satisfies Record<string, Record<string, string>>;

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

function walkSyntaxTree(
  node: ts.Node,
  visit: (candidate: ts.Node) => void
): void {
  visit(node);
  ts.forEachChild(node, (child) => walkSyntaxTree(child, visit));
}

function isNodeBuiltinSpecifier(specifier: string): boolean {
  if (specifier.startsWith("node:")) {
    return true;
  }
  return NODE_BUILTIN_MODULES.has(specifier);
}

/** Import targets that must never ship in the client graph. */
function isServerOnlyModule(filePath: string): boolean {
  return filePath.endsWith(".server.ts") || filePath.startsWith("src/db/");
}

function isAllowlistedNodeBuiltinImport(
  filePath: string,
  specifier: string
): boolean {
  const fileAllowlist = ALLOWED_NODE_BUILTIN_IMPORTS[filePath];
  return fileAllowlist !== undefined && specifier in fileAllowlist;
}

function isAllowlistedServerOnlyValueImport(
  filePath: string,
  specifier: string
): boolean {
  const fileAllowlist = ALLOWED_SERVER_ONLY_VALUE_IMPORTS[filePath];
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

  const candidateExtension = extname(candidateBase);
  if (candidateExtension === ".ts" || candidateExtension === ".tsx") {
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

function chainRoot(expression: ts.Expression): ts.Expression {
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression)
  ) {
    return chainRoot(expression.expression.expression);
  }
  return expression;
}

function isCreateServerFnCall(expression: ts.Expression): boolean {
  const root = chainRoot(expression);
  return (
    ts.isCallExpression(root) &&
    ts.isIdentifier(root.expression) &&
    root.expression.text === "createServerFn"
  );
}

function resolveHandlerFunction(
  expression: ts.Expression
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (!ts.isCallExpression(expression)) {
    return undefined;
  }

  if (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "handler"
  ) {
    const [handler] = expression.arguments;
    if (
      handler &&
      (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
    ) {
      return handler;
    }
    return undefined;
  }

  return resolveHandlerFunction(expression.expression);
}

function isCreateFileRouteCall(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "createFileRoute"
  );
}

function readObjectProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string
): ts.ObjectLiteralElementLike | undefined {
  return objectLiteral.properties.find((property) => {
    if (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
      if (ts.isIdentifier(property.name)) {
        return property.name.text === propertyName;
      }
      if (ts.isStringLiteral(property.name)) {
        return property.name.text === propertyName;
      }
    }
    return false;
  });
}

function readObjectLiteralExpression(
  node: ts.Node | undefined
): ts.ObjectLiteralExpression | undefined {
  if (!node) {
    return undefined;
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node;
  }
  if (ts.isParenthesizedExpression(node)) {
    return readObjectLiteralExpression(node.expression);
  }
  return undefined;
}

function readRouteServerHandlerBodies(
  routeConfig: ts.ObjectLiteralExpression
): (ts.ArrowFunction | ts.FunctionExpression)[] {
  const serverProperty = readObjectProperty(routeConfig, "server");
  if (!serverProperty || !ts.isPropertyAssignment(serverProperty)) {
    return [];
  }

  const serverObject = readObjectLiteralExpression(serverProperty.initializer);
  if (!serverObject) {
    return [];
  }

  const handlersProperty = readObjectProperty(serverObject, "handlers");
  if (!handlersProperty || !ts.isPropertyAssignment(handlersProperty)) {
    return [];
  }

  const handlersObject = readObjectLiteralExpression(
    handlersProperty.initializer
  );
  if (!handlersObject) {
    return [];
  }

  const handlers: (ts.ArrowFunction | ts.FunctionExpression)[] = [];
  for (const handlerProperty of handlersObject.properties) {
    if (!ts.isPropertyAssignment(handlerProperty)) {
      continue;
    }
    const { initializer } = handlerProperty;
    if (
      ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer)
    ) {
      handlers.push(initializer);
    }
  }
  return handlers;
}

function collectServerExecutionRegions(
  sourceFile: ts.SourceFile
): (ts.ArrowFunction | ts.FunctionExpression)[] {
  const regions: (ts.ArrowFunction | ts.FunctionExpression)[] = [];

  walkSyntaxTree(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          !declaration.initializer ||
          !isCreateServerFnCall(declaration.initializer)
        ) {
          continue;
        }
        const handler = resolveHandlerFunction(declaration.initializer);
        if (handler) {
          regions.push(handler);
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      isCreateFileRouteCall(node.expression) &&
      node.arguments.length > 0
    ) {
      const routeConfig = readObjectLiteralExpression(node.arguments[0]);
      if (routeConfig) {
        regions.push(...readRouteServerHandlerBodies(routeConfig));
      }
    }
  });

  return regions;
}

type ServerExecutionRegion =
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.FunctionDeclaration;

function readFunctionDeclarationName(
  declaration: ts.FunctionDeclaration
): string | undefined {
  return declaration.name?.text;
}

function collectModuleFunctionDeclarations(
  sourceFile: ts.SourceFile
): ts.FunctionDeclaration[] {
  const declarations: ts.FunctionDeclaration[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.push(statement);
    }
  }
  return declarations;
}

function isCallExpressionInsideRegions(
  callExpression: ts.CallExpression,
  regions: ts.Node[]
): boolean {
  return isNodeInsideRegion(callExpression, regions);
}

function isFunctionOnlyCalledFromRegions(
  functionName: string,
  sourceFile: ts.SourceFile,
  regions: ts.Node[]
): boolean {
  let sawCallSite = false;
  let hasExternalCallSite = false;

  walkSyntaxTree(sourceFile, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
      return;
    }
    if (node.expression.text !== functionName) {
      return;
    }
    sawCallSite = true;
    if (!isCallExpressionInsideRegions(node, regions)) {
      hasExternalCallSite = true;
    }
  });

  return sawCallSite && !hasExternalCallSite;
}

function collectTransitiveServerExecutionRegions(
  sourceFile: ts.SourceFile
): ServerExecutionRegion[] {
  const regions: ServerExecutionRegion[] = [
    ...collectServerExecutionRegions(sourceFile),
  ];
  const moduleFunctions = collectModuleFunctionDeclarations(sourceFile);
  let expanded = true;

  while (expanded) {
    expanded = false;
    for (const declaration of moduleFunctions) {
      const functionName = readFunctionDeclarationName(declaration);
      if (!functionName || regions.includes(declaration)) {
        continue;
      }
      if (!isFunctionOnlyCalledFromRegions(functionName, sourceFile, regions)) {
        continue;
      }
      regions.push(declaration);
      expanded = true;
    }
  }

  return regions;
}

function isNodeInsideRegion(node: ts.Node, regions: ts.Node[]): boolean {
  const nodeStart = node.getStart();
  const nodeEnd = node.getEnd();
  return regions.some(
    (region) => nodeStart >= region.getStart() && nodeEnd <= region.getEnd()
  );
}

function importedBindingNames(
  importDeclaration: ts.ImportDeclaration
): string[] {
  const names: string[] = [];
  const { importClause } = importDeclaration;
  if (!importClause) {
    return names;
  }

  if (importClause.name) {
    names.push(importClause.name.text);
  }

  const { namedBindings } = importClause;
  if (!namedBindings) {
    return names;
  }

  if (ts.isNamespaceImport(namedBindings)) {
    names.push(namedBindings.name.text);
    return names;
  }

  if (ts.isNamedImports(namedBindings)) {
    for (const element of namedBindings.elements) {
      names.push(element.name.text);
    }
  }

  return names;
}

function isIdentifierReference(identifier: ts.Identifier): boolean {
  const { parent } = identifier;
  if (!parent) {
    return false;
  }

  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent)
  ) {
    return false;
  }

  if (ts.isVariableDeclaration(parent) && parent.name === identifier) {
    return false;
  }

  if (ts.isFunctionDeclaration(parent) && parent.name === identifier) {
    return false;
  }

  if (ts.isParameter(parent) && parent.name === identifier) {
    return false;
  }

  if (ts.isPropertyDeclaration(parent) && parent.name === identifier) {
    return false;
  }

  if (ts.isBindingElement(parent) && parent.name === identifier) {
    return false;
  }

  return true;
}

function importBindingsUsedOnlyInServerExecutionRegions(
  sourceFile: ts.SourceFile,
  importDeclaration: ts.ImportDeclaration
): boolean {
  const bindingNames = new Set(importedBindingNames(importDeclaration));
  if (bindingNames.size === 0) {
    return false;
  }

  const serverRegions = collectTransitiveServerExecutionRegions(sourceFile);
  let sawReference = false;

  walkSyntaxTree(sourceFile, (node) => {
    if (!ts.isIdentifier(node) || !bindingNames.has(node.text)) {
      return;
    }
    if (!isIdentifierReference(node)) {
      return;
    }
    sawReference = true;
    if (!isNodeInsideRegion(node, serverRegions)) {
      bindingNames.clear();
    }
  });

  return sawReference && bindingNames.size > 0;
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
  if (filePath.endsWith(".server.ts")) {
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

    if (isAllowlistedNodeBuiltinImport(filePath, specifier)) {
      continue;
    }

    const line =
      sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    violations.push({ filePath, line, specifier });
  }

  return violations;
}

/** Return top-level value imports of server-only modules in one source file. */
export function findTopLevelServerOnlyImportViolations(
  sourceText: string,
  filePath: string,
  projectRoot: string
): ClientImportGraphViolation[] {
  const sourceFile = parseTypeScriptSource(sourceText, filePath);
  const violations: ClientImportGraphViolation[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || isTypeOnlyImport(statement)) {
      continue;
    }

    const specifier = moduleSpecifierText(statement);
    if (!specifier) {
      continue;
    }

    const resolved = resolveProjectModule(specifier, filePath, projectRoot);
    if (!resolved || !isServerOnlyModule(resolved)) {
      continue;
    }

    if (isAllowlistedServerOnlyValueImport(filePath, specifier)) {
      continue;
    }

    if (importBindingsUsedOnlyInServerExecutionRegions(sourceFile, statement)) {
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

function shouldTraverseResolvedModule(resolved: string): boolean {
  return !isServerOnlyModule(resolved);
}

/** Walk the route-tree import graph and flag client-reachable import leaks. */
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
      ...findTopLevelNodeBuiltinImports(source.sourceText, source.filePath),
      ...findTopLevelServerOnlyImportViolations(
        source.sourceText,
        source.filePath,
        projectRoot
      )
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
      if (
        resolved &&
        shouldTraverseResolvedModule(resolved) &&
        !visited.has(resolved)
      ) {
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
