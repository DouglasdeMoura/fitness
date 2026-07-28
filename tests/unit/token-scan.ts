import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Rules enforced by the token-compliance ratchet (issue #50). */
export const TOKEN_RULES = [
  "rawHex",
  "inlineStyle",
  "className",
  "layoutDiv",
] as const;

export type TokenRule = (typeof TOKEN_RULES)[number];

export type TokenViolationCounts = Partial<Record<TokenRule, number>>;

export type TokenScanResult = Record<string, TokenViolationCounts>;

const SCAN_ROOTS = ["src/routes", "src/components"] as const;

const RULE_PATTERNS: Record<TokenRule, RegExp> = {
  className: /\bclassName=/,
  inlineStyle: /style=\{\{/,
  layoutDiv: /<div\b/,
  rawHex: /#[0-9a-fA-F]{3,8}\b/,
};

/** Browser metadata colours that must stay literal hex (issue #50 allowlist). */
const HEX_ALLOWLIST: { file: string; pattern: RegExp }[] = [
  {
    file: "src/routes/__root.tsx",
    pattern: /theme-color/,
  },
];

function listTsxFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsxFiles(fullPath));
      continue;
    }
    if (entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isHexAllowlisted(filePath: string, line: string): boolean {
  return HEX_ALLOWLIST.some(
    (entry) => filePath === entry.file && entry.pattern.test(line)
  );
}

function countRuleViolations(
  lines: string[],
  rule: TokenRule,
  filePath: string
): number {
  const pattern = RULE_PATTERNS[rule];
  let count = 0;
  for (const line of lines) {
    if (!pattern.test(line)) {
      continue;
    }
    if (rule === "rawHex" && isHexAllowlisted(filePath, line)) {
      continue;
    }
    count += 1;
  }
  return count;
}

/** Scan routes and components for token-compliance violations. */
export function scanTokenViolations(
  projectRoot = process.cwd()
): TokenScanResult {
  const result: TokenScanResult = {};

  for (const root of SCAN_ROOTS) {
    const absoluteRoot = join(projectRoot, root);
    for (const file of listTsxFiles(absoluteRoot)) {
      const relativePath = relative(projectRoot, file).replaceAll("\\", "/");
      const lines = readFileSync(file, "utf-8").split("\n");
      const fileCounts: TokenViolationCounts = {};

      for (const rule of TOKEN_RULES) {
        const count = countRuleViolations(lines, rule, relativePath);
        if (count > 0) {
          fileCounts[rule] = count;
        }
      }

      if (Object.keys(fileCounts).length > 0) {
        result[relativePath] = fileCounts;
      }
    }
  }

  return result;
}
