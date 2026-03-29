import type { ProjectConfig, WindmillFlowTemplate } from "@ploybundle/shared";

/** Runs once on empty Postgres data dir; creates DB for Windmill only. */
export function renderWindmillPostgresInitSql(config: ProjectConfig): string {
  const windmillDb = `${config.projectName}_windmill`;
  const owner = config.projectName;
  const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
  return `-- Windmill uses this database; Directus uses POSTGRES_DB (${config.projectName}).
CREATE DATABASE ${q(windmillDb)} OWNER ${q(owner)};
`;
}

export function renderWindmillBootstrapScript(
  config: ProjectConfig,
  flows: WindmillFlowTemplate[]
): string {
  const workspace = config.windmill.workspace;
  const toWindmillCron = (raw: string): string => {
    const parts = raw.trim().split(/\s+/);
    // Windmill expects 6-part cron (seconds first); convert common 5-part crons.
    if (parts.length === 5) return `0 ${raw.trim()}`;
    return raw.trim();
  };

  const flowScripts = flows.map((flow) => {
    const pathName = flow.name.replace(/_/g, "-");

    if (flow.type === "cron" && flow.schedule) {
      const cron = toWindmillCron(flow.schedule);
      return `
echo "Creating cron script: ${flow.name}"
curl -s -X POST "$WINDMILL_URL/api/w/${workspace}/scripts/create" \\
  -H "Authorization: Bearer $WM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "f/${workspace}/${pathName}",
    "summary": "${flow.description}",
    "description": "${flow.description}",
    "content": ${JSON.stringify(flow.content)},
    "language": "deno",
    "is_template": false
  }' || echo "Script ${flow.name} may already exist"

echo "Creating schedule for: ${flow.name}"
curl -s -X POST "$WINDMILL_URL/api/w/${workspace}/schedules/create" \\
  -H "Authorization: Bearer $WM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "f/${workspace}/${pathName}",
    "schedule": "${cron}",
    "timezone": "UTC",
    "script_path": "f/${workspace}/${pathName}",
    "is_flow": false,
    "enabled": true
  }' || echo "Schedule for ${flow.name} may already exist"
`;
    }

    return `
echo "Creating script: ${flow.name}"
curl -s -X POST "$WINDMILL_URL/api/w/${workspace}/scripts/create" \\
  -H "Authorization: Bearer $WM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "f/${workspace}/${pathName}",
    "summary": "${flow.description}",
    "description": "${flow.description}",
    "content": ${JSON.stringify(flow.content)},
    "language": "deno",
    "is_template": false
  }' || echo "Script ${flow.name} may already exist"
`;
  });

  return `#!/bin/sh
set -e

WINDMILL_URL="http://windmill:8000"

echo "Waiting for Windmill to be ready..."
until curl -s "$WINDMILL_URL/api/version" > /dev/null 2>&1; do
  sleep 3
done
echo "Windmill is ready."

# Create workspace
echo "Creating workspace: ${workspace}"
WM_TOKEN="\${WINDMILL_SECRET}"

curl -sf -X POST "$WINDMILL_URL/api/workspaces/create" \\
  -H "Authorization: Bearer $WM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"${workspace}","name":"${config.projectName}"}' \\
  || echo "Workspace ${workspace} may already exist"

# Add DATABASE_URL as a variable
echo "Setting workspace variables..."
curl -sf -X POST "$WINDMILL_URL/api/w/${workspace}/variables/create" \\
  -H "Authorization: Bearer $WM_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"path":"f/${workspace}/database_url","value":"'"$DATABASE_URL"'","is_secret":true,"description":"PostgreSQL connection string"}' \\
  || echo "Variable database_url may already exist"

# Create flows and scripts
${flowScripts.join("\n")}

echo "Windmill bootstrap complete."
`;
}

export function renderWindmillEnv(config: ProjectConfig, env: Record<string, string>): string {
  return `DATABASE_URL=${env.WINDMILL_DATABASE_URL ?? ""}
BASE_URL=https://${config.domain.functions ?? `fn.${config.domain.root}`}
RUST_LOG=info
NUM_WORKERS=2
`;
}
