# Security

## Secrets Management

### Generation
- All secrets (passwords, tokens, keys) are generated server-side using cryptographically secure random bytes (`crypto.randomBytes`)
- Passwords use a character set of alphanumeric and safe special characters
- Tokens and keys use hex encoding

### Storage
- Secrets are stored on the VPS at `/opt/ploybundle/.secrets.json` with `chmod 600` (owner-read-only)
- The `/opt/ploybundle/` directory has `chmod 700` permissions
- Secrets are never committed to git
- Secrets are never printed in CLI output unless explicitly requested
- Local config files (`ploybundle.yaml`) contain only metadata references, not secret values

### Rotation
- Re-running `init` or `deploy` loads existing secrets from the server
- Secrets are not rotated on re-deploy unless explicitly requested
- This prevents service disruption from unexpected credential changes

### Categories

| Secret                  | Used By                     |
|------------------------|-----------------------------|
| `postgresPassword`    | Postgres, Directus, Windmill |
| `redisPassword`       | Redis, Directus cache       |
| `directusSecret`      | Directus JWT signing        |
| `directusAdminPassword`| Directus admin bootstrap   |
| `seaweedfsAccessKey`  | SeaweedFS S3 auth           |
| `seaweedfsSecretKey`  | SeaweedFS S3 auth           |
| `windmillSecret`      | Windmill API auth           |
| `appSessionSecret`    | Next.js session encryption  |
| `nextauthSecret`      | NextAuth.js JWT signing     |

## SSH Security

- SSH connections use `StrictHostKeyChecking=accept-new` for first connections
- `BatchMode=yes` prevents interactive prompts from hanging
- Connection timeout is 10 seconds
- Command timeout is 5 minutes
- Private key authentication is supported via `--ssh-key` or config

## Network Security

- All services run in a Docker bridge network (`ploybundle`)
- Only necessary ports are exposed to the host
- TLS termination is handled by the platform control plane (CapRover/Coolify)
- Inter-service communication stays on the internal Docker network
- SeaweedFS S3 credentials restrict access by identity and action

## Files and Permissions

| Path                              | Permission | Content              |
|-----------------------------------|-----------|----------------------|
| `/opt/ploybundle/`               | 700       | Project root         |
| `/opt/ploybundle/.secrets.json`  | 600       | Generated secrets    |
| `/opt/ploybundle/.env`           | 600       | Environment variables|
| `/opt/ploybundle/docker-compose.yml` | 644   | Stack definition     |

## What Ploybundle Does NOT Do

- Does not manage SSL certificates directly (delegated to CapRover/Coolify)
- Does not implement its own identity provider in v1 (uses Directus auth)
- Does not encrypt secrets at rest beyond filesystem permissions in v1
- Does not manage firewall rules (use your VPS provider's firewall)
- Does not provide audit logging in v1

## Recommendations

1. **Use SSH key authentication** — avoid password-based SSH
2. **Enable your VPS provider's firewall** — only open ports 22, 80, 443
3. **Use a dedicated VPS per project** — Ploybundle is project-scoped by design
4. **Back up `/opt/ploybundle/.secrets.json`** — losing this file means regenerating all credentials
5. **Keep the VPS updated** — run `apt update && apt upgrade` regularly
6. **Monitor with `ploybundle doctor`** — run diagnostics periodically
