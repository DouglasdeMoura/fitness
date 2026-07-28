import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";

export type ValidationGateRule = "identity-validator" | "stray-zod-import";

export interface ValidationGateViolation {
  filePath: string;
  line: number;
  rule: ValidationGateRule;
}

interface RelativeSource {
  filePath: string;
  sourceText: string;
}

const SOURCE_EXTENSIONS: Record<string, true> = {
  ".cjs": true,
  ".js": true,
  ".jsx": true,
  ".mjs": true,
  ".ts": true,
  ".tsx": true,
};
const OWNED_SCHEMA_DIRECTORY = "src/lib/schemas/";
const RULE_FAILURE_MESSAGE: Record<ValidationGateRule, string> = {
  "identity-validator": "identity validator returns its argument unchanged",
  "stray-zod-import": 'direct Zod imports must stay under "src/lib/schemas/"',
};

function parseTypeScriptSource(
  sourceText: string,
  filePath: string
): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}

function walkSyntaxTree(
  node: ts.Node,
  visit: (candidate: ts.Node) => void
): void {
  visit(node);
  node.forEachChild((child) => walkSyntaxTree(child, visit));
}

function identityReturnExpression(
  validator: ts.ArrowFunction | ts.FunctionExpression
): ts.Expression | undefined {
  if (!ts.isBlock(validator.body)) {
    return validator.body;
  }
  if (validator.body.statements.length !== 1) {
    return undefined;
  }
  const [statement] = validator.body.statements;
  return statement && ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
}

function unwrapRuntimeIdentity(expression: ts.Expression): ts.Expression {
  let candidate = expression;
  while (
    ts.isParenthesizedExpression(candidate) ||
    ts.isAsExpression(candidate) ||
    ts.isTypeAssertionExpression(candidate) ||
    ts.isSatisfiesExpression(candidate) ||
    ts.isNonNullExpression(candidate)
  ) {
    candidate = candidate.expression;
  }
  return candidate;
}

function directValidatorFunction(
  node: ts.Node
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isPropertyAccessExpression(node.expression)
  ) {
    return undefined;
  }
  if (
    node.expression.name.text !== "validator" ||
    node.arguments.length !== 1
  ) {
    return undefined;
  }
  const [validator] = node.arguments;
  return validator &&
    (ts.isArrowFunction(validator) || ts.isFunctionExpression(validator))
    ? validator
    : undefined;
}

function isIdentityValidatorCall(node: ts.Node): node is ts.CallExpression {
  const validator = directValidatorFunction(node);
  if (!validator || validator.parameters.length !== 1) {
    return false;
  }
  const [parameter] = validator.parameters;
  const returned = identityReturnExpression(validator);
  if (!parameter || !ts.isIdentifier(parameter.name) || !returned) {
    return false;
  }
  const unwrappedReturn = unwrapRuntimeIdentity(returned);
  return (
    ts.isIdentifier(unwrappedReturn) &&
    unwrappedReturn.text === parameter.name.text
  );
}

function declaredModuleSpecifier(node: ts.Node): ts.StringLiteral | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (!ts.isImportEqualsDeclaration(node)) {
    return undefined;
  }
  const reference = node.moduleReference;
  return ts.isExternalModuleReference(reference) &&
    reference.expression &&
    ts.isStringLiteral(reference.expression)
    ? reference.expression
    : undefined;
}

function requiredModuleSpecifier(node: ts.Node): ts.StringLiteral | undefined {
  if (
    !ts.isCallExpression(node) ||
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== "require"
  ) {
    return undefined;
  }
  const [argument] = node.arguments;
  return argument && ts.isStringLiteral(argument) ? argument : undefined;
}

function listSourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS[extname(entry.name)]) {
      files.push(fullPath);
    }
  }
  return files;
}

function violationAt(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  filePath: string,
  rule: ValidationGateRule
): ValidationGateViolation {
  const { line } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  return { filePath, line: line + 1, rule };
}

function readRelativeSource(
  projectRoot: string,
  absolutePath: string
): RelativeSource {
  const filePath = relative(projectRoot, absolutePath).replaceAll("\\", "/");
  return { filePath, sourceText: readFileSync(absolutePath, "utf-8") };
}

/** Find identity functions passed directly to `.validator()` calls. */
export function findIdentityValidatorViolations(
  sourceText: string,
  filePath: string
): ValidationGateViolation[] {
  const sourceFile = parseTypeScriptSource(sourceText, filePath);
  const violations: ValidationGateViolation[] = [];
  walkSyntaxTree(sourceFile, (node) => {
    if (isIdentityValidatorCall(node)) {
      violations.push(
        violationAt(
          sourceFile,
          node.expression.name,
          filePath,
          "identity-validator"
        )
      );
    }
  });
  return violations;
}

/** Find direct Zod imports outside the project-owned schemas directory. */
export function findStrayZodImportViolations(
  sourceText: string,
  filePath: string
): ValidationGateViolation[] {
  if (filePath.replaceAll("\\", "/").startsWith(OWNED_SCHEMA_DIRECTORY)) {
    return [];
  }
  const sourceFile = parseTypeScriptSource(sourceText, filePath);
  const violations: ValidationGateViolation[] = [];
  walkSyntaxTree(sourceFile, (node) => {
    const moduleSpecifier =
      declaredModuleSpecifier(node) ?? requiredModuleSpecifier(node);
    if (moduleSpecifier?.text === "zod") {
      violations.push(
        violationAt(sourceFile, node, filePath, "stray-zod-import")
      );
    }
  });
  return violations;
}

/** Format one actionable gate failure with its source location. */
export function formatValidationGateViolation(
  violation: ValidationGateViolation
): string {
  return `${violation.filePath}:${violation.line} ${RULE_FAILURE_MESSAGE[violation.rule]}`;
}

/** Scan the repository paths guarded by validation issue #74. */
export function scanValidationGateViolations(
  projectRoot: string
): ValidationGateViolation[] {
  const apiPath = join(projectRoot, "src/lib/api.ts");
  const apiSource = readRelativeSource(projectRoot, apiPath);
  const violations = findIdentityValidatorViolations(
    apiSource.sourceText,
    apiSource.filePath
  );
  const sourceFiles = listSourceFiles(join(projectRoot, "src")).sort();
  for (const sourcePath of sourceFiles) {
    const source =
      sourcePath === apiPath
        ? apiSource
        : readRelativeSource(projectRoot, sourcePath);
    violations.push(
      ...findStrayZodImportViolations(source.sourceText, source.filePath)
    );
  }
  return violations;
}
