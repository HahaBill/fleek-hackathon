import { fileURLToPath } from "node:url";

// Load the repo-root .env (OPENAI_API_KEY) so the live smoke test can run
// without exporting anything by hand. Absent file = fine, tests still run.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // no .env — mocked tests don't need it
}
