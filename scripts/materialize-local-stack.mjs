#!/usr/bin/env node
/**
 * Writes a full Ploybundle stack into local-dev/ (compose, .env, app, hub, directus seeds, …).
 * Mimics what a user gets after init + generated artifacts, for local docker compose.
 *
 * Usage: node scripts/materialize-local-stack.mjs
 * Then:  pnpm run docker:up   (recommended)   or   cd local-dev && docker compose up -d --build
 * Ploybundle stacks are intended to run only via Docker Compose, not as hand-started services.
 *
 * Secrets (Postgres/Redis/Directus/…) are stable: stored under local-dev/.ploybundle-state/local/secrets.json
 * (gitignored) and reused on every materialize so .env matches existing Docker volumes.
 * Fresh DB + new secrets: delete that file and run: cd local-dev && docker compose down -v && docker compose up -d
 *
 * URLs (host, prefer 127.0.0.1): App :3001, Hub :7580, Directus :8055, Windmill :8000, Seaweed S3 :8333 / UI :9333, Adminer :8088
 *
 * Stack seeds follow `preset` in local-dev-stack-config.mjs (default crud-saas). Hub uses the platform shell from the artifact renderer (preset-agnostic).
 * Also copies fixtures/local-demo/ploybundle.yaml → local-dev/ploybundle.yaml so you can run `ploybundle open localdev` from local-dev/ like a real project config.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getLocalDevStackConfig } from "./local-dev-stack-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localDev = join(root, "local-dev");

let config = getLocalDevStackConfig();

const nonInteractive =
  process.env.CI === "1" ||
  process.env.PLOYBUNDLE_NON_INTERACTIVE === "1" ||
  process.argv.includes("--yes");

if (!nonInteractive && input.isTTY) {
  const rl = createInterface({ input, output });
  try {
    const dn = (await rl.question("Hub display name [Local dev]: ")).trim();
    const ru = (await rl.question("Repository URL (optional, Enter to skip): ")).trim();
    config = {
      ...config,
      hubPresentation: {
        displayName: dn || "Local dev",
        repositoryUrl: ru || "",
      },
    };
  } finally {
    rl.close();
  }
}

execSync("pnpm turbo run build --filter=@ploybundle/templates...", {
  cwd: root,
  stdio: "inherit",
});

const artifactUrl = pathToFileURL(join(root, "packages/templates/dist/renderer/artifact-renderer.js")).href;
const coreUrl = pathToFileURL(join(root, "packages/core/dist/index.js")).href;

const { StackArtifactRenderer } = await import(artifactUrl);
const { SecretsManager, SshService } = await import(coreUrl);

const secretsMgr = new SecretsManager(new SshService());
const { secrets, isNew } = secretsMgr.loadOrGenerateLocal(localDev);
if (isNew) {
  secretsMgr.persistLocal(localDev, secrets);
}
const env = secretsMgr.buildEnvMap(secrets, config);

const renderer = new StackArtifactRenderer();
const artifacts = renderer.render(config, env);
writeFileSync(join(localDev, "docker-compose.yml"), artifacts.composeFile, "utf-8");
writeFileSync(join(localDev, ".env"), artifacts.envFiles[".env"], "utf-8");

for (const [relPath, content] of Object.entries(artifacts.configs)) {
  const out = join(localDev, relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content, "utf-8");
}

const hubRouteGroupStale = join(localDev, "hub/src/app/(hub)");
if (existsSync(hubRouteGroupStale)) {
  rmSync(hubRouteGroupStale, { recursive: true });
}

const demoPloybundleYaml = join(root, "fixtures/local-demo/ploybundle.yaml");
if (existsSync(demoPloybundleYaml)) {
  copyFileSync(demoPloybundleYaml, join(localDev, "ploybundle.yaml"));
}

const top = readdirSync(localDev).filter((n) => !n.startsWith("."));
console.log(
  "\n✓ Materialized full stack under local-dev/ (" +
    top.length +
    " top-level entries).\n" +
    (isNew
      ? "  Secrets saved to .ploybundle-state/local/secrets.json (generated or migrated from .env; stable on later runs).\n"
      : "") +
    "  App: http://127.0.0.1:3001  Hub: http://127.0.0.1:7580\n" +
    "  Next: cd local-dev && docker compose up -d --build\n" +
    "  First build can take several minutes (images + Next.js build).\n"
);
