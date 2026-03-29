#!/usr/bin/env node
/**
 * Writes packages/templates hub-renderer output into local-dev/hub for docker-compose.
 * Uses the same stack URLs and platform hub as materialize-local-stack.mjs.
 *
 * Run from repo root: node scripts/sync-local-dev-hub.mjs
 * Requires: pnpm build (or at least shared + core + templates compiled).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLocalDevStackConfig } from "./local-dev-stack-config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

execSync("pnpm turbo run build --filter=@ploybundle/templates...", {
  cwd: root,
  stdio: "inherit",
});

const hubRendererUrl = pathToFileURL(
  join(root, "packages/templates/dist/renderer/hub-renderer.js")
).href;
const platformHubUrl = pathToFileURL(
  join(root, "packages/templates/dist/presets/platform-hub-board.js")
).href;

const { renderHubBundle } = await import(hubRendererUrl);
const { PLATFORM_HUB_BOARD } = await import(platformHubUrl);

const config = getLocalDevStackConfig();
const hubRouteGroupStale = join(root, "local-dev/hub/src/app/(hub)");
if (existsSync(hubRouteGroupStale)) {
  rmSync(hubRouteGroupStale, { recursive: true });
}

const files = renderHubBundle(config, PLATFORM_HUB_BOARD);
for (const [relPath, content] of Object.entries(files)) {
  const out = join(root, "local-dev", relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content, "utf-8");
}

console.log(`Wrote ${Object.keys(files).length} files under local-dev/hub/`);
