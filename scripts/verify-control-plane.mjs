#!/usr/bin/env node
/**
 * Deterministic verification: generated Ploybundle Hub must compile (Next.js production build).
 *
 * Steps:
 * 1. Build @ploybundle/templates and its dependencies (via turbo filter ...).
 * 2. Render the hub bundle with the same reference config as local-dev.
 * 3. Assert required control-plane files/snippets exist in the render output.
 * 4. npm install + npm run build in a temporary directory (does not modify local-dev/).
 *
 * Usage (repo root): pnpm run verify:control-plane
 * CI: compatible with CI=1 (no interactive prompts).
 */
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const configMod = pathToFileURL(join(root, "scripts/local-dev-stack-config.mjs")).href;

const { renderHubBundle } = await import(hubRendererUrl);
const { PLATFORM_HUB_BOARD } = await import(platformHubUrl);
const { getLocalDevStackConfig } = await import(configMod);

const stackConfig = getLocalDevStackConfig();
const board = {
  ...PLATFORM_HUB_BOARD,
  displayName: stackConfig.hubPresentation?.displayName ?? PLATFORM_HUB_BOARD.displayName,
  repositoryUrl: stackConfig.hubPresentation?.repositoryUrl ?? "",
};
const files = renderHubBundle(stackConfig, board);

/** Static contract: these files must be present in every generated hub (control-plane baseline). */
const REQUIRED_SNIPPETS = [
  ["hub/src/lib/hub-action-auth.ts", "assertHubActionAllowed"],
  ["hub/src/lib/stack-control.ts", "restartComposeService"],
  ["hub/src/app/api/actions/restart-service/route.ts", "restartComposeService"],
  ["hub/src/app/api/auth/hub-session/route.ts", "hubSessionCookieValue"],
  ["hub/src/app/api/audit-log/route.ts", "ploybundle_hub_audit"],
  ["hub/src/components/module-control-surface.tsx", "ModuleActionButton"],
  ["hub/src/app/projects/page.tsx", "projectsRegistry"],
];

for (const [pathKey, needle] of REQUIRED_SNIPPETS) {
  const body = files[pathKey];
  if (typeof body !== "string" || !body.includes(needle)) {
    console.error(`verify-control-plane: missing or invalid ${pathKey} (expected snippet: ${needle})`);
    process.exit(1);
  }
}

const tmpRoot = mkdtempSync(join(tmpdir(), "ploybundle-hub-verify-"));
const hubDir = join(tmpRoot, "hub");
try {
  for (const [relPath, content] of Object.entries(files)) {
    if (!relPath.startsWith("hub/")) continue;
    const rel = relPath.slice("hub/".length);
    const out = join(hubDir, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content, "utf-8");
  }

  execSync("npm install --no-audit --no-fund", {
    cwd: hubDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
  execSync("npm run build", {
    cwd: hubDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  console.log("\n✓ verify-control-plane: static contract + Next.js production build OK.\n");
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
