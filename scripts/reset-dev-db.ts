import "./load-env.ts";
import { resolveDbPath } from "../src/db/paths";
import { recoverDevDatabase } from "../src/db/recover-dev-database";

const force = process.argv.includes("--force");
const dbPath = resolveDbPath();

try {
  recoverDevDatabase({ dbPath, force });
  console.log(`Database recovered: ${dbPath}`);
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
    const { recoveryHint } = error as { recoveryHint?: string };
    if (recoveryHint) {
      console.error(recoveryHint);
    }
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
