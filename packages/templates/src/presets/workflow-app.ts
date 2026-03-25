import type { PresetDefinition } from "@ploybundle/shared";

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
    homarr: true,
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
  homarrBoard: {
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
    sections: [
      { kind: "category", title: "Overview" },
      { kind: "category", title: "Data & Content" },
      { kind: "category", title: "Users & Auth" },
      { kind: "category", title: "Files" },
      { kind: "category", title: "Jobs & Functions" },
      { kind: "category", title: "Deploy" },
    ],
    apps: [
      { name: "Workflow App", description: "Frontend application", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg", href: "{{urls.app}}", pingUrl: "{{urls.app}}/api/health", section: "Overview" },
      { name: "Windmill", description: "Job execution engine", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/windowsterminal.svg", href: "{{urls.functions}}", pingUrl: "{{urls.functions}}/api/version", section: "Overview" },
      { name: "Directus Admin", description: "Workflow configuration", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/directus.svg", href: "{{urls.admin}}", pingUrl: "{{urls.admin}}/server/health", section: "Data & Content" },
      { name: "Workflows", description: "Workflow definitions", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/databricks.svg", href: "{{urls.admin}}/content/workflows", section: "Data & Content" },
      { name: "Job Runs", description: "Execution history", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/airtable.svg", href: "{{urls.admin}}/content/job_runs", section: "Data & Content" },
      { name: "Users", description: "User accounts and roles", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/auth0.svg", href: "{{urls.admin}}/users", section: "Users & Auth" },
      { name: "SeaweedFS", description: "Pipeline inputs/outputs/artifacts", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/amazons3.svg", href: "{{urls.storage}}", pingUrl: "{{urls.storage}}", section: "Files" },
      { name: "Runs", description: "Active and past runs", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/githubactions.svg", href: "{{urls.functions}}/runs", section: "Jobs & Functions" },
      { name: "Schedules", description: "Cron jobs and triggers", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/clockify.svg", href: "{{urls.functions}}/schedules", section: "Jobs & Functions" },
      { name: "Flows", description: "Multi-step flows", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/apacheairflow.svg", href: "{{urls.functions}}/flows", section: "Jobs & Functions" },
      { name: "Deploy Console", description: "Platform control plane", iconUrl: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/docker.svg", href: "{{urls.deploy}}", section: "Deploy" },
    ],
    widgets: [
      { kind: "iframe", section: "Overview", title: "Recent Runs", config: { embedUrl: "{{urls.functions}}/runs", allowScrolling: true }, grid: { x: 0, y: 0, width: 8, height: 3 } },
      { kind: "clock", section: "Overview", config: {}, grid: { x: 8, y: 0, width: 2, height: 1 } },
      { kind: "bookmarks", section: "Overview", title: "Quick Links", config: {}, grid: { x: 8, y: 1, width: 2, height: 2 } },
      { kind: "iframe", section: "Jobs & Functions", title: "Windmill Flows", config: { embedUrl: "{{urls.functions}}/flows", allowScrolling: true }, grid: { x: 0, y: 0, width: 10, height: 3 } },
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Workflow App",
    NEXT_PUBLIC_WORKFLOW_MODE: "true",
  },
  nextjsFeatures: ["workflow-dashboard", "job-monitor", "pipeline-builder", "webhook-manager"],
};
