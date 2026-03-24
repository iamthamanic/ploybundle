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
  homarrLayout: {
    title: "Workflow App",
    subtitle: "Workflow automation and data pipeline platform powered by Ploybundle",
    links: [
      { label: "App", url: "{{urls.app}}", icon: "mdi-sitemap", description: "Workflow dashboard" },
      { label: "Directus Admin", url: "{{urls.admin}}", icon: "mdi-shield-crown", description: "Workflow configuration" },
      { label: "Storage", url: "{{urls.storage}}", icon: "mdi-database", description: "Pipeline data storage" },
      { label: "Windmill", url: "{{urls.functions}}", icon: "mdi-function-variant", description: "Job execution engine" },
      { label: "Deploy", url: "{{urls.deploy}}", icon: "mdi-rocket-launch", description: "Platform control plane" },
    ],
    widgets: [
      { type: "status", service: "nextjs", label: "App" },
      { type: "status", service: "windmill", label: "Job Engine" },
      { type: "status", service: "directus", label: "Config" },
      { type: "status", service: "postgres", label: "Database" },
      { type: "status", service: "redis", label: "Queue" },
      { type: "status", service: "seaweedfs", label: "Storage" },
    ],
    notes: [
      "Workflows are defined in Directus, executed by Windmill",
      "Pipeline data stored in SeaweedFS buckets: inputs, outputs, artifacts",
      "Webhooks can trigger workflows from external systems",
    ],
  },
  envDefaults: {
    NEXT_PUBLIC_APP_NAME: "Workflow App",
    NEXT_PUBLIC_WORKFLOW_MODE: "true",
  },
  nextjsFeatures: ["workflow-dashboard", "job-monitor", "pipeline-builder", "webhook-manager"],
};
