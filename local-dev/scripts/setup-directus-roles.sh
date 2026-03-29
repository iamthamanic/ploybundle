#!/bin/sh
# No set -e: invalid login JSON would make jq exit non-zero and abort before the TOKEN check.

echo "Waiting for Directus..."
until curl -s http://directus:8055/server/health | grep -Eq '"status":"(ok|warn)"'; do
  sleep 3
done

# Authenticate
LOGIN_JSON=$(curl -s -X POST "http://directus:8055/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@localdev.com","password":"'"$DIRECTUS_ADMIN_PASSWORD"'"}')
TOKEN=$(echo "$LOGIN_JSON" | jq -r '.data.access_token // empty' 2>/dev/null || echo "")

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "Auth failed. Skipping role setup."
  exit 0
fi

# Create Editor role
echo "Creating Editor role..."
curl -sSf -o /dev/null -X POST "http://directus:8055/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Editor","icon":"edit","description":"Can edit content but not manage users or settings","admin_access":false,"app_access":true}' \
  2>/dev/null || echo "Editor role may already exist"

# Create Viewer role
echo "Creating Viewer role..."
curl -sSf -o /dev/null -X POST "http://directus:8055/roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Viewer","icon":"visibility","description":"Read-only access to content","admin_access":false,"app_access":true}' \
  2>/dev/null || echo "Viewer role may already exist"

echo "Role setup complete."
