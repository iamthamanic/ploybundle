import type { HubBoardConfig } from "@ploybundle/shared";
import { PLOYBUNDLE_HUB_SECTIONS } from "./hub-defaults.js";

/**
 * Platform-default hub: same navigation for every project; no preset-specific copy or deep links.
 * Preset apps (tenants vs articles, etc.) stay in Directus — this shell only exposes generic entry points.
 */
export const PLATFORM_HUB_BOARD: HubBoardConfig = {
  title: "Ploybundle",
  subtitle:
    "Work here first: live status by area, module summaries, and hub actions. Provider consoles are linked under Advanced when you need the native UI.",
  theme: {
    primaryColor: "#0d9488",
    secondaryColor: "#5eead4",
    opacity: 100,
    itemRadius: "md",
  },
  sections: PLOYBUNDLE_HUB_SECTIONS,
  apps: [
    {
      name: "Product app",
      description: "Your web UI (Next.js or Vite + React — set `frontend` in ploybundle.yaml)",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/react.svg",
      href: "{{urls.app}}",
      pingUrl: "{{urls.app}}/api/health",
      section: "App",
    },
    {
      name: "Auth · Users & roles",
      description: "Accounts and permissions",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg",
      href: "{{urls.admin}}/admin/users",
      section: "Auth",
      providerConsole: true,
    },
    {
      name: "Directus Admin",
      description: "CMS, schema, API",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg",
      href: "{{urls.admin}}/admin",
      pingUrl: "{{urls.admin}}/server/health",
      section: "Database",
      providerConsole: true,
    },
    {
      name: "Collections",
      description: "All models and content",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg",
      href: "{{urls.admin}}/admin/content",
      section: "Database",
      providerConsole: true,
    },
    {
      name: "Postgres (Adminer)",
      description:
        "Raw SQL in the browser. Adminer has no own login: use PostgreSQL credentials — POSTGRES_USER (= project name), POSTGRES_PASSWORD, POSTGRES_DB from .env. Server preset: postgres.",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/postgresql.svg",
      href: "{{urls.databaseBrowser}}/?pgsql=postgres&username={{projectDbUser}}&db={{projectDbName}}",
      pingUrl: "{{urls.databaseBrowser}}",
      section: "Database",
      providerConsole: true,
    },
    {
      name: "Storage (SeaweedFS)",
      description: "Cluster browser UI. Raw S3 API for apps is linked under Backend.",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg",
      href: "{{urls.storageBrowser}}",
      pingUrl: "{{urls.storageBrowser}}",
      section: "Storage",
      providerConsole: true,
    },
    {
      name: "File library",
      description: "Assets in Directus",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/files.svg",
      href: "{{urls.admin}}/admin/files",
      section: "Functions",
    },
    {
      name: "Windmill",
      description:
        "Automations workspace. Self-hosted: complete first-time signup in the UI for your operator account; WINDMILL_SECRET / SUPERADMIN_SECRET is for API/bootstrap, not the browser password.",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg",
      href: "{{urls.functions}}",
      pingUrl: "{{urls.functions}}/api/version",
      section: "Jobs",
      providerConsole: true,
    },
    {
      name: "Schedules & flows",
      description: "Cron and runs",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clockify.svg",
      href: "{{urls.functions}}/schedules",
      section: "Jobs",
      providerConsole: true,
    },
    {
      name: "Deploy console",
      description: "CapRover, Coolify, or your control plane",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg",
      href: "{{urls.deploy}}",
      section: "Deploy",
      providerConsole: true,
    },
    {
      name: "S3 API (raw)",
      description: "S3 REST endpoint for integrations (browser view is expected to be limited).",
      iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg",
      href: "{{urls.storage}}",
      pingUrl: "{{urls.storage}}",
      section: "Storage",
      providerConsole: true,
    },
  ],
  widgets: [
    {
      kind: "open_link",
      section: "Overview",
      title: "Database & CMS area",
      config: {
        href: "/database",
        blurb:
          "Stay in the hub first: open the Database area for module status, metrics, and curated shortcuts. Directus: ADMIN_EMAIL / ADMIN_PASSWORD (or DIRECTUS_*) in .env. Adminer: POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB — no separate Adminer account.",
      },
      grid: { x: 0, y: 0, width: 8, height: 3 },
    },
    {
      kind: "clock",
      section: "Overview",
      config: {},
      grid: { x: 8, y: 0, width: 2, height: 1 },
    },
  ],
};
