import { stringify as toYaml } from "yaml";
import type { ProjectConfig, ProjectUrls, HomepageLayoutConfig } from "@ploybundle/shared";
import { buildProjectUrls } from "@ploybundle/shared";

interface HomepageServices {
  [group: string]: Array<{
    name: string;
    href: string;
    description?: string;
    icon?: string;
    server?: string;
    widget?: {
      type: string;
      url?: string;
      [key: string]: unknown;
    };
  }>;
}

export function renderHomepageConfig(config: ProjectConfig, layout: HomepageLayoutConfig): string {
  return renderFullHomepageBundle(config, layout)["homarr-categories.yaml"] ?? "";
}

export function renderHomepageSettingsYaml(config: ProjectConfig, layout: HomepageLayoutConfig): string {
  const urls = buildProjectUrls(config.domain);
  return renderHomarrBoardModel(config, layout, urls);
}

export function renderHomepageWidgetsYaml(_config: ProjectConfig, layout: HomepageLayoutConfig): string {
  const widgets = {
    widgets: [
      {
        type: "calendar",
        title: "Project Calendar",
      },
      {
        type: "datetime",
        title: "Current Time",
      },
    ],
    note: `Homarr dashboard for ${layout.title}`,
  };
  return toYaml(widgets, { lineWidth: 120 });
}

export function renderFullHomepageBundle(config: ProjectConfig, layout: HomepageLayoutConfig): Record<string, string> {
  const urls = buildProjectUrls(config.domain);
  const resolvedLinks = layout.links.map((link) => ({ ...link, url: resolveTemplateUrl(link.url, urls) }));
  const categories = buildPloybundleCategories(urls);
  const serviceSummary: HomepageServices = {
    Categories: categories.map((category) => ({
      name: category.title,
      href: category.primaryLinks[0]?.url ?? urls.dashboard,
      description: `${category.description} (${category.serviceBadge})`,
      icon: "mdi-view-dashboard",
      server: "homarr",
    })),
  };

  return {
    "homarr/migration-analysis.md": renderMigrationAnalysis(layout, resolvedLinks),
    "homarr/homepage-to-homarr-mapping.md": renderMappingDocument(),
    "homarr/homarr-categories.yaml": toYaml({ categories }, { lineWidth: 120 }),
    "homarr/service-summary.yaml": toYaml(serviceSummary, { lineWidth: 120 }),
    "homarr/seed/board-model.json": renderHomarrBoardModel(config, layout, urls),
    "homarr/seed/integrations-model.json": renderHomarrIntegrationModel(urls),
    "scripts/bootstrap-homarr.sh": renderHomarrBootstrapScript(config),
    "scripts/homarr-api-provision.mjs": renderHomarrApiProvisionScript(),
    "scripts/rollback-dashboard-homepage.sh": renderRollbackScript(),
    "docs/homarr-readme.md": renderHomarrReadme(),
  };
}

function resolveTemplateUrl(template: string, urls: ProjectUrls): string {
  return template
    .replace("{{urls.app}}", urls.app)
    .replace("{{urls.admin}}", urls.admin)
    .replace("{{urls.storage}}", urls.storage)
    .replace("{{urls.functions}}", urls.functions)
    .replace("{{urls.deploy}}", urls.deploy)
    .replace("{{urls.dashboard}}", urls.dashboard);
}

interface DashboardCategory {
  title: string;
  description: string;
  serviceBadge: string;
  statusHint: string;
  primaryLinks: Array<{ label: string; url: string }>;
  notes?: string;
}

