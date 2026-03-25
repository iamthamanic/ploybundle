import type { ProjectConfig, ProjectUrls, HomarrBoardConfig } from "@ploybundle/shared";
import { buildProjectUrls } from "@ploybundle/shared";

// ---------------------------------------------------------------------------
// Public API — consumed by artifact-renderer and orchestrator
// ---------------------------------------------------------------------------

/** Render the complete Homarr v1.0 artifact bundle for deployment. */
export function renderHomarrBundle(config: ProjectConfig, board: HomarrBoardConfig): Record<string, string> {
  const urls = buildProjectUrls(config.domain);
  const resolvedBoard = resolveBoard(board, urls);

  return {
    "homarr/seed/board-provision.json": renderBoardProvisionPayload(config, resolvedBoard),
    "homarr/seed/apps.json": renderAppsPayload(resolvedBoard),
    "homarr/seed/board-settings.json": renderBoardSettingsPayload(resolvedBoard),
    "scripts/bootstrap-homarr.sh": renderBootstrapScript(config),
    "scripts/homarr-api-provision.mjs": renderProvisionScript(),
  };
}

/** Render just the board model JSON (for status / inspect commands). */
export function renderHomarrBoardJson(config: ProjectConfig, board: HomarrBoardConfig): string {
  const urls = buildProjectUrls(config.domain);
  return renderBoardProvisionPayload(config, resolveBoard(board, urls));
}

// Keep old function names as aliases for backward compatibility
export function renderHomepageConfig(config: ProjectConfig, board: HomarrBoardConfig): string {
  return renderHomarrBoardJson(config, board);
}

export function renderFullHomepageBundle(config: ProjectConfig, board: HomarrBoardConfig): Record<string, string> {
  return renderHomarrBundle(config, board);
}

// ---------------------------------------------------------------------------
// Template URL resolution
// ---------------------------------------------------------------------------

function resolveTemplate(template: string, urls: ProjectUrls): string {
  return template
    .replace(/\{\{urls\.app\}\}/g, urls.app)
    .replace(/\{\{urls\.admin\}\}/g, urls.admin)
    .replace(/\{\{urls\.storage\}\}/g, urls.storage)
    .replace(/\{\{urls\.functions\}\}/g, urls.functions)
    .replace(/\{\{urls\.deploy\}\}/g, urls.deploy)
    .replace(/\{\{urls\.dashboard\}\}/g, urls.dashboard);
}

function resolveBoard(board: HomarrBoardConfig, urls: ProjectUrls): HomarrBoardConfig {
  return {
    ...board,
    apps: board.apps.map((app) => ({
      ...app,
      href: resolveTemplate(app.href, urls),
      pingUrl: app.pingUrl ? resolveTemplate(app.pingUrl, urls) : undefined,
    })),
    widgets: board.widgets.map((w) => ({
      ...w,
      config: Object.fromEntries(
        Object.entries(w.config).map(([k, v]) => [
          k,
          typeof v === "string" ? resolveTemplate(v, urls) : v,
        ])
      ),
    })),
  };
}

// ---------------------------------------------------------------------------
// Homarr v1.0 tRPC API payload generators
// ---------------------------------------------------------------------------

function renderBoardProvisionPayload(config: ProjectConfig, board: HomarrBoardConfig): string {
  const sections = board.sections.map((section, i) => ({
    id: `section-${i}`,
    kind: section.kind,
    name: section.title,
    collapsed: section.collapsed ?? false,
    position: i,
  }));

  const items = board.widgets.map((widget, i) => ({
    id: `widget-${i}`,
    kind: widget.kind,
    options: { title: widget.title, ...widget.config },
    sectionId: sections.find((s) => s.name === widget.section)?.id ?? sections[0]?.id,
    layout: widget.grid ?? { x: 0, y: i, width: 10, height: 2 },
  }));

  return JSON.stringify(
    {
      board: {
        name: `${config.projectName}-hub`,
        columnCount: 10,
        isPublic: false,
      },
      settings: {
        pageTitle: board.title,
        metaTitle: `${board.title} — Ploybundle`,
        primaryColor: board.theme.primaryColor,
        secondaryColor: board.theme.secondaryColor,
        opacity: board.theme.opacity,
        itemRadius: board.theme.itemRadius,
        customCss: board.theme.customCss ?? "",
        logoImageUrl: board.theme.logoImageUrl ?? "",
        faviconImageUrl: board.theme.faviconImageUrl ?? "",
        backgroundImageUrl: board.theme.backgroundImageUrl ?? "",
      },
      sections,
      items,
    },
    null,
    2
  );
}

function renderAppsPayload(board: HomarrBoardConfig): string {
  const apps = board.apps.map((app) => ({
    name: app.name,
    description: app.description,
    iconUrl: app.iconUrl,
    href: app.href,
    pingUrl: app.pingUrl ?? null,
  }));

  return JSON.stringify(apps, null, 2);
}

