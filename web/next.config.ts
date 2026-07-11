import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// The OpenAI key lives in the repo-root .env (shared with packages/*). Next
// only auto-loads web/.env*, so pull the root file into the server process
// here; without it the summary route just uses the template composer.
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // no .env — fine
}

const nextConfig: NextConfig = {
  // Pin module resolution to the repo root (pnpm-lock.yaml). Turbopack
  // otherwise infers the root from stray lockfiles outside the repo and then
  // refuses to resolve the @fleek/* workspace packages.
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
