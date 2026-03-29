import type { ProjectConfig, DirectusCollectionTemplate, DirectusFieldTemplate } from "@ploybundle/shared";

/** Escape for embedding in a POSIX single-quoted shell literal ('...'). */
function escapeSingleQuotedForSh(s: string): string {
  return s.replace(/'/g, `'\"'\"'`);
}

/**
 * Directus creates a default UUID primary key when the collection is POSTed with an empty schema;
 * skip POST /fields for that duplicate "id" row to avoid INVALID_PAYLOAD noise in bootstrap logs.
 */
function fieldsForBootstrapApi(fields: DirectusFieldTemplate[]): DirectusFieldTemplate[] {
  return fields.filter(
    (f) => !(f.field === "id" && f.schema && f.schema["is_primary_key"] === true)
  );
}

export function renderDirectusEnv(config: ProjectConfig, env: Record<string, string>): string {
  const scheme = config.domain.scheme ?? "https";
  const appHost = config.domain.app ?? config.domain.root;
  const adminHost = config.domain.admin ?? `admin.${config.domain.root}`;
  const dashHost = config.domain.dashboard ?? `home.${config.domain.root}`;
  const redisConn = env.REDIS ?? env.REDIS_URL ?? "";

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

    // Redis cache (Directus 11 prefers REDIS; keep CACHE_REDIS for older tooling)
    CACHE_ENABLED: "true",
    CACHE_STORE: "redis",
    REDIS: redisConn,
    CACHE_REDIS: redisConn,
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
    PUBLIC_URL: `${scheme}://${adminHost}`,

    // Security
    ACCESS_TOKEN_TTL: "15m",
    REFRESH_TOKEN_TTL: "7d",
    PASSWORD_RESET_URL_ALLOW_LIST: `${scheme}://${appHost}`,

    // CORS
    CORS_ENABLED: "true",
    CORS_ORIGIN: [`${scheme}://${appHost}`, `${scheme}://${adminHost}`, `${scheme}://${dashHost}`].join(","),

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
    const fieldsJson = JSON.stringify(fieldsForBootstrapApi(col.fields));
    const fieldsSh = escapeSingleQuotedForSh(fieldsJson);
    return `
echo "Creating collection: ${col.collection}"
curl -sSf -o /dev/null -X POST "http://directus:8055/collections" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ collection: col.collection, meta: col.meta ?? { icon: "box", note: `Auto-created by ploybundle blueprint: ${config.template?.name ?? config.preset}` }, schema: {} })}' \\
  2>/dev/null || echo "Collection ${col.collection} may already exist"

echo "Creating fields for: ${col.collection}"
echo '${fieldsSh}' | jq -c '.[]' | while IFS= read -r field_json; do
  curl -sSf -o /dev/null -X POST "http://directus:8055/fields/${col.collection}" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d "$field_json" \\
    2>/dev/null || true
done
`;
  });

  return `#!/bin/sh
# Intentionally no set -e: curl/jq failures must not abort idempotent bootstrap (see seed + login).

echo "Waiting for Directus to be ready..."
until curl -s http://directus:8055/server/health | grep -Eq '"status":"(ok|warn)"'; do
  sleep 3
done
echo "Directus is ready."

# Authenticate as admin
echo "Authenticating..."
LOGIN_JSON=$(curl -s -X POST "http://directus:8055/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${config.directus.adminEmail}","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}')
TOKEN=$(echo "$LOGIN_JSON" | jq -r '.data.access_token // empty' 2>/dev/null || echo "")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to authenticate with Directus. Bootstrap skipped."
  exit 0
fi

echo "Authenticated. Bootstrapping collections..."

${collectionCalls.join("\n")}

echo "Seeding demo rows (idempotent, for local testing)..."
# JSON filter + -G avoids bracket/query quirks; no -f on GET so error bodies still parse.
TENANT_JSON=$(curl -s -G "http://directus:8055/items/tenants" \\
  --data-urlencode 'filter={"slug":{"_eq":"ploybundle-demo"}}' \\
  --data-urlencode "limit=1" \\
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
TENANT_ID=$(echo "$TENANT_JSON" | jq -r 'if (.data | type) == "array" and (.data | length) > 0 then .data[0].id else empty end' 2>/dev/null || echo "")
if [ -z "$TENANT_ID" ] || [ "$TENANT_ID" = "null" ]; then
  POST_JSON=$(curl -s -X POST "http://directus:8055/items/tenants" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{"name":"Ploybundle Demo","slug":"ploybundle-demo","plan":"free","status":"active"}' 2>/dev/null)
  TENANT_ID=$(echo "$POST_JSON" | jq -r '.data.id // empty' 2>/dev/null || echo "")
  if [ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "null" ]; then
    echo "Created demo tenant id=$TENANT_ID"
  else
    REFETCH=$(curl -s -G "http://directus:8055/items/tenants" \\
      --data-urlencode 'filter={"slug":{"_eq":"ploybundle-demo"}}' \\
      --data-urlencode "limit=1" \\
      -H "Authorization: Bearer $TOKEN" 2>/dev/null)
    TENANT_ID=$(echo "$REFETCH" | jq -r 'if (.data | type) == "array" and (.data | length) > 0 then .data[0].id else empty end' 2>/dev/null || echo "")
    if [ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "null" ]; then
      echo "Demo tenant already present id=$TENANT_ID"
    else
      echo "Demo tenant seed skipped (no row for slug ploybundle-demo)."
    fi
  fi
else
  echo "Demo tenant already present id=$TENANT_ID"
fi
RJSON=$(curl -s -G "http://directus:8055/items/records" \\
  --data-urlencode 'filter={"title":{"_eq":"Demo Hello"}}' \\
  --data-urlencode "limit=1" \\
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
R1=$(echo "$RJSON" | jq 'if (.data | type) == "array" then (.data | length) else 0 end' 2>/dev/null || echo 0)
if [ "$R1" = "0" ]; then
  curl -s -X POST "http://directus:8055/items/records" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{"title":"Demo Hello","data":{"source":"ploybundle-bootstrap","note":"First demo row"},"status":"active"}' >/dev/null 2>&1 || true
  echo "Ensured demo record: Demo Hello"
fi
RJSON2=$(curl -s -G "http://directus:8055/items/records" \\
  --data-urlencode 'filter={"title":{"_eq":"Demo Two"}}' \\
  --data-urlencode "limit=1" \\
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
R2=$(echo "$RJSON2" | jq 'if (.data | type) == "array" then (.data | length) else 0 end' 2>/dev/null || echo 0)
if [ "$R2" = "0" ]; then
  curl -s -X POST "http://directus:8055/items/records" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/json" \\
    -d '{"title":"Demo Two","data":{"source":"ploybundle-bootstrap"},"status":"draft"}' >/dev/null 2>&1 || true
  echo "Ensured demo record: Demo Two"
fi

echo "Directus bootstrap complete."
`;
}

