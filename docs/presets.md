# Presets

Presets define the shape and personality of a Ploybundle project. Each preset configures:
- Service defaults (which services are enabled)
- Seed behavior (buckets, collections, flows)
- Homepage layout
- Next.js app features
- Environment defaults

Presets are opinionated but minimal. They configure, they do not generate complex code.

## Available Presets

### `learning-app`

**Use case**: Gamified learning platform with missions, progress tracking, and content authoring.

**Reference project**: Questolin — a mobile-first, gamified learning app.

| Component  | Role                                            |
|------------|--------------------------------------------------|
| Next.js    | Feed, mission player, gameplay APIs, session UX  |
| Postgres   | Users, missions, progress, XP, leaderboards     |
| Directus   | Mission authoring, pattern cards, skill trees    |
| SeaweedFS  | Mission assets, card media, uploads              |
| Windmill   | XP recalculation, review scheduling, notifications |

**Buckets**: `assets` (public), `missions` (private), `uploads` (private)

**Directus Collections**: `missions`, `skill_trees`, `pattern_cards`

**Windmill Flows**:
- `daily_xp_recalculation` — cron job at 3am UTC
- `review_scheduler` — spaced repetition scheduling at 4am UTC
- `notification_webhook` — triggered on mission completion

---

### `crud-saas`

**Use case**: Standard multi-tenant SaaS application with CRUD operations.

| Component  | Role                                    |
|------------|------------------------------------------|
| Next.js    | Dashboard, CRUD views, tenant management |
| Postgres   | Tenants, records, usage data             |
| Directus   | Tenant and record management             |
| SeaweedFS  | File uploads, data exports               |
| Windmill   | Data exports, usage aggregation          |

**Buckets**: `uploads` (private), `exports` (private)

**Directus Collections**: `tenants`, `records`

**Windmill Flows**:
- `data_export` — script for tenant data export to CSV
- `usage_aggregation` — daily usage metric aggregation

---

### `content-app`

**Use case**: Content publishing platform with rich media management.

| Component  | Role                                    |
|------------|------------------------------------------|
| Next.js    | Article listing, reader, pages, search   |
| Postgres   | Articles, categories, pages              |
| Directus   | Content management, editorial workflows  |
| SeaweedFS  | Media library, thumbnails                |
| Windmill   | Thumbnail generation, scheduled publishing|

**Buckets**: `media` (public), `uploads` (private), `thumbnails` (public)

**Directus Collections**: `articles`, `categories`, `pages`

**Windmill Flows**:
- `thumbnail_generator` — processes uploaded images
- `publish_scheduler` — publishes scheduled articles every 5 minutes

---

### `workflow-app`

**Use case**: Workflow automation and data pipeline platform.

| Component  | Role                                        |
|------------|----------------------------------------------|
| Next.js    | Workflow dashboard, job monitor, webhook UI  |
| Postgres   | Workflow definitions, job run history        |
| Directus   | Workflow configuration                       |
| SeaweedFS  | Pipeline inputs, outputs, artifacts          |
| Windmill   | Pipeline execution, cleanup, webhook triggers|

**Buckets**: `inputs` (private), `outputs` (private), `artifacts` (private)

**Directus Collections**: `workflows`, `job_runs`

**Windmill Flows**:
- `pipeline_executor` — runs data pipeline steps
- `cleanup_old_runs` — weekly cleanup of old job records
- `webhook_trigger` — handles external webhook payloads

## Creating Custom Presets

Presets are TypeScript objects implementing the `PresetDefinition` interface. To add a custom preset:

1. Create a new file in `packages/templates/src/presets/`
2. Export a `PresetDefinition` object
3. Register it in `packages/templates/src/presets/index.ts`

See existing presets for reference. The interface ensures type safety for all required fields.
