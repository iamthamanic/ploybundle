# Deployment Guide

## Prerequisites

- A fresh **Ubuntu 24.04 LTS** VPS (Hetzner, Hostinger, or any provider)
- A domain with DNS A records pointing to the VPS IP
- SSH access to the VPS (root or sudo)
- Node.js >= 20 and pnpm >= 9 on your local machine

## DNS Setup

Before running `ploybundle init`, configure these DNS A records pointing to your VPS IP:

| Subdomain | Record | Purpose          |
|-----------|--------|------------------|
| `@`       | A      | Main app         |
| `admin`   | A      | Directus admin   |
| `storage` | A      | SeaweedFS        |
| `fn`      | A      | Windmill         |
| `deploy`  | A      | Control plane    |
| `home`    | A      | Homarr dashboard|

Or use a wildcard: `*.yourdomain.com → VPS_IP`

## Recommended VPS Specs

| Profile | vCPUs | RAM  | Disk  | Monthly Cost (approx) |
|---------|-------|------|-------|-----------------------|
| Small   | 2     | 4GB  | 40GB  | ~$6-10               |
| Medium  | 4     | 8GB  | 80GB  | ~$15-25              |
| Large   | 6     | 16GB | 160GB | ~$30-50              |

The `small` profile works for development and light production. Use `medium` or `large` for production workloads with more users.

## Step-by-Step Deployment

### 1. Install Ploybundle

```bash
git clone <repo-url> ploybundle
cd ploybundle
pnpm install
pnpm build
```

### 2. Deploy a Project

```bash
# Lite mode (CapRover)
ploybundle init myproject \
  --target lite \
  --host root@YOUR_VPS_IP \
  --preset learning-app \
  --domain myproject.example.com

# Full mode (Coolify)
ploybundle init myproject \
  --target full \
  --host root@YOUR_VPS_IP \
  --preset crud-saas \
  --domain myproject.example.com
```

### 3. Verify

```bash
ploybundle status myproject
ploybundle doctor myproject
```

### 4. Access Your Stack

After successful deployment, you'll see URLs for:
- **App**: `https://myproject.example.com`
- **Admin**: `https://admin.myproject.example.com`
- **Storage**: `https://storage.myproject.example.com`
- **Functions**: `https://fn.myproject.example.com`
- **Dashboard**: `https://home.myproject.example.com`

## What the Init Command Does

1. **Validates** config, target, preset, domain, SSH target
2. **Connects** to VPS via SSH
3. **Inspects** host: OS version, Docker, disk, RAM, ports
4. **Installs Docker** if missing
5. **Installs platform** (CapRover or Coolify)
6. **Generates secrets** (Postgres, Redis, Directus, SeaweedFS, Windmill, app)
7. **Renders** docker-compose, env files, service configs, homarr
8. **Deploys** the stack via docker compose
9. **Seeds** services: creates buckets, bootstraps Directus collections and roles, sets up Windmill workspace
10. **Verifies** all services are healthy
11. **Prints** project summary with all URLs

## Using a Config File

Instead of CLI flags, you can use a `ploybundle.yaml`:

```yaml
projectName: myproject
target: lite
preset: learning-app
domain:
  root: myproject.example.com
ssh:
  host: 1.2.3.4
  user: root
  port: 22
email: admin@myproject.example.com
directus:
  adminEmail: admin@myproject.example.com
windmill:
  workspace: myproject
  exampleFlows: true
resourceProfile: small
providerHint: hetzner
```

Then deploy with:
```bash
ploybundle deploy myproject --config ploybundle.yaml
```

## Updating a Stack

```bash
ploybundle update myproject
```

This re-renders and re-deploys the stack without rotating secrets or destroying data.

## Destroying a Stack

```bash
ploybundle destroy myproject
```

This removes all containers and volumes. **Data is permanently deleted.** The command requires interactive confirmation unless `--yes` is passed.

## Generate-Only Mode

To render artifacts locally without deploying:

```bash
# Render compose and configs for inspection
ploybundle init myproject --target lite --preset learning-app --domain myproject.example.com --host root@1.2.3.4
```

The rendered artifacts are uploaded to `/opt/ploybundle/` on the target host.
