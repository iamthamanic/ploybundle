import type { PresetDefinition } from "@ploybundle/shared";
import { PLOYBUNDLE_HUB_SECTIONS } from "./hub-defaults.js";

export const crudSaasPreset: PresetDefinition = {
  name: "crud-saas",
  displayName: "CRUD SaaS",
  description: "Standard SaaS application with CRUD operations, user management, and background processing.",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    hub: true,
    adminer: false,
  },
  buckets: [
    { name: "uploads", public: false },
    { name: "exports", public: false },
  ],
  directusCollections: [
    {
      collection: "tenants",
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
        { field: "name", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "slug", type: "string", meta: { interface: "input" }, schema: { is_nullable: false, is_unique: true } },
        { field: "plan", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Free", value: "free" }, { text: "Pro", value: "pro" }, { text: "Enterprise", value: "enterprise" }] } }, schema: { default_value: "free" } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Active", value: "active" }, { text: "Suspended", value: "suspended" }] } }, schema: { default_value: "active" } },
        { field: "date_created", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-created"] } },
      ],
    },
    {
      collection: "records",
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
        { field: "title", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "data", type: "json", meta: { interface: "input-code", options: { language: "json" } } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Draft", value: "draft" }, { text: "Active", value: "active" }, { text: "Archived", value: "archived" }] } }, schema: { default_value: "draft" } },
        { field: "date_created", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-created"] } },
        { field: "date_updated", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-updated"] } },
      ],
    },
  ],
  windmillFlows: [
    {
      name: "data_export",
      description: "Exports tenant data to CSV and uploads to SeaweedFS",
      type: "script",
      language: "typescript",
      content: `// Data Export Job
// Exports records for a given tenant to CSV format.

export async function main(tenantId: string) {
  console.log(\`Exporting data for tenant: \${tenantId}\`);
  // Placeholder: query records, generate CSV, upload to SeaweedFS exports bucket
  return { tenantId, status: "exported", timestamp: new Date().toISOString() };
}`,
    },
    {
      name: "usage_aggregation",
      description: "Daily aggregation of usage metrics per tenant",
      type: "cron",
      schedule: "0 2 * * *",
      language: "typescript",
      content: `// Usage Aggregation
// Runs daily to aggregate usage metrics for billing and analytics.

export async function main() {
  console.log("Aggregating usage metrics...");
  // Placeholder: aggregate API calls, storage usage, record counts per tenant
  return { success: true, timestamp: new Date().toISOString() };
}`,
    },
  ],
  hubBoard: {
    title: "CRUD SaaS",
    subtitle: "Multi-tenant SaaS application powered by Ploybundle",
    theme: {
      primaryColor: "#2563EB",
      secondaryColor: "#60A5FA",
      opacity: 100,
      itemRadius: "md",
      customCss: `:root { --mantine-color-body: #0a1628; }
.board-section-title { font-weight: 700; letter-spacing: 0.02em; }`,
    },
    sections: PLOYBUNDLE_HUB_SECTIONS,
    apps: [
      { name: "Product (Next.js)", description: "Main application URL", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Frontend" },
      { name: "Directus Admin", description: "Collections & admin API", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Backend" },
      { name: "Tenants", description: "Tenant directory", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg", href: "{{urls.admin}}/content/tenants", section: "Backend" },
      { name: "Records", description: "Shared CRUD records", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/airtable.svg", href: "{{urls.admin}}/content/records", section: "Backend" },
      { name: "Users & roles", description: "Accounts, roles, access", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Backend" },
      { name: "Storage (S3)", description: "Buckets and object API", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Backend" },
      { name: "File manager", description: "Assets in Directus", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/files.svg", href: "{{urls.admin}}/files", section: "Backend" },
      { name: "Windmill", description: "Jobs, exports, aggregation", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Backend" },
      { name: "Deploy console", description: "CapRover / Coolify", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
      { name: "Directus (full admin)", description: "Raw Directus console", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Backend" },
      { name: "Windmill (workspace)", description: "Raw Windmill UI", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Backend" },
      { name: "SeaweedFS", description: "Raw storage endpoint", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Backend" },
      { name: "Deploy platform", description: "Infrastructure UI", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Backend" },
    ],
    widgets: [
      { kind: "iframe", section: "Overview", title: "Tenant Overview", config: { embedUrl: "{{urls.admin}}/content/tenants", allowScrolling: true }, grid: { x: 0, y: 0, width: 8, height: 3 } },
      { kind: "clock", section: "Overview", config: {}, grid: { x: 8, y: 0, width: 2, height: 1 } },
      { kind: "bookmarks", section: "Overview", title: "Quick Links", config: {}, grid: { x: 8, y: 1, width: 2, height: 2 } },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "CRUD SaaS",
    NEXT_PUBLIC_MULTI_TENANT: "true",
  },
  nextjsFeatures: ["dashboard", "crud-views", "tenant-management", "settings"],
};
