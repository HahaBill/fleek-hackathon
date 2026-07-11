import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3001";

// The OpenAI key lives in the repo-root .env (shared with packages/*). Next
// only auto-loads web/.env*, so pull the root file into the server process
// here; without it the summary route just uses the template composer.
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // no .env — fine
}

const nextConfig: NextConfig = {
  transpilePackages: ["@fleek/shared", "@fleek/voice-client"],
  turbopack: {
    root: repoRoot,
  },
  async rewrites() {
    return [
      {
        source: "/api/session/:path*",
        destination: `${SERVER_URL}/api/session/:path*`,
      },
      {
        source: "/ws/session/:path*",
        destination: `${SERVER_URL}/ws/session/:path*`,
      },
    ];
  },
};

export default nextConfig;