function buildPloybundleCategories(urls: ProjectUrls): DashboardCategory[] {
  return [
    {
      title: "Overview",
      description: "High-level entry point for app, content, jobs, and deployment surfaces.",
      serviceBadge: "HUB",
      statusHint: "Dashboard Reachable",
      primaryLinks: [
        { label: "Project Dashboard", url: urls.dashboard },
        { label: "App Home", url: urls.app },
        { label: "Deploy Console", url: urls.deploy },
      ],
      notes: "Use this as the default landing category for non-technical users.",
    },
    {
      title: "Users & Access",
      description: "Manage users, roles, policies, and admin authentication.",
      serviceBadge: "DIRECTUS",
      statusHint: "Directus Health",
      primaryLinks: [
        { label: "Directus Admin", url: urls.admin },
        { label: "Roles & Permissions", url: `${urls.admin}/settings/roles` },
        { label: "Users", url: `${urls.admin}/users` },
      ],
    },
    {
      title: "Data & Content",
      description: "Operate collections, schema, and content records backed by Postgres.",
      serviceBadge: "DIRECTUS+POSTGRES",
      statusHint: "Directus + Postgres",
      primaryLinks: [
        { label: "Collections", url: `${urls.admin}/content` },
        { label: "Data Model", url: `${urls.admin}/settings/data-model` },
        { label: "Content Editor", url: `${urls.admin}/content` },
      ],
    },
    {
      title: "Files",
      description: "Manage object files and media references between SeaweedFS and Directus.",
      serviceBadge: "SEAWEEDFS+DIRECTUS",
      statusHint: "Storage API Health",
      primaryLinks: [
        { label: "Storage Endpoint", url: urls.storage },
        { label: "Directus Files", url: `${urls.admin}/files` },
        { label: "Asset Browser", url: `${urls.admin}/files` },
      ],
    },
    {
      title: "Jobs & Functions",
      description: "Run, monitor, and troubleshoot workflow jobs and task execution.",
      serviceBadge: "WINDMILL",
      statusHint: "Windmill API Health",
      primaryLinks: [
        { label: "Windmill Workspace", url: urls.functions },
        { label: "Runs", url: `${urls.functions}/runs` },
        { label: "Schedules", url: `${urls.functions}/schedules` },
        { label: "Flows", url: `${urls.functions}/flows` },
      ],
    },
    {
      title: "App",
      description: "Enter the production-facing Next.js application.",
      serviceBadge: "NEXTJS",
      statusHint: "App Health Check",
      primaryLinks: [
        { label: "App Home", url: urls.app },
        { label: "Health Endpoint", url: `${urls.app}/api/health` },
      ],
    },
    {
      title: "Deploy",
      description: "Open CapRover or Coolify for deployment and runtime operations.",
      serviceBadge: "CAPROVER/COOLIFY",
      statusHint: "Control Plane Reachable",
      primaryLinks: [
        { label: "Deploy Console", url: urls.deploy },
        { label: "Project Services", url: urls.deploy },
      ],
    },
    {
      title: "Advanced",
      description: "Power-user shortcuts for direct infrastructure and internals access.",
      serviceBadge: "ADVANCED",
      statusHint: "Composite Status",
      primaryLinks: [
        { label: "Directus Advanced", url: `${urls.admin}/settings` },
        { label: "Windmill Scripts", url: `${urls.functions}/scripts` },
        { label: "Storage Root", url: urls.storage },
        { label: "Deploy Root", url: urls.deploy },
      ],
      notes: "Advanced links keep original UIs as the only source of truth for real work.",
    },
  ];
}

function renderMigrationAnalysis(layout: HomepageLayoutConfig, resolvedLinks: HomepageLayoutConfig["links"]): string {
  const lines = [
    "# Homepage Migration Analysis",
    "",
    "## Extracted Homepage Implementation",
    "- groups: Quick Links",
    "- services: derived from preset links, rendered into `services.yaml`",
    "- widgets: greeting and resources widgets",
    "- links: preset-specific entries resolved via `{{urls.*}}` templates",
    "- descriptions: each link can include optional description text",
    "- badges: only bookmark abbreviations, no explicit service badge support",
    "- status usage: widget declarations are present in presets but not emitted as live checks in generated Homepage files",
    "- docker label usage: none (docker socket disabled and `docker.yaml` empty)",
    "- custom CSS/theming: no custom CSS, minimal header layout config only",
    "- ploybundle-specific categories: only `Quick Links` currently",
    "",
    "## Source Layout Context",
    `- title: ${layout.title}`,
    `- subtitle: ${layout.subtitle}`,
    `- link_count: ${resolvedLinks.length}`,
  ];
  return lines.join("\n") + "\n";
}

function renderMappingDocument(): string {
  return [
    "# Homepage -> Homarr Concept Mapping",
    "",
    "- Homepage groups -> Homarr board sections (category-first cards)",
    "- Homepage services -> Homarr apps/app tiles (link targets to real tools)",
    "- Homepage widgets -> Homarr built-in widgets/integrations (calendar, datetime, health checks)",
    "- Homepage deep links -> Homarr app targets with per-category quick links",
    "- Homepage status hints -> Homarr integrations and URL health checks",
    "- Homepage branding -> Homarr title/theme with no custom plugin layer",
    "",
    "## Product Rule Preservation",
    "- Category titles are primary labels for non-technical users.",
    "- Service name is a compact secondary badge per category.",
    "- Directus/Windmill/SeaweedFS/CapRover/Coolify remain the working surfaces.",
    "",
    "## Graceful Degradation",
    "- If API provisioning is unavailable, use the generated JSON seed model.",
    "- If an integration type is unsupported, keep URL links and fallback status text.",
  ].join("\n") + "\n";
}

function renderHomarrBoardModel(config: ProjectConfig, layout: HomepageLayoutConfig, urls: ProjectUrls): string {
  const categories = buildPloybundleCategories(urls);
  return JSON.stringify(
    {
      board: {
        slug: `${config.projectName}-hub`,
        name: `${layout.title} Hub`,
        description: layout.subtitle,
        categoryFirst: true,
      },
      sections: categories.map((category, index) => ({
        order: index + 1,
        title: category.title,
        description: category.description,
        serviceBadge: category.serviceBadge,
        statusHint: category.statusHint,
        links: category.primaryLinks,
        notes: category.notes ?? "",
      })),
    },
    null,
    2
  );
}

