# Ploybundle

Project-scoped self-hosted app bundle generator and installer.

Ploybundle assembles a production-ready stack from best-of-breed self-hosted tools and deploys it to a VPS with a single command. Each project gets its own isolated stack — no shared multi-tenant platform, no Kubernetes, no Terraform.

## Quick Start

```bash
# Install
pnpm install
pnpm build

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
| Homepage   | Project dashboard             |
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
```

All commands support `--json`, `--quiet`, and `--no-color` flags.

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

- Node.js >= 20
- pnpm >= 9
- Target VPS: Ubuntu 24.04 LTS
- Domain with DNS configured

## Documentation

- [Architecture](docs/architecture.md)
- [CLI Reference](docs/cli.md)
- [Deployment Guide](docs/deployment.md)
- [Presets](docs/presets.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

MIT
