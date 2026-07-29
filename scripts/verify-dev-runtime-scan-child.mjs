import { scanClientImportGraphViolations } from "../tests/unit/client-import-graph-scan.ts";

const violations = scanClientImportGraphViolations(process.cwd());
const flagged = violations.some(
  (violation) =>
    violation.filePath === "src/lib/blog-api.ts" &&
    violation.specifier === "node:fs"
);

if (!flagged) {
  console.error("scan did not flag src/lib/blog-api.ts");
  process.exit(1);
}
