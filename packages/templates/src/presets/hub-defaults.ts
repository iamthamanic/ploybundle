import type { HubSectionConfig } from "@ploybundle/shared";

/** Standard Ploybundle hub navigation: task-first areas, not tool-first. */
export const PLOYBUNDLE_HUB_SECTIONS: HubSectionConfig[] = [
  {
    kind: "overview",
    id: "overview",
    title: "Overview",
    summary: "Project status, health by area, and curated links into your stack.",
  },
  // Group labels consumed by some preset boards; intentionally hidden from sidebar routes.
  { kind: "empty", id: "frontend-group", title: "Frontend" },
  { kind: "empty", id: "backend-group", title: "Backend" },
  {
    kind: "category",
    id: "app",
    title: "App",
    serviceBadge: "Next.js",
    summary: "App UI, preview, runtime checks, and frontend workflows.",
  },
  {
    kind: "category",
    id: "auth",
    title: "Auth",
    serviceBadge: "Directus",
    summary: "Users, roles, access control, and identity flows.",
  },
  {
    kind: "category",
    id: "database",
    title: "Database",
    serviceBadge: "Directus + Postgres",
    summary: "Collections, schema, records, SQL browser, and data operations.",
  },
  {
    kind: "category",
    id: "functions",
    title: "Functions",
    serviceBadge: "Windmill",
    summary: "Flows, scripts, API triggers, and execution endpoints.",
  },
  {
    kind: "category",
    id: "storage",
    title: "Storage",
    serviceBadge: "SeaweedFS + Directus Files",
    summary: "Object storage, file browser, and asset management.",
  },
  {
    kind: "category",
    id: "jobs",
    title: "Jobs",
    serviceBadge: "Windmill Schedules",
    summary: "Cron jobs, queues, run history, and operational tasks.",
  },
  {
    kind: "category",
    id: "logs",
    title: "Logs",
    serviceBadge: "Docker",
    summary: "Recent container logs (when enabled) and CLI fallbacks.",
  },
  {
    kind: "category",
    id: "deploy",
    title: "Deploy",
    serviceBadge: "CapRover / Coolify",
    summary: "Current deploy, logs, env, restart / redeploy.",
  },
  {
    kind: "category",
    id: "settings",
    title: "Settings",
    serviceBadge: "Project",
    summary: "Board config and safe environment hints (no secret values).",
  },
];