export function renderDirectusRolesScript(config: ProjectConfig): string {
  return `#!/bin/sh
# No set -e: invalid login JSON would make jq exit non-zero and abort before the TOKEN check.

echo "Waiting for Directus..."
until curl -s http://directus:8055/server/health | grep -Eq '"status":"(ok|warn)"'; do
  sleep 3
done

# Authenticate
LOGIN_JSON=$(curl -s -X POST "http://directus:8055/auth/login" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"${config.directus.adminEmail}","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}')
TOKEN=$(echo "$LOGIN_JSON" | jq -r '.data.access_token // empty' 2>/dev/null || echo "")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Auth failed. Skipping role setup."
  exit 0
fi

# Create Editor role
echo "Creating Editor role..."
curl -sSf -o /dev/null -X POST "http://directus:8055/roles" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Editor","icon":"edit","description":"Can edit content but not manage users or settings","admin_access":false,"app_access":true}' \\
  2>/dev/null || echo "Editor role may already exist"

# Create Viewer role
echo "Creating Viewer role..."
curl -sSf -o /dev/null -X POST "http://directus:8055/roles" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Viewer","icon":"visibility","description":"Read-only access to content","admin_access":false,"app_access":true}' \\
  2>/dev/null || echo "Viewer role may already exist"

echo "Role setup complete."
`;
}
