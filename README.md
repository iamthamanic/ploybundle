# Ploybundle

Project-scoped self-hosted app bundle generator and installer.

Ploybundle assembles a production-ready stack from best-of-breed self-hosted tools and deploys it to a VPS with a single command. Each project gets its own isolated stack — no shared multi-tenant platform, no Kubernetes, no Terraform.

## Running the stack (Docker only)

**The full app stack is meant to run in Docker Compose only.** You do not start Postgres, Directus, Windmill, the Hub, etc. by hand — that keeps setup predictable for small teams and solo builders.

What you need on your machine:

- **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose v2** (Linux), running before you start.
- **Node.js ≥ 20** and **pnpm ≥ 9** to build the repo and CLI from source.

Easiest path inside this repo:

```bash
pnpm install
pnpm build
pnpm run docker:up
```

That checks Docker, regenerates `local-dev/` from templates, and runs `docker compose up -d --build`. Then open the **Hub** at **http://localhost:7580** (see script output for URLs).

Same as `pnpm run local-dev:up`. To only regenerate files without starting containers: `pnpm run local-dev:stack`.

## Quick Start

```bash
# Install
pnpm install
pnpm build

# Local demo (same generated artifacts + ploybundle.yaml as a user project; Docker required)
pnpm run demo:user
# then: pnpm run docker:up   OR   cd local-dev && docker compose up -d --build

# Runtime modes
ploybundle deploy localdev --mode local
ploybundle status localdev --mode local
ploybundle logs localdev --mode local

# Deploy a project
ploybundle init questolin \
  --target lite \
  --host root@YOUR_VPS_IP \
  --preset learning-app \
  --domain questolin.example.com
```

## What Gets Deployed

| Service    | Role                          |
|------------|-------------------------------|
| Hub        | Project hub dashboard & links |
| Next.js    | Frontend + API routes         |
| Postgres   | Primary database              |
| Redis      | Cache & queue                 |
| Directus   | Admin UI, auth, content CMS   |
| SeaweedFS  | S3-compatible object storage  |
| Windmill   | Background jobs & workflows   |

## Platform Targets

| Target | Control Plane | Best For           |
|--------|---------------|--------------------|
| Lite   | CapRover      | Smaller VPS, lower overhead |
| Full   | Coolify       | Larger projects, richer ops |

Both targets share the same architecture, presets, and CLI. Only the platform adapter changes.

## Presets

| Preset         | Use Case                        |
|----------------|----------------------------------|
| `learning-app` | Gamified learning platform       |
| `crud-saas`    | Standard SaaS with CRUD & tenants |
| `content-app`  | Content publishing platform      |
| `workflow-app` | Workflow automation & pipelines  |

## CLI Commands

```bash
ploybundle init <name>     # Bootstrap and deploy a new project
ploybundle deploy <name>   # Deploy or re-deploy the stack
ploybundle status <name>   # Show service health and URLs
ploybundle logs <name>     # View service logs
ploybundle update <name>   # Update stack preserving config
ploybundle destroy <name>  # Tear down with confirmation
ploybundle doctor <name>   # Run diagnostics
ploybundle open <name>     # Open dashboard in browser
ploybundle promote <name>  # Push local data and stack state onto the server runtime
```

All commands support `--json`, `--quiet`, and `--no-color` flags.

Most operational commands also support `--mode local|server`. `local` materializes and runs the generated stack under `.ploybundle-state/local/stack` using Docker Compose. `server` keeps the existing SSH/VPS deployment flow.

When a project is ready to leave local mode behind, run:

```bash
ploybundle promote myapp
```

That command re-deploys the `server` mode by default, restores the local Postgres data into the VPS stack, and mirrors SeaweedFS buckets to the server. Use `--skip-deploy`, `--skip-db`, or `--skip-storage` to narrow the promotion scope.

## Dual Mode Config

```yaml
projectName: myapp
mode: local
preset: crud-saas
email: admin@myapp.dev
directus:
  adminEmail: admin@myapp.dev

modes:
  local:
    domain:
      root: localhost
      app: localhost:3001
      admin: localhost:8055
      storage: localhost:8333
      storageBrowser: localhost:9333
      functions: localhost:8000
      dashboard: localhost:7580
      databaseBrowser: localhost:8088
      scheme: http

  server:
    target: lite
    ssh:
      user: root
      host: 1.2.3.4
      port: 22
    domain:
      root: myapp.example.com
```

## Project Structure

```
packages/
  shared/              # Types, constants, utilities
  core/                # Config, SSH, secrets, orchestration
  cli/                 # CLI application
  templates/           # Presets and artifact rendering
  platform-caprover/   # CapRover adapter
  platform-coolify/    # Coolify adapter
  mcp/                 # MCP server (prepared for v2)
fixtures/              # Example configs
docs/                  # Architecture and usage docs
```

## Requirements

- **Docker** with **Compose v2** (required to run the stack locally or to mirror production)
- Node.js >= 20
- pnpm >= 9
- Target VPS: Ubuntu 24.04 LTS
- Domain with DNS configured

## Documentation

- [Ploybundle overview (for agents & onboarding)](ploybundleoverview.md)
- [Architecture](docs/architecture.md)
- [CLI Reference](docs/cli.md)
- [Deployment Guide](docs/deployment.md)
- [Presets](docs/presets.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Homarr Migration](docs/homarr-migration.md)

## License

MIT
