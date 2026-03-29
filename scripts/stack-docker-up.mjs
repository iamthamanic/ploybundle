#!/usr/bin/env node
/**
 * One command for beginners: verify Docker → materialize local-dev → compose up.
 * Ploybundle stacks are intended to run only via Docker Compose (not hand-started services).
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localDev = join(root, "local-dev");

function fail(msg, hint) {
  console.error("\n✖ " + msg);
  if (hint) console.error("  " + hint);
  console.error("");
  process.exit(1);
}

try {
  execSync("docker info", { stdio: "pipe" });
} catch {
  fail(
    "Docker is not running or not installed.",
    "Install Docker Desktop (macOS/Windows) or Docker Engine + Compose v2 (Linux): https://docs.docker.com/get-docker/"
  );
}

try {
  execSync("docker compose version", { stdio: "pipe" });
} catch {
  fail(
    "Docker Compose v2 is required.",
    "Use `docker compose` (plugin), not the old `docker-compose` binary alone."
  );
}

execSync("node scripts/materialize-local-stack.mjs", { cwd: root, stdio: "inherit" });

execSync("docker compose up -d --build", { cwd: localDev, stdio: "inherit" });

console.log(`
✓ Stack is starting in Docker. First run can take several minutes.

  Hub (dashboard)   http://127.0.0.1:7580
  App (Next.js)     http://127.0.0.1:3001

  See local-dev/.env for Directus admin credentials.
`);
