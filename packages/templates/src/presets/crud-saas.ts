import type { PresetDefinition } from "@ploybundle/shared";

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
    homarr: true,
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
  homarrBoard: {
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
    sections: [
      { kind: "category", title: "Overview" },
      { kind: "category", title: "Data & Content" },
      { kind: "category", title: "Users & Auth" },
      { kind: "category", title: "Files" },
      { kind: "category", title: "Jobs & Functions" },
      { kind: "category", title: "Deploy" },
    ],
    apps: [
      { name: "SaaS App", description: "Frontend application", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Overview" },
      { name: "Directus Admin", description: "Tenant & record management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Data & Content" },
      { name: "Tenants", description: "Tenant management", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg", href: "{{urls.admin}}/content/tenants", section: "Data & Content" },
      { name: "Records", description: "CRUD records", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/airtable.svg", href: "{{urls.admin}}/content/records", section: "Data & Content" },
      { name: "Users", description: "User accounts and roles", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Users & Auth" },
      { name: "SeaweedFS", description: "File uploads and exports", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Files" },
      { name: "Windmill", description: "Data exports, usage aggregation", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Jobs & Functions" },
      { name: "Deploy Console", description: "Platform control plane", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
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
