import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react],
  ignorePatterns: core.ignorePatterns,
  rules: {
    // ── Overrides for project conventions ──────────────────────────
    // Function declarations are idiomatic in React (TanStack Start file-based routing).
    "eslint/func-style": "off",
    // Regex flags not required in all test patterns.
    "eslint/require-unicode-regexp": "off",
    // Child components defined after parent is the React convention.
    "eslint/no-use-before-define": "off",
    // Async functions without await are common in API route signatures.
    "eslint/require-await": "off",
    // parseInt/parseFloat are explicit and intentional in this codebase.
    "unicorn/prefer-number-coercion": "off",
    // Non-null assertions are widely used; migrating requires careful refactoring.
    "typescript/no-non-null-assertion": "off",
    // Inline comments carry science citations and provenance notes.
    "eslint/no-inline-comments": "off",
    // ++ is common for counters in this codebase.
    "eslint/no-plusplus": "off",
    // Import style conventions differ across modules.
    "unicorn/import-style": "off",
    // Sequential awaits are necessary for ordered DB operations.
    "eslint/no-await-in-loop": "off",
    // Function scoping decisions are intentional.
    "unicorn/consistent-function-scoping": "off",
    // Named capture groups not required in all regex patterns.
    "eslint/prefer-named-capture-group": "off",
    // React Compiler rules are suggestions, not errors.
    "react/react-compiler": "off",
    // Nested ternaries are sometimes clearer than alternatives.
    "eslint/no-nested-ternary": "off",
    // Duplicate rule from unicorn plugin — same rationale as above.
    "unicorn/no-nested-ternary": "off",
    // Array sort/reduce/reduce are intentionally used.
    "unicorn/no-array-sort": "off",
    "unicorn/no-array-reduce": "off",
    "unicorn/no-array-for-each": "off",
    // JSDoc param descriptions not required for all functions.
    "jsdoc/require-param-description": "off",
    // import() type annotations used for lazy-loaded types.
    "typescript/consistent-type-imports": "off",
    // new Promise used for wrapping callback-based APIs.
    "promise/avoid-new": "off",
    // .then() used for non-critical promise chains.
    "promise/prefer-await-to-then": "off",
    // clickAction is an Astryx DS component prop name.
    "react/jsx-handler-names": "off",
    // TanStack Start dynamic route params ($param.tsx).
    "unicorn/filename-case": "off",
    // Inline event handlers for simple cases.
    "unicorn/prefer-add-event-listener": "off",
    // await + property access for dynamic imports.
    "unicorn/no-await-expression-member": "off",
    // Class methods used through interfaces.
    "eslint/class-methods-use-this": "off",
    // Immediate mutation in initialization.
    "unicorn/no-immediate-mutation": "off",
    // Complexity warnings, not errors.
    // Simple if/else with JSX blocks — ternary would be unreadable.
    "unicorn/prefer-ternary": "off",
    "eslint/complexity": "off",
  },
});
