import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    coverage: {
      exclude: ["src/lib/api.ts", "src/lib/db.ts"],
      include: ["src/lib/**/*.ts"],
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
    },
    environment: "node",
    exclude: ["tests/e2e/**", "node_modules/**"],
    hookTimeout: 15_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 30_000,
  },
});
