import type { PresetDefinition } from "@ploybundle/shared";
import { PLOYBUNDLE_HUB_SECTIONS } from "./hub-defaults.js";

export const workflowAppPreset: PresetDefinition = {
  name: "workflow-app",
  displayName: "Workflow App",
  description: "Workflow-centric application emphasizing background processing, automation, and data pipelines.",
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
    { name: "inputs", public: false },
    { name: "outputs", public: false },
    { name: "artifacts", public: false },
  ],
  directusCollections: [
    {
      collection: "workflows",
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
        { field: "name", type: "string", meta: { interface: "input" }, schema: { is_nullable: false } },
        { field: "description", type: "text", meta: { interface: "input-multiline" } },
        { field: "type", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Data Pipeline", value: "pipeline" }, { text: "Automation", value: "automation" }, { text: "Integration", value: "integration" }] } } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Active", value: "active" }, { text: "Paused", value: "paused" }, { text: "Archived", value: "archived" }] } }, schema: { default_value: "active" } },
        { field: "config_json", type: "json", meta: { interface: "input-code", options: { language: "json" } } },
        { field: "date_created", type: "timestamp", meta: { readonly: true, hidden: true, special: ["date-created"] } },
      ],
    },
    {
      collection: "job_runs",
      fields: [
        { field: "id", type: "uuid", meta: { hidden: true, readonly: true, special: ["uuid"] }, schema: { is_primary_key: true } },
        { field: "workflow_id", type: "uuid", meta: { interface: "input" } },
        { field: "status", type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Pending", value: "pending" }, { text: "Running", value: "running" }, { text: "Completed", value: "completed" }, { text: "Failed", value: "failed" }] } } },
        { field: "started_at", type: "timestamp", meta: { interface: "datetime" } },
        { field: "completed_at", type: "timestamp", meta: { interface: "datetime" } },
        { field: "result_json", type: "json", meta: { interface: "input-code", options: { language: "json" } } },
        { field: "error", type: "text", meta: { interface: "input-multiline" } },
      ],
    },
  ],
  windmillFlows: [
    {
      name: "pipeline_executor",
      description: "Executes a data pipeline workflow step by step",
      type: "script",
      language: "typescript",
      content: `// Pipeline Executor
// Runs a data pipeline defined in workflow configuration.

export async function main(workflowId: string, config: Record<string, unknown>) {
  console.log(\`Executing pipeline: \${workflowId}\`);
  const steps = (config.steps as string[]) ?? [];
  const results: Record<string, unknown>[] = [];

  for (const step of steps) {
    console.log(\`Running step: \${step}\`);
    results.push({ step, status: "completed", timestamp: new Date().toISOString() });
  }

  return { workflowId, steps: results.length, status: "completed" };
}`,
    },
    {
      name: "cleanup_old_runs",
      description: "Cleans up job runs older than 30 days",
      type: "cron",
      schedule: "0 1 * * 0",
      language: "typescript",
      content: `// Cleanup Old Runs
// Weekly job to clean up old job_runs records and associated artifacts.

export async function main() {
  console.log("Cleaning up old job runs...");
  // Placeholder: DELETE FROM job_runs WHERE completed_at < NOW() - INTERVAL '30 days'
  // Also clean up artifacts from SeaweedFS
  return { success: true, timestamp: new Date().toISOString() };
}`,
    },
    {
      name: "webhook_trigger",
      description: "Webhook endpoint for triggering workflows from external systems",
      type: "script",
      language: "typescript",
      content: `// Webhook Trigger
// Receives webhook payloads and triggers the appropriate workflow.

export async function main(payload: { workflowId: string; data: Record<string, unknown> }) {
  console.log(\`Webhook received for workflow: \${payload.workflowId}\`);
  // Placeholder: validate payload, create job_run, trigger pipeline_executor
  return { triggered: true, workflowId: payload.workflowId, timestamp: new Date().toISOString() };
}`,
    },
  ],
  hubBoard: {
    title: "Workflow App",
    subtitle: "Workflow automation and data pipeline platform powered by Ploybundle",
    theme: {
      primaryColor: "#EA580C",
      secondaryColor: "#FB923C",
      opacity: 100,
      itemRadius: "md",
      customCss: `:root { --mantine-color-body: #1a0e04; }
.board-section-title { font-weight: 700; letter-spacing: 0.02em; }`,
    },
    sections: PLOYBUNDLE_HUB_SECTIONS,
    apps: [
      { name: "Workflow App", description: "Next.js operator UI", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Frontend" },
      { name: "Directus Admin", description: "Workflow metadata", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Backend" },
      { name: "Workflows", description: "Definitions & config", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg", href: "{{urls.admin}}/content/workflows", section: "Backend" },
      { name: "Job Runs", description: "History in Directus", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/airtable.svg", href: "{{urls.admin}}/content/job_runs", section: "Backend" },
      { name: "Users & roles", description: "Access control", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Backend" },
      { name: "SeaweedFS", description: "Pipeline artifacts", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Backend" },
      { name: "Runs", description: "Windmill runs", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/githubactions.svg", href: "{{urls.functions}}/runs", section: "Backend" },
      { name: "Schedules", description: "Cron & triggers", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clockify.svg", href: "{{urls.functions}}/schedules", section: "Backend" },
      { name: "Flows", description: "Multi-step flows", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/apacheairflow.svg", href: "{{urls.functions}}/flows", section: "Backend" },
      { name: "Windmill home", description: "Workspace entry", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Backend" },
      { name: "Deploy console", description: "CapRover / Coolify", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
      { name: "Directus (full admin)", description: "Raw data plane", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Backend" },
      { name: "Windmill (workspace)", description: "Raw job engine", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Backend" },
      { name: "SeaweedFS (raw)", description: "Object storage", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Backend" },
      { name: "Deploy platform", description: "Infrastructure UI", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Backend" },
    ],
    widgets: [
      { kind: "iframe", section: "Overview", title: "Recent Runs", config: { embedUrl: "{{urls.functions}}/runs", allowScrolling: true }, grid: { x: 0, y: 0, width: 8, height: 3 } },
      { kind: "clock", section: "Overview", config: {}, grid: { x: 8, y: 0, width: 2, height: 1 } },
      { kind: "bookmarks", section: "Overview", title: "Quick Links", config: {}, grid: { x: 8, y: 1, width: 2, height: 2 } },
      { kind: "iframe", section: "Backend", title: "Windmill Flows", config: { embedUrl: "{{urls.functions}}/flows", allowScrolling: true }, grid: { x: 0, y: 0, width: 10, height: 3 } },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Workflow App",
    NEXT_PUBLIC_WORKFLOW_MODE: "true",
  },
  nextjsFeatures: ["workflow-dashboard", "job-monitor", "pipeline-builder", "webhook-manager"],
};