function renderBoardSettingsPayload(board: HomarrBoardConfig): string {
  return JSON.stringify(
    {
      primaryColor: board.theme.primaryColor,
      secondaryColor: board.theme.secondaryColor,
      opacity: board.theme.opacity,
      itemRadius: board.theme.itemRadius,
      customCss: board.theme.customCss ?? "",
      logoImageUrl: board.theme.logoImageUrl ?? "",
      faviconImageUrl: board.theme.faviconImageUrl ?? "",
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Provisioning scripts
// ---------------------------------------------------------------------------

function renderBootstrapScript(config: ProjectConfig): string {
  return `#!/usr/bin/env sh
set -eu

PROJECT_DIR="/opt/ploybundle"
HOMARR_URL="\${HOMARR_URL:-http://localhost:7575}"
HOMARR_API_KEY="\${HOMARR_API_KEY:-}"

echo "[ploybundle] bootstrapping Homarr board for ${config.projectName}"

if [ -z "$HOMARR_API_KEY" ]; then
  echo "[ploybundle] HOMARR_API_KEY not set — skipping API provisioning."
  echo "[ploybundle] Create an admin account at $HOMARR_URL, then generate an API key"
  echo "[ploybundle] under Settings > API and re-run this script."
  echo ""
  echo "[ploybundle] Seed files are at:"
  echo "  $PROJECT_DIR/homarr/seed/board-provision.json"
  echo "  $PROJECT_DIR/homarr/seed/apps.json"
  exit 0
fi

node "$PROJECT_DIR/scripts/homarr-api-provision.mjs" \\
  "$HOMARR_URL" "$HOMARR_API_KEY" \\
  "$PROJECT_DIR/homarr/seed/board-provision.json" \\
  "$PROJECT_DIR/homarr/seed/apps.json" \\
  "$PROJECT_DIR/homarr/seed/board-settings.json"

echo "[ploybundle] Homarr board provisioned successfully."
`;
}

function renderProvisionScript(): string {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [,, homarrUrl, apiKey, boardPath, appsPath, settingsPath] = process.argv;
if (!homarrUrl || !apiKey || !boardPath) {
  console.error("Usage: homarr-api-provision.mjs <homarrUrl> <apiKey> <boardJson> [appsJson] [settingsJson]");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", ApiKey: apiKey };

async function trpc(procedure, input) {
  const res = await fetch(\`\${homarrUrl}/api/trpc/\${procedure}?batch=1\`, {
    method: "POST",
    headers,
    body: JSON.stringify({ "0": { json: input } }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(\`trpc \${procedure} failed: \${res.status} \${text}\`);
  }
  const data = await res.json();
  return data[0]?.result?.data?.json ?? data;
}

async function main() {
  const payload = JSON.parse(readFileSync(boardPath, "utf-8"));

  // 1. Create board
  console.log("[ploybundle] Creating board...");
  let boardId;
  try {
    const result = await trpc("board.createBoard", payload.board);
    boardId = result?.id;
    console.log(\`[ploybundle] Board created: \${boardId ?? "(id not returned)"}\`);
  } catch (err) {
    console.warn("[ploybundle] Board creation failed, trying to find existing...", err.message);
    try {
      const existing = await trpc("board.getBoardByName", { name: payload.board.name });
      boardId = existing?.id;
      console.log(\`[ploybundle] Found existing board: \${boardId}\`);
    } catch { /* board lookup also failed — continue without ID */ }
  }

  // 2. Save board layout (sections + items)
  if (boardId && payload.sections && payload.items) {
    console.log("[ploybundle] Saving board layout...");
    try {
      await trpc("board.saveBoard", {
        id: boardId,
        sections: payload.sections,
        items: payload.items,
      });
      console.log("[ploybundle] Board layout saved.");
    } catch (err) {
      console.warn("[ploybundle] Layout save failed:", err.message);
    }
  }

  // 3. Apply board settings (theme, CSS)
  if (boardId && settingsPath) {
    console.log("[ploybundle] Applying board settings...");
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      await trpc("board.savePartialBoardSettings", { id: boardId, ...settings });
      console.log("[ploybundle] Board settings applied.");
    } catch (err) {
      console.warn("[ploybundle] Settings apply failed:", err.message);
    }
  }

  // 4. Create apps
  if (appsPath) {
    console.log("[ploybundle] Creating apps...");
    try {
      const apps = JSON.parse(readFileSync(appsPath, "utf-8"));
      await trpc("app.createMany", apps);
      console.log(\`[ploybundle] \${apps.length} apps created.\`);
    } catch (err) {
      console.warn("[ploybundle] App creation failed:", err.message);
    }
  }

  // 5. Set as home board
  if (boardId) {
    console.log("[ploybundle] Setting as home board...");
    try {
      await trpc("board.setHomeBoard", { id: boardId });
      console.log("[ploybundle] Home board set.");
    } catch (err) {
      console.warn("[ploybundle] Set home board failed:", err.message);
    }
  }

  console.log("[ploybundle] Provisioning complete.");
}

main().catch((err) => {
  console.error("[ploybundle] provisioning error:", err);
  process.exit(1);
});
`;
}
