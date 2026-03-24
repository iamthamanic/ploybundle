# Architecture

## Overview

Ploybundle is a monorepo that generates and deploys isolated, project-scoped application stacks on single VPS instances. The architecture follows Clean Architecture principles with explicit separation between domain logic, infrastructure, and presentation.

## Layer Diagram

```
┌──────────────────────────────────────────────┐
│                   CLI                        │
│  (commands, output formatting, user I/O)     │
├──────────────────────────────────────────────┤
│              Orchestrator                    │
│  (deploy pipeline, phase management)         │
├────────────┬─────────────┬───────────────────┤
│   Config   │   Secrets   │   Host Inspector  │
│   Parser   │   Manager   │   Docker Installer│
├────────────┴─────────────┴───────────────────┤
│           Platform Adapter Interface         │
├──────────────────┬───────────────────────────┤
│  CapRover Adapter│   Coolify Adapter         │
├──────────────────┴───────────────────────────┤
│           SSH Service                        │
│  (command execution, file transfer)          │
├──────────────────────────────────────────────┤
│         Template / Preset System             │
│  (compose, homepage, service configs)        │
└──────────────────────────────────────────────┘
```

## Package Dependency Graph

```
@ploybundle/cli
  ├── @ploybundle/core
  ├── @ploybundle/templates
  ├── @ploybundle/platform-caprover
  └── @ploybundle/platform-coolify

@ploybundle/core
  └── @ploybundle/shared

@ploybundle/templates
  └── @ploybundle/shared

@ploybundle/platform-caprover
  ├── @ploybundle/shared
  └── @ploybundle/core

@ploybundle/platform-coolify
  ├── @ploybundle/shared
  └── @ploybundle/core

@ploybundle/mcp
  ├── @ploybundle/shared
  └── @ploybundle/core
```

## Key Design Decisions

### Platform Adapter Pattern

Core domain logic never depends on CapRover or Coolify directly. The `PlatformAdapter` interface defines the contract:

```typescript
interface PlatformAdapter {
  validateHost(ssh: SshTarget): Promise<HostDiagnosis>;
  installPlatform(ssh: SshTarget, config: ProjectConfig): Promise<PhaseResult>;
  deployStack(ssh: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult>;
  // ...
}
```

Adding a new platform means implementing this interface. No changes to core, CLI, or templates required.

### Orchestrator Pipeline

The init command runs a deterministic 8-phase pipeline:

1. **Validate** - Parse and validate config
2. **Connect** - Verify SSH connectivity
3. **Inspect** - Check host requirements, install Docker if missing
4. **Install Platform** - Install CapRover or Coolify
5. **Render** - Generate all stack artifacts (compose, configs, env files)
6. **Deploy** - Upload and start the stack
7. **Seed** - Configure services (buckets, collections, roles)
8. **Verify** - Health-check all services

Each phase is idempotent. Re-running produces the same result.

### Secrets Management

Secrets are generated server-side and stored at `/opt/ploybundle/.secrets.json` with `chmod 600`. Re-runs load existing secrets instead of rotating them. Secrets never appear in local config files or git history.

### Preset System

Presets define the "personality" of a project:
- Which services are enabled
- What buckets to create
- Which Directus collections to scaffold
- Which Windmill flows to provision
- Homepage layout and links
- Next.js app features and env defaults

Presets are data objects, not code generators. They feed into the artifact renderer.

## Deployed Stack Architecture

```
┌────────────────────────────────────────────┐
│                  Internet                   │
│         (DNS → VPS public IP)              │
├────────────────────────────────────────────┤
│  CapRover / Coolify (reverse proxy + TLS)  │
├────┬────┬────┬────────┬────────┬───────────┤
│Home│Next│Dir-│SeaweedFS│Windmill│  Windmill │
│page│.js │ectus│        │  API   │  Worker   │
├────┴────┴──┬─┴────────┴────────┴───────────┤
│         Postgres        │      Redis        │
└─────────────────────────┴───────────────────┘
             Docker Compose
```

## Compared to Alternatives

### vs Appwrite Self-Host
Ploybundle is more modular — each service is a best-of-breed tool with its own UI. Appwrite provides a more integrated single-vendor console. Ploybundle wins on flexibility and composability; Appwrite wins on platform cohesion.

### vs Supabase Self-Host
Supabase is Postgres-centric with tightly integrated extensions. Ploybundle separates concerns more explicitly (Directus for admin, SeaweedFS for storage, Windmill for jobs). Supabase wins on database-centric architecture; Ploybundle wins on clear module separation.

### vs Nhost Self-Host
Nhost centers on Hasura/GraphQL. Ploybundle uses REST-first tools with more flexible composition. Nhost wins on integrated backend developer workflow; Ploybundle wins on control-plane choice and project-scoped isolation.

These are architectural trade-offs, not value judgments. Choose based on your project's needs.
