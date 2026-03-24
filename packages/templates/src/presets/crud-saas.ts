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
    homepage: true,
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
  homepageLayout: {
    title: "CRUD SaaS",
    subtitle: "Multi-tenant SaaS application powered by Ploybundle",
    links: [
      { label: "App", url: "{{urls.app}}", icon: "mdi-application", description: "SaaS application" },
      { label: "Directus Admin", url: "{{urls.admin}}", icon: "mdi-shield-crown", description: "Data & admin backoffice" },
      { label: "Storage", url: "{{urls.storage}}", icon: "mdi-cloud-upload", description: "File storage" },
      { label: "Functions", url: "{{urls.functions}}", icon: "mdi-function", description: "Background jobs" },
      { label: "Deploy", url: "{{urls.deploy}}", icon: "mdi-rocket-launch", description: "Platform control plane" },
    ],
    widgets: [
      { type: "status", service: "nextjs", label: "App" },
      { type: "status", service: "directus", label: "Admin" },
      { type: "status", service: "postgres", label: "Database" },
      { type: "status", service: "redis", label: "Cache" },
      { type: "status", service: "seaweedfs", label: "Storage" },
      { type: "status", service: "windmill", label: "Functions" },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "CRUD SaaS",
    NEXT_PUBLIC_MULTI_TENANT: "true",
  },
  nextjsFeatures: ["dashboard", "crud-views", "tenant-management", "settings"],
};
