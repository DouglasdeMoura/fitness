import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  findIdentityValidatorViolations,
  findStrayZodImportViolations,
  formatValidationGateViolation,
  scanValidationGateViolations,
} from "./validation-gate-scan";
import type { ValidationGateViolation } from "./validation-gate-scan";

function expectNoGateViolations(violations: ValidationGateViolation[]): void {
  const failureDetails = violations
    .map(formatValidationGateViolation)
    .join("\n");
  expect(violations, failureDetails).toStrictEqual([]);
}

describe("validation source scanner (issue #74)", () => {
  it("finds an identity validator and reports its file and line", () => {
    const source = [
      'const endpoint = createServerFn({ method: "POST" })',
      "  .validator((data: { id: number }) => data)",
      "  .handler(() => null);",
    ].join("\n");

    const violations = findIdentityValidatorViolations(
      source,
      "src/lib/api.ts"
    );

    expect(violations).toStrictEqual([
      {
        filePath: "src/lib/api.ts",
        line: 2,
        rule: "identity-validator",
      },
    ]);
    expect(formatValidationGateViolation(violations[0]!)).toBe(
      "src/lib/api.ts:2 identity validator returns its argument unchanged"
    );
  });

  it("allows validators that parse their input", () => {
    const source =
      ".validator(serverInputValidator(deleteFoodLogEntryInputSchema))";

    expect(
      findIdentityValidatorViolations(source, "src/lib/api.ts")
    ).toStrictEqual([]);
  });

  it("finds ESM and CommonJS Zod imports outside schemas", () => {
    const source = [
      'import { createFileRoute } from "@tanstack/react-router";',
      'import { z } from "zod";',
      "const zod = require('zod');",
    ].join("\n");

    const violations = findStrayZodImportViolations(
      source,
      "src/routes/example.tsx"
    );

    expect(violations).toStrictEqual([
      {
        filePath: "src/routes/example.tsx",
        line: 2,
        rule: "stray-zod-import",
      },
      {
        filePath: "src/routes/example.tsx",
        line: 3,
        rule: "stray-zod-import",
      },
    ]);
    expect(formatValidationGateViolation(violations[0]!)).toBe(
      'src/routes/example.tsx:2 direct Zod imports must stay under "src/lib/schemas/"'
    );
  });

  it("allows direct Zod imports in the owned schemas directory", () => {
    const source = 'import { z } from "zod";';

    expect(
      findStrayZodImportViolations(source, "src/lib/schemas/common.ts")
    ).toStrictEqual([]);
  });
});

describe("validation repository gates (issue #74)", () => {
  const projectRoot = join(import.meta.dirname, "../..");
  const allViolations = scanValidationGateViolations(projectRoot);

  it("has no identity validators in src/lib/api.ts", () => {
    const violations = allViolations.filter(
      ({ rule }) => rule === "identity-validator"
    );
    expectNoGateViolations(violations);
  });

  it("keeps all direct Zod imports under src/lib/schemas", () => {
    const violations = allViolations.filter(
      ({ rule }) => rule === "stray-zod-import"
    );
    expectNoGateViolations(violations);
  });
});
