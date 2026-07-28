import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_PATH || "./data/fittrack.db",
  },
  dialect: "sqlite",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
