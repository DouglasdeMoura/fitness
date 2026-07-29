import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";

/** Deliberately public server functions and why they skip requireAuth (issue #84). */
export const PUBLIC_SERVER_FUNCTIONS = {
  fetchServerSession:
    "Route beforeLoad guard reads the Better Auth session without one",
  getAuthPageConfig:
    "Sign-in and sign-up pages need GitHub OAuth availability before auth",
  getBlogPostBySlug: "Marketing blog post pages are public",
  listBlogPosts: "Marketing blog index is public",
} as const satisfies Record<string, string>;

/** execute* helpers in auth-enforcement-handlers.server that call requireAuth. */
export const AUTH_DELEGATED_EXECUTE_HANDLERS = new Set([
  "executeAddWorkoutSet",
  "executeDeleteWorkoutSet",
  "executeGetSyncedClientIds",
  "executeStartWorkoutFromProgram",
  "executeUnsubscribePush",
]);

export type ServerFnAuthRule = "missing-auth" | "stale-allowlist";

export interface ServerFnAuthViolation {
  filePath: string;
  line: number;
  name: string;
  rule: ServerFnAuthRule;
}

const SOURCE_EXTENSIONS: Record<string, true> = {
  ".ts": true,
  ".tsx": true,
};

const RULE_FAILURE_MESSAGE: Record<ServerFnAuthRule, string> = {
  "missing-auth":
    "createServerFn export must call requireAuth() or appear in PUBLIC_SERVER_FUNCTIONS",
  "stale-allowlist":
    "PUBLIC_SERVER_FUNCTIONS entry no longer matches a createServerFn export",
};

interface RelativeSource {
  filePath: string;
  sourceText: string;
}

export interface ServerFnExport {
  filePath: string;
  handler: ts.ArrowFunction | ts.FunctionExpression;
  line: number;
  name: string;
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

function walkSyntaxTree(
  node: ts.Node,
  visit: (candidate: ts.Node) => void
): void {
  visit(node);
  ts.forEachChild(node, (child) => walkSyntaxTree(child, visit));
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  );
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

function isCreateServerFnExport(initializer: ts.Expression): boolean {
  const root = chainRoot(initializer);
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

function handlerCallsRequireAuth(
  handler: ts.ArrowFunction | ts.FunctionExpression
): boolean {
  let found = false;
  walkSyntaxTree(handler, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "requireAuth"
    ) {
      found = true;
    }
  });
  return found;
}

function handlerDelegatesToAuthEnforcement(
  handler: ts.ArrowFunction | ts.FunctionExpression
): boolean {
  let found = false;
  walkSyntaxTree(handler, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
      return;
    }
    if (AUTH_DELEGATED_EXECUTE_HANDLERS.has(node.expression.text)) {
      found = true;
    }
  });
  return found;
}

function listSourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(absolutePath, files);
      continue;
    }
    const extension = extname(entry.name);
    if (SOURCE_EXTENSIONS[extension]) {
      files.push(absolutePath);
    }
  }
  return files;
}

function readRelativeSource(
  projectRoot: string,
  absolutePath: string
): RelativeSource {
  const filePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");
  return { filePath, sourceText: readFileSync(absolutePath, "utf-8") };
}

/** Find every exported createServerFn binding in one source file. */
export function findCreateServerFnExports(
  sourceText: string,
  filePath: string
): ServerFnExport[] {
  const sourceFile = parseTypeScriptSource(sourceText, filePath);
  const exports: ServerFnExport[] = [];

  walkSyntaxTree(sourceFile, (node) => {
    if (!ts.isVariableStatement(node) || !hasExportModifier(node)) {
      return;
    }

    for (const declaration of node.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      if (!isCreateServerFnExport(declaration.initializer)) {
        continue;
      }

      const handler = resolveHandlerFunction(declaration.initializer);
      if (!handler) {
        continue;
      }

      const line =
        sourceFile.getLineAndCharacterOfPosition(declaration.name.getStart())
          .line + 1;
      exports.push({
        filePath,
        handler,
        line,
        name: declaration.name.text,
      });
    }
  });

  return exports;
}

function isPublicServerFunction(
  name: string
): name is keyof typeof PUBLIC_SERVER_FUNCTIONS {
  return Object.hasOwn(PUBLIC_SERVER_FUNCTIONS, name);
}

/** Return auth gate violations for one source file. */
export function findServerFnAuthViolations(
  sourceText: string,
  filePath: string
): ServerFnAuthViolation[] {
  const violations: ServerFnAuthViolation[] = [];

  for (const serverFn of findCreateServerFnExports(sourceText, filePath)) {
    if (isPublicServerFunction(serverFn.name)) {
      continue;
    }

    const authenticated =
      handlerCallsRequireAuth(serverFn.handler) ||
      handlerDelegatesToAuthEnforcement(serverFn.handler);

    if (!authenticated) {
      violations.push({
        filePath: serverFn.filePath,
        line: serverFn.line,
        name: serverFn.name,
        rule: "missing-auth",
      });
    }
  }

  return violations;
}

/** Format one actionable gate failure with its source location. */
export function formatServerFnAuthViolation(
  violation: ServerFnAuthViolation
): string {
  const reason = RULE_FAILURE_MESSAGE[violation.rule];
  if (violation.rule === "stale-allowlist") {
    return `${violation.name}: ${reason}`;
  }
  return `${violation.filePath}:${violation.line} ${violation.name} ${reason}`;
}

/** Scan every createServerFn export under src/ for auth enforcement (issue #84). */
export function scanServerFnAuthViolations(
  projectRoot: string
): ServerFnAuthViolation[] {
  const sourceRoot = join(projectRoot, "src");
  const exportsByName = new Map<string, ServerFnExport>();
  const violations: ServerFnAuthViolation[] = [];

  for (const absolutePath of listSourceFiles(sourceRoot).sort()) {
    const source = readRelativeSource(projectRoot, absolutePath);
    const fileExports = findCreateServerFnExports(
      source.sourceText,
      source.filePath
    );
    violations.push(
      ...findServerFnAuthViolations(source.sourceText, source.filePath)
    );
    for (const serverFn of fileExports) {
      exportsByName.set(serverFn.name, serverFn);
    }
  }

  for (const allowlistedName of Object.keys(PUBLIC_SERVER_FUNCTIONS)) {
    if (!exportsByName.has(allowlistedName)) {
      violations.push({
        filePath: "tests/unit/server-fn-auth-scan.ts",
        line: 0,
        name: allowlistedName,
        rule: "stale-allowlist",
      });
    }
  }

  return violations;
}
