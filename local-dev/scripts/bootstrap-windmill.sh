#!/bin/sh
set -e

WINDMILL_URL="http://windmill:8000"

echo "Waiting for Windmill to be ready..."
until curl -s "$WINDMILL_URL/api/version" > /dev/null 2>&1; do
  sleep 3
done
echo "Windmill is ready."

# Create workspace
echo "Creating workspace: localdev"
WM_TOKEN="${WINDMILL_SECRET}"

curl -sf -X POST "$WINDMILL_URL/api/workspaces/create" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"localdev","name":"localdev"}' \
  || echo "Workspace localdev may already exist"

# Add DATABASE_URL as a variable
echo "Setting workspace variables..."
curl -sf -X POST "$WINDMILL_URL/api/w/localdev/variables/create" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"f/localdev/database_url","value":"'"$DATABASE_URL"'","is_secret":true,"description":"PostgreSQL connection string"}' \
  || echo "Variable database_url may already exist"

# Create flows and scripts

echo "Creating script: data_export"
curl -s -X POST "$WINDMILL_URL/api/w/localdev/scripts/create" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "f/localdev/data-export",
    "summary": "Exports tenant data to CSV and uploads to SeaweedFS",
    "description": "Exports tenant data to CSV and uploads to SeaweedFS",
    "content": "// Data Export Job\n// Exports records for a given tenant to CSV format.\n\nexport async function main(tenantId: string) {\n  console.log(`Exporting data for tenant: ${tenantId}`);\n  // Placeholder: query records, generate CSV, upload to SeaweedFS exports bucket\n  return { tenantId, status: \"exported\", timestamp: new Date().toISOString() };\n}",
    "language": "deno",
    "is_template": false
  }' || echo "Script data_export may already exist"


echo "Creating cron script: usage_aggregation"
curl -s -X POST "$WINDMILL_URL/api/w/localdev/scripts/create" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "f/localdev/usage-aggregation",
    "summary": "Daily aggregation of usage metrics per tenant",
    "description": "Daily aggregation of usage metrics per tenant",
    "content": "// Usage Aggregation\n// Runs daily to aggregate usage metrics for billing and analytics.\n\nexport async function main() {\n  console.log(\"Aggregating usage metrics...\");\n  // Placeholder: aggregate API calls, storage usage, record counts per tenant\n  return { success: true, timestamp: new Date().toISOString() };\n}",
    "language": "deno",
    "is_template": false
  }' || echo "Script usage_aggregation may already exist"

echo "Creating schedule for: usage_aggregation"
curl -s -X POST "$WINDMILL_URL/api/w/localdev/schedules/create" \
  -H "Authorization: Bearer $WM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "f/localdev/usage-aggregation",
    "schedule": "0 0 2 * * *",
    "timezone": "UTC",
    "script_path": "f/localdev/usage-aggregation",
    "is_flow": false,
    "enabled": true
  }' || echo "Schedule for usage_aggregation may already exist"


echo "Windmill bootstrap complete."
