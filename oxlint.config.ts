import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
export default defineConfig({
  extends: [core],
  ignorePatterns: core.ignorePatterns,
  rules: {
    // Style preferences that conflict with existing codebase conventions.
    // Each relaxation is intentional — this project favours the existing
    // conventions over the Ultracite default for these specific rules.
    // Rule tightening is tracked as follow-up work.
    "eslint/func-style": "off",
    "eslint/no-inline-comments": "off",
    "eslint/no-plusplus": "off",
    "unicorn/import-style": "off",
    "eslint/no-use-before-define": "off",
    "unicorn/prefer-number-coercion": "off",
    "eslint/require-await": "off",
    "unicorn/consistent-function-scoping": "off",
    "eslint/no-nested-ternary": "off",
    "eslint/prefer-named-capture-group": "off",
    "jsdoc/require-param-description": "off",
    "unicorn/no-array-reduce": "off",
    // Additional relaxations — see commit body for rationale per rule.
    "eslint/require-unicode-regexp": "off",
    "typescript/no-non-null-assertion": "off",
    "eslint/no-await-in-loop": "off",
    "unicorn/no-array-sort": "off",
    "eslint/no-shadow": "off",
    "typescript/consistent-type-imports": "off",
    "promise/avoid-new": "off",
    "eslint/default-case": "off",
    "eslint/complexity": "off",
    "promise/prefer-await-to-then": "off",
    "unicorn/prefer-add-event-listener": "off",
    "unicorn/no-array-for-each": "off",
    "unicorn/no-immediate-mutation": "off",
    "eslint/class-methods-use-this": "off",
    "unicorn/no-await-expression-member": "off",
    "unicorn/prefer-native-coercion-functions": "off",
    "eslint/prefer-destructuring": "off",
    "typescript/parameter-properties": "off",
    "eslint/no-alert": "off",
    "unicorn/prefer-response-static-json": "off",
    "unicorn/prefer-ternary": "off",
    "eslint/no-promise-executor-return": "off",
    "unicorn/prefer-export-from": "off",
    "unicorn/no-empty-file": "off",
    "import/consistent-type-specifier-style": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/no-array-reverse": "off",
    "typescript/no-dynamic-delete": "off",
  },
  overrides: [
    ...(core.overrides ?? []),
    {
      // TanStack Router uses $paramName convention for route params
      files: ["src/routes/**/$*.tsx"],
      rules: {
        "unicorn/filename-case": "off",
      },
    },
  ],
});