function renderHomarrIntegrationModel(urls: ProjectUrls): string {
  return JSON.stringify(
    {
      integrations: [
        { key: "directus", type: "http", target: `${urls.admin}/server/health`, method: "GET" },
        { key: "windmill", type: "http", target: `${urls.functions}/api/version`, method: "GET" },
        { key: "seaweedfs", type: "http", target: `${urls.storage}`, method: "GET" },
        { key: "app", type: "http", target: `${urls.app}/api/health`, method: "GET" },
      ],
      notes: "Use Homarr URL monitoring/integrations where available; fallback to link reachability.",
    },
    null,
    2
  );
}

function renderHomarrBootstrapScript(config: ProjectConfig): string {
  return `#!/usr/bin/env sh
set -eu

PROJECT_DIR="/opt/ploybundle"
HOMARR_URL="\${HOMARR_URL:-http://localhost:3001}"
HOMARR_TOKEN="\${HOMARR_ADMIN_TOKEN:-}"

echo "[ploybundle] bootstrapping Homarr board for ${config.projectName}"

if [ -z "$HOMARR_TOKEN" ]; then
  echo "[ploybundle] HOMARR_ADMIN_TOKEN not set. Skipping API provisioning."
  echo "[ploybundle] You can import $PROJECT_DIR/homarr/seed/board-model.json manually in Homarr."
  exit 0
fi

node "$PROJECT_DIR/scripts/homarr-api-provision.mjs" "$HOMARR_URL" "$HOMARR_TOKEN" \\
  "$PROJECT_DIR/homarr/seed/board-model.json" "$PROJECT_DIR/homarr/seed/integrations-model.json"

echo "[ploybundle] Homarr bootstrap finished."
`;
}

function renderHomarrApiProvisionScript(): string {
  return `#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [,, homarrUrl, token, boardPath, integrationsPath] = process.argv;
if (!homarrUrl || !token || !boardPath || !integrationsPath) {
  console.error("Usage: homarr-api-provision.mjs <homarrUrl> <token> <boardJson> <integrationsJson>");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", Authorization: \`Bearer \${token}\` };
const board = JSON.parse(readFileSync(boardPath, "utf-8"));
const integrations = JSON.parse(readFileSync(integrationsPath, "utf-8"));

async function post(path, body) {
  const res = await fetch(\`\${homarrUrl}\${path}\`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(\`POST \${path} failed: \${res.status} \${text}\`);
  }
  return res.json().catch(() => ({}));
}

async function main() {
  try {
    await post("/api/v1/boards", board);
  } catch (err) {
    console.warn("[ploybundle] board provisioning fallback:", err instanceof Error ? err.message : String(err));
  }

  for (const integration of integrations.integrations ?? []) {
    try {
      await post("/api/v1/integrations", integration);
    } catch (err) {
      console.warn("[ploybundle] integration provisioning fallback:", err instanceof Error ? err.message : String(err));
    }
  }
}

main().catch((err) => {
  console.error("[ploybundle] homarr provisioning error:", err);
  process.exit(1);
});
`;
}

function renderRollbackScript(): string {
  return `#!/usr/bin/env sh
set -eu

PROJECT_DIR="/opt/ploybundle"
cd "$PROJECT_DIR"

if [ ! -f docker-compose.yml ]; then
  echo "[ploybundle] docker-compose.yml not found in $PROJECT_DIR"
  exit 1
fi

cp docker-compose.yml docker-compose.homarr.backup.yml
sed 's/ajnart\\/homarr/gethomepage\\/homepage/g' docker-compose.yml > docker-compose.rollback-homepage.yml

echo "[ploybundle] generated docker-compose.rollback-homepage.yml"
echo "[ploybundle] to rollback:"
echo "  cd $PROJECT_DIR && cp docker-compose.rollback-homepage.yml docker-compose.yml && docker compose up -d --remove-orphans"
`;
}

function renderHomarrReadme(): string {
  return [
    "# Homarr Dashboard (Ploybundle)",
    "",
    "Homarr is used as the project hub/navigation shell only.",
    "Directus, Windmill, SeaweedFS, and CapRover/Coolify remain the operational UIs.",
    "",
    "## Provisioning",
    "1. Deploy stack (`docker compose up -d`).",
    "2. Set `HOMARR_ADMIN_TOKEN` if API provisioning is enabled.",
    "3. Run `sh /opt/ploybundle/scripts/bootstrap-homarr.sh`.",
    "",
    "## Fallback Behavior",
    "- If API endpoints differ or are unavailable, import generated seed JSON manually.",
    "- Status indicators gracefully fall back to simple URL reachability links.",
    "",
    "## Rollback",
    "- Run `sh /opt/ploybundle/scripts/rollback-dashboard-homepage.sh` and apply generated rollback compose file.",
  ].join("\n") + "\n";
}
