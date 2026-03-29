# Ploybundle — Overview for humans and agents

This document is the **single entry point** for understanding what Ploybundle is, what it ships, how to use it, and where it **stops**. It lives at the **repository root** so it stays visible in every clone and is easy to commit. Point coding agents here before implementing features “on top of Ploybundle” or changing the stack.

---

## 1. What Ploybundle is (and is not)

**Ploybundle** is a **project-scoped bundle generator and installer**. It assembles a **self-hosted** stack from opinionated, best-of-breed services and outputs **Docker Compose**, config files, a **product frontend** scaffold (**Next.js** *or* **React + Vite**), and a **Ploybundle Hub** (always **Next.js**) as a thin **control-plane UI** separate from the product app.

| Ploybundle **is** | Ploybundle **is not** |
|-------------------|----------------------|
| Code + CLI that **materializes** a full stack per project | A hosted BaaS like Supabase or Appwrite |
| **Docker Compose** as the intended runtime (local + VPS path) | Kubernetes, Terraform, or a shared multi-tenant cloud |
| A **curated** set of services (Postgres, Directus, Windmill, …) | A guarantee that every PRD fits without extra services |
| A **Hub** that surfaces status, links, logs, spec, and some server actions | A replacement for every provider’s native admin UI |
| **Extensible** by adding services to Compose, Windmill flows, Directus schema, app code | “One API” that abstracts all backends behind a single SDK |

**Mental model for agents:** Treat Ploybundle like **“infra + conventions + a dashboard shell”**, not like **“call `supabase.from()` and you are done”**. Business logic and domain APIs still live in the **generated app**, **Windmill**, or **Directus** extensions—chosen deliberately per feature.

---

## 2. Default stack (what gets deployed)

Typical generated stack (exact set depends on `ploybundle.yaml` / preset):

| Service | Role |
|---------|------|
| **Hub** | Project dashboard (Next.js): overview, module summaries, deep links, optional logs/settings/actions |
| **Product app** | User-facing UI: **`frontend: nextjs`** → Next.js app (+ API routes); **`frontend: vite-react`** → Vite + React, served via nginx in Compose (mutually exclusive Compose service: `nextjs` vs `vite`) |
| **Postgres** | Primary database |
| **Redis** | Cache and queue backing |
| **Directus** | Admin UI, auth/content/data layer for operators and many CRUD cases |
| **SeaweedFS** | S3-compatible object storage |
| **Windmill** | Background jobs, schedules, workflows, HTTP-triggered scripts |
| **Adminer** (optional) | SQL browser when enabled |

**Platform targets (VPS):** `lite` → CapRover, `full` → Coolify (adapters in `packages/platform-caprover`, `packages/platform-coolify`). TLS and edge routing are handled by that control plane, not by Ploybundle inventing a new edge layer.

**Frontend choice:** In project config, `frontend` is `nextjs` (default) or `vite-react` (`ProductFrontend` in `@ploybundle/shared`). Presets and `ploybundle.yaml` drive this. The **Hub does not switch**—only the generated **product** app does.

---

## 3. Repository layout (where to look in code)

| Path | Purpose |
|------|---------|
| `packages/cli` | CLI: `init`, `deploy`, `status`, `logs`, `promote`, … |
| `packages/templates` | **Renders** Compose, `.env`, `hub/`, app scaffold, scripts from config |
| `packages/templates/src/renderer/hub-renderer.ts` | **Source of truth** for generated Hub routes and components |
| `packages/templates/src/renderer/compose-renderer.ts` | Compose file generation (including Hub service, volumes, env) |
| `packages/templates/src/presets/hub-defaults.ts` | Default Hub navigation sections (App, Auth, Database, …) |
| `packages/core` | Orchestration, config, SSH, promotion flows |
| `packages/shared` | Shared types and constants |
| `docs/` | Deeper guides: architecture, CLI, deployment, presets, security |
| **`ploybundleoverview.md` (this file, repo root)** | **Canonical** high-level overview for humans and agents |

**Important:** The Hub users see in a project is the **generated** `hub/` tree. To change Hub behavior for **all** future projects, edit **`hub-renderer.ts`** (and related tests), not only one materialized `local-dev/hub` copy—unless you intentionally patch a single deployment only.

---

## 4. Hub (control plane UI) — capabilities and intent

The Hub is **task-first** (areas like App, Auth, Storage) rather than dumping users straight into each tool. It combines:

- **Overview:** health/KPI-style summaries and shortcuts  
- **Per-module pages:** `ModuleControlSurface` + service cards and **“Open provider console (advanced)”** style escape hatches  
- **BFF-style API routes** under `hub/src/app/api/…` (overview, modules by id, ping, project spec, logs, invite-user, …)

**Rough map of generated Hub surface** (names may evolve; check `hub-renderer.ts`):

- `/` — Overview  
- `/[categoryId]` — Category/module view (e.g. `app`, `auth`, `storage`, …)  
- `/logs` — Log viewer (Docker-backed when enabled)  
- `/settings` — Read-only project spec (`board.json`), optional env **key names** (never values) when configured  

**Default hub sections** (from `hub-defaults.ts`): Overview; App; Auth; Database; Functions; Storage; Jobs; Logs; Deploy; Settings.

**Agents should assume:** Many actions are still **links** into Directus, Windmill, or platform UIs. Native Hub mutations are **incremental** (e.g. invite user); heavy ops (restart all services, migrations, full deploy pipelines) may still be **CLI or provider** until explicitly implemented.

---

## 5. How to run and where to click

**Requirement:** **Docker with Compose v2**. The stack is designed to run **only** via Compose for predictable ops.

