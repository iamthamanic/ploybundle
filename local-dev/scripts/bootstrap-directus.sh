#!/bin/sh
# Intentionally no set -e: curl/jq failures must not abort idempotent bootstrap (see seed + login).

echo "Waiting for Directus to be ready..."
until curl -s http://directus:8055/server/health | grep -Eq '"status":"(ok|warn)"'; do
  sleep 3
done
echo "Directus is ready."

# Authenticate as admin
echo "Authenticating..."
LOGIN_JSON=$(curl -s -X POST "http://directus:8055/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localdev.com","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}')
TOKEN=$(echo "$LOGIN_JSON" | jq -r '.data.access_token // empty' 2>/dev/null || echo "")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to authenticate with Directus. Bootstrap skipped."
  exit 0
fi

echo "Authenticated. Bootstrapping collections..."


echo "Creating collection: tenants"
curl -sSf -o /dev/null -X POST "http://directus:8055/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"collection":"tenants","meta":{"icon":"box","note":"Auto-created by ploybundle blueprint: crud-saas"},"schema":{}}' \
  2>/dev/null || echo "Collection tenants may already exist"

echo "Creating fields for: tenants"
echo '[{"field":"name","type":"string","meta":{"interface":"input"},"schema":{"is_nullable":false}},{"field":"slug","type":"string","meta":{"interface":"input"},"schema":{"is_nullable":false,"is_unique":true}},{"field":"plan","type":"string","meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Free","value":"free"},{"text":"Pro","value":"pro"},{"text":"Enterprise","value":"enterprise"}]}},"schema":{"default_value":"free"}},{"field":"status","type":"string","meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Active","value":"active"},{"text":"Suspended","value":"suspended"}]}},"schema":{"default_value":"active"}},{"field":"date_created","type":"timestamp","meta":{"readonly":true,"hidden":true,"special":["date-created"]}}]' | jq -c '.[]' | while IFS= read -r field_json; do
  curl -sSf -o /dev/null -X POST "http://directus:8055/fields/tenants" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$field_json" \
    2>/dev/null || true
done


echo "Creating collection: records"
curl -sSf -o /dev/null -X POST "http://directus:8055/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"collection":"records","meta":{"icon":"box","note":"Auto-created by ploybundle blueprint: crud-saas"},"schema":{}}' \
  2>/dev/null || echo "Collection records may already exist"

echo "Creating fields for: records"
echo '[{"field":"title","type":"string","meta":{"interface":"input"},"schema":{"is_nullable":false}},{"field":"data","type":"json","meta":{"interface":"input-code","options":{"language":"json"}}},{"field":"status","type":"string","meta":{"interface":"select-dropdown","options":{"choices":[{"text":"Draft","value":"draft"},{"text":"Active","value":"active"},{"text":"Archived","value":"archived"}]}},"schema":{"default_value":"draft"}},{"field":"date_created","type":"timestamp","meta":{"readonly":true,"hidden":true,"special":["date-created"]}},{"field":"date_updated","type":"timestamp","meta":{"readonly":true,"hidden":true,"special":["date-updated"]}}]' | jq -c '.[]' | while IFS= read -r field_json; do
  curl -sSf -o /dev/null -X POST "http://directus:8055/fields/records" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$field_json" \
    2>/dev/null || true
done


echo "Seeding demo rows (idempotent, for local testing)..."
# JSON filter + -G avoids bracket/query quirks; no -f on GET so error bodies still parse.
TENANT_JSON=$(curl -s -G "http://directus:8055/items/tenants" \
  --data-urlencode 'filter={"slug":{"_eq":"ploybundle-demo"}}' \
  --data-urlencode "limit=1" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
TENANT_ID=$(echo "$TENANT_JSON" | jq -r 'if (.data | type) == "array" and (.data | length) > 0 then .data[0].id else empty end' 2>/dev/null || echo "")
if [ -z "$TENANT_ID" ] || [ "$TENANT_ID" = "null" ]; then
  POST_JSON=$(curl -s -X POST "http://directus:8055/items/tenants" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Ploybundle Demo","slug":"ploybundle-demo","plan":"free","status":"active"}' 2>/dev/null)
  TENANT_ID=$(echo "$POST_JSON" | jq -r '.data.id // empty' 2>/dev/null || echo "")
  if [ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "null" ]; then
    echo "Created demo tenant id=$TENANT_ID"
  else
    REFETCH=$(curl -s -G "http://directus:8055/items/tenants" \
      --data-urlencode 'filter={"slug":{"_eq":"ploybundle-demo"}}' \
      --data-urlencode "limit=1" \
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
RJSON=$(curl -s -G "http://directus:8055/items/records" \
  --data-urlencode 'filter={"title":{"_eq":"Demo Hello"}}' \
  --data-urlencode "limit=1" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
R1=$(echo "$RJSON" | jq 'if (.data | type) == "array" then (.data | length) else 0 end' 2>/dev/null || echo 0)
if [ "$R1" = "0" ]; then
  curl -s -X POST "http://directus:8055/items/records" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Demo Hello","data":{"source":"ploybundle-bootstrap","note":"First demo row"},"status":"active"}' >/dev/null 2>&1 || true
  echo "Ensured demo record: Demo Hello"
fi
RJSON2=$(curl -s -G "http://directus:8055/items/records" \
  --data-urlencode 'filter={"title":{"_eq":"Demo Two"}}' \
  --data-urlencode "limit=1" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)
R2=$(echo "$RJSON2" | jq 'if (.data | type) == "array" then (.data | length) else 0 end' 2>/dev/null || echo 0)
if [ "$R2" = "0" ]; then
  curl -s -X POST "http://directus:8055/items/records" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Demo Two","data":{"source":"ploybundle-bootstrap"},"status":"draft"}' >/dev/null 2>&1 || true
  echo "Ensured demo record: Demo Two"
fi

echo "Directus bootstrap complete."
