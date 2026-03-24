# Ploybundle Homepage -> Homarr Migration

## Current Homepage Analysis

- `Homepage` is currently generated from preset metadata in `packages/templates/src/presets/*` and rendered by `packages/templates/src/renderer/homepage-renderer.ts`.
- Existing group model is a single `Quick Links` group plus simple greeting/resource widgets.
- Links are template-resolved from `{{urls.app}}`, `{{urls.admin}}`, `{{urls.storage}}`, `{{urls.functions}}`, `{{urls.deploy}}`, and `{{urls.dashboard}}`.
- No docker-label integration is used for Homepage (docker socket is intentionally not mounted).
- No custom Homepage CSS is currently generated.
- Existing product semantics already map to Ploybundle categories through link labels and preset notes.

## Homepage to Homarr Concept Mapping

- **Homepage groups** -> **Homarr board sections** (category-first cards)
- **Homepage services list** -> **Homarr apps/tiles**
- **Homepage widgets** -> **Homarr built-in widgets/integrations**
- **Homepage deep links** -> **Homarr app targets**
- **Homepage status hints** -> **Homarr HTTP integrations/health checks**
- **Homepage branding** -> **Homarr board naming/theme (minimal custom styling)**

## Product Rule Preservation

- Homarr stays a hub/navigation/status shell only.
- Directus, Windmill, SeaweedFS, and CapRover/Coolify remain the advanced work surfaces.
- Categories are the primary UX label.
- Tool/service names are retained as compact secondary badges.
- URLs are preserved and continue using existing domain conventions.

## Category Model Implemented

The Homarr board model exposes these top-level entries:

1. Overview
2. Users & Access (Directus)
3. Data & Content (Directus + Postgres)
4. Files (SeaweedFS + Directus)
5. Jobs & Functions (Windmill)
6. App (Next.js)
7. Deploy (CapRover/Coolify)
8. Advanced

Each entry contains:

- title
- short description
- status hint
- 2-4 deep links
- service badge
- optional notes

## Provisioning & Automation

Generated stack artifacts now include:

- `homarr/seed/board-model.json`
- `homarr/seed/integrations-model.json`
- `scripts/bootstrap-homarr.sh`
- `scripts/homarr-api-provision.mjs`

Provisioning strategy:

- Use Homarr API when `HOMARR_ADMIN_TOKEN` is available.
- Fallback gracefully to manual import of generated seed JSON if API routes differ.

## Rollback Path

Rollback artifacts are generated as:

- `scripts/rollback-dashboard-homepage.sh`

Rollback flow:

1. Generate rollback compose override via script.
2. Apply generated compose rollback file.
3. Re-run `docker compose up -d --remove-orphans`.

This keeps rollback simple, deterministic, and low risk.