From the **Ploybundle repo** (development of the tool itself):

```bash
pnpm install
pnpm build
pnpm run docker:up
```

Then open the **Hub** at **http://localhost:7580** (see script output; local mode often maps Hub to `7580`).

For a **user project** created with `ploybundle init`, materialized files and URLs depend on `ploybundle.yaml` and `modes.local.domain` / production domain—use `ploybundle status <name>` and the generated README or script output.

---

## 6. CLI essentials

| Command | Purpose |
|---------|---------|
| `ploybundle init <name>` | Bootstrap project config and deploy (or prepare) stack |
| `ploybundle deploy <name>` | Deploy / re-deploy |
| `ploybundle status <name>` | Health and URLs |
| `ploybundle logs <name>` | Service logs |
| `ploybundle promote <name>` | Push local state toward server stack (DB/storage options) |
| `ploybundle doctor <name>` | Diagnostics |

Use `--mode local|server` where supported. Many commands accept `--json` for automation.

Full detail: [CLI Reference](docs/cli.md).

---

## 7. Presets

Presets tune **which services are on**, **buckets**, **Directus collections**, **Windmill flows**, and **product frontend options** (Next.js feature flags when applicable). They are **opinionated but minimal**—they configure seeds and scaffolding; they do **not** generate a full custom product.

See [Presets](docs/presets.md) for `learning-app`, `crud-saas`, `content-app`, and `workflow-app` (each preset sketches buckets, seeds, and scaffold focus—e.g. learning/gamification vs multi-tenant CRUD vs publishing vs automation).

---

## 8. How agents should use Ploybundle as a “base”

1. **Read this file first**, then [Architecture](docs/architecture.md), [Presets](docs/presets.md), and [Security](docs/security.md) if touching auth, secrets, or deploy.  
2. **Prefer extending in this order** unless the PRD forbids it:  
   - **Directus** — content, admin CRUD, roles, many “backoffice” needs  
   - **Windmill** — schedules, queues, long-running or isolated jobs  
   - **Product app (Next.js or Vite+React)** — user-facing UX; use **Next API routes** or a **small backend service** for BFF logic that must not expose secrets (Vite builds static/SPA-style assets; APIs are usually separate or proxied)  
   - **New Compose services** — GPU workers, custom APIs, crawlers, preview runners—when the default stack is not enough  
3. **Do not** add a second primary database or second auth system without an explicit architectural reason and migration story.  
4. **Do not** assume the Hub implements every control-plane action**;** check generated routes and `hub-renderer.ts` before promising “restart from UI”.  
5. When comparing to **Supabase**: Postgres + Directus + Windmill + Seaweed **can** cover many of the same *roles* (data, auth, storage, functions), but **APIs and DX differ**—the product code must target **your** chosen layer (Directus REST/GraphQL, Windmill webhooks, Next API routes, or external APIs when using Vite).

---

## 9. Limits and non-goals (honest boundary)

These are **current** limits; some may shrink as the project evolves:

| Area | Limit |
|------|--------|
| **Product category** | Ploybundle is **not** your vertical product. It does **not** implement specialized domains by itself—e.g. heavy **media / 3D / render farms**, **deep Git analytics with isolated “run any commit” sandboxes**, or **game clients**—it only supplies **generic** data, auth, storage, jobs, and UI shells; you add domain services and apps on top. |
| **Multi-project SaaS** | One **project** → one **stack**. A global “all my projects” cloud is **out of scope** unless you build it as a separate product. |
| **Hub vs providers** | Hub will not replace Directus/Windmill/Coolify for **all** deep workflows; it aggregates and **routes** first. |
| **Dangerous ops** | Start/stop/rebuild/migrate from Hub may require **privileged** Docker or platform APIs—**security-sensitive**, not universally enabled. |
| **GPU / ML workers** | Not generated by default; add **your own** images and Compose services. |
| **Isolated code execution** | No built-in **secure sandbox** for **untrusted or arbitrary repository/build code** (typical need: **preview environments per commit**, **CI that executes cloned code**). You must add **your own** isolation (containers, VMs, hardened runners, policy). |
| **Realtime** | Not “Supabase Realtime out of the box”; use **your** pattern (polling, SSE, WebSocket in app, or provider features). |
| **Single SDK** | There is no one `ploybundle-js` client that mirrors the whole stack—integration is **per service**. |

---

## 10. Security reminders for agents

- Never commit **secrets** or full `.env` files; use env templates and secret managers on the server.  
- Hub and APIs must **not** leak secret values; project-spec style endpoints may expose **key names** only when explicitly enabled.  
- Rate-limit and validate **any** Hub mutation endpoints (e.g. user invite).  
- See [Security](docs/security.md).

---

## 11. Related documentation

- [Architecture](docs/architecture.md)  
- [CLI Reference](docs/cli.md)  
- [Deployment](docs/deployment.md)  
- [Presets](docs/presets.md)  
- [Security](docs/security.md)  
- [Troubleshooting](docs/troubleshooting.md)  

---

## 12. One-line summary for agent system prompts

> **Ploybundle** generates a **Docker Compose–first**, **self-hosted** stack (Postgres, Directus, Windmill, SeaweedFS, Redis, **product app** = Next.js *or* Vite+React, plus **Hub** = Next.js) per project; extend via **Directus**, **Windmill**, the **product frontend**, and **extra Compose services**. It is **not** a hosted BaaS; the **Hub** is a **control-plane shell**, not a full replacement for every provider UI. Read **`ploybundleoverview.md`** at the repo root before assuming features.
