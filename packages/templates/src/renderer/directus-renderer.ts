import type { ProjectConfig, DirectusCollectionTemplate } from "@ploybundle/shared";

export function renderDirectusEnv(config: ProjectConfig, env: Record<string, string>): string {
  const directusEnv: Record<string, string> = {
    // Core
    SECRET: env.DIRECTUS_SECRET ?? "",
    ADMIN_EMAIL: env.DIRECTUS_ADMIN_EMAIL ?? config.directus.adminEmail,
    ADMIN_PASSWORD: env.DIRECTUS_ADMIN_PASSWORD ?? "",

    // Database
    DB_CLIENT: "pg",
    DB_HOST: "postgres",
    DB_PORT: "5432",
    DB_DATABASE: env.POSTGRES_DB ?? config.projectName,
    DB_USER: env.POSTGRES_USER ?? config.projectName,
    DB_PASSWORD: env.POSTGRES_PASSWORD ?? "",

    // Redis cache
    CACHE_ENABLED: "true",
    CACHE_STORE: "redis",
    CACHE_REDIS: env.REDIS_URL ?? "",
    CACHE_AUTO_PURGE: "true",

    // Storage - S3 via SeaweedFS
    STORAGE_LOCATIONS: "s3",
    STORAGE_S3_DRIVER: "s3",
    STORAGE_S3_KEY: env.SEAWEEDFS_ACCESS_KEY ?? "",
    STORAGE_S3_SECRET: env.SEAWEEDFS_SECRET_KEY ?? "",
    STORAGE_S3_BUCKET: "directus",
    STORAGE_S3_ENDPOINT: "http://seaweedfs:8333",
    STORAGE_S3_REGION: "us-east-1",
    STORAGE_S3_FORCE_PATH_STYLE: "true",

    // URLs
    PUBLIC_URL: `https://${config.domain.admin ?? `admin.${config.domain.root}`}`,

    // Security
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL: "7d",
    PASSWORD_RESET_URL_ALLOW_LIST: `https://${config.domain.app ?? config.domain.root}`,

    // CORS
    CORS_ENABLED: "true",
    CORS_ORIGIN: [
      `https://${config.domain.app ?? config.domain.root}`,
      `https://${config.domain.admin ?? `admin.${config.domain.root}`}`,
    ].join(","),

    // Telemetry
    TELEMETRY: "false",

    // Logging
    LOG_LEVEL: "info",
    LOG_STYLE: "pretty",
  };

  return Object.entries(directusEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n";
}

export function renderDirectusBootstrapScript(
  config: ProjectConfig,
  collections: DirectusCollectionTemplate[]
): string {
  if (collections.length === 0) {
    return `#!/bin/sh
echo "No Directus collections to bootstrap."
`;
  }

  // Generate collection creation API calls
  const collectionCalls = collections.map((col) => {
    const fieldsJson = JSON.stringify(col.fields);
    return `
echo "Creating collection: ${col.collection}"
curl -s -X POST "http://directus:8055/collections" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ collection: col.collection, meta: col.meta ?? { icon: "box", note: `Auto-created by ploybundle preset: ${config.preset}` }, schema: {} })}' \\
  || echo "Collection ${col.collection} may already exist"

echo "Creating fields for: ${col.collection}"
for field_json in $(echo '${fieldsJson}' | jq -c '.[]'); do
  curl -s -X POST "http://directus:8055/fields/${col.collection}" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d "$field_json" \\
    || echo "Field may already exist"
done
`;
  });

  return `#!/bin/sh
set -e

echo "Waiting for Directus to be ready..."
until curl -s http://directus:8055/server/health | grep -q "ok"; do
  sleep 3
done
echo "Directus is ready."

# Authenticate as admin
echo "Authenticating..."
TOKEN=$(curl -s -X POST "http://directus:8055/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${config.directus.adminEmail}","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}' \\
  | jq -r '.data.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to authenticate with Directus. Bootstrap skipped."
  exit 0
fi

echo "Authenticated. Bootstrapping collections..."

${collectionCalls.join("\n")}

echo "Directus bootstrap complete."
`;
}

export function renderDirectusRolesScript(config: ProjectConfig): string {
  return `#!/bin/sh
set -e

echo "Waiting for Directus..."
until curl -s http://directus:8055/server/health | grep -q "ok"; do
  sleep 3
done

# Authenticate
TOKEN=$(curl -s -X POST "http://directus:8055/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${config.directus.adminEmail}","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}' \\
  | jq -r '.data.access_token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Auth failed. Skipping role setup."
  exit 0
fi

# Create Editor role
echo "Creating Editor role..."
curl -s -X POST "http://directus:8055/roles" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Editor","icon":"edit","description":"Can edit content but not manage users or settings","admin_access":false,"app_access":true}' \\
  || echo "Editor role may already exist"

# Create Viewer role
echo "Creating Viewer role..."
curl -s -X POST "http://directus:8055/roles" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Viewer","icon":"visibility","description":"Read-only access to content","admin_access":false,"app_access":true}' \\
  || echo "Viewer role may already exist"

echo "Role setup complete."
`;
}
