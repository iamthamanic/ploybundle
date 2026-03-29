import { NextResponse } from "next/server";
import { Client } from "pg";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toDeployProbeUrl, toHubBackendServiceUrl } from "@/lib/hub-service-urls";

const MODULE_IDS = ["app", "auth", "database", "functions", "storage", "jobs", "deploy"] as const;
type ModuleId = (typeof MODULE_IDS)[number];

function isModuleId(id: string): id is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(id);
}

type ModuleHealth = "healthy" | "degraded" | "unknown" | "down";

export type ModuleAction = {
  id: string;
  label: string;
  /** Default "link" when href is set. */
  kind?: "link" | "post";
  href?: string;
  postPath?: string;
  postBody?: Record<string, unknown>;
  confirmMessage?: string;
  danger?: boolean;
  variant?: "primary" | "outline";
};

export type ModuleSummaryPayload = {
  module: string;
  provider: string;
  health: ModuleHealth;
  healthDetail?: string;
  metrics: Record<string, string | number | null>;
  providerConsoleUrl?: string;
  primaryUrl?: string;
  /** Quick actions: in-hub links or POSTs to /api/actions/* (whitelisted server ops). */
  actions?: ModuleAction[];
  notes: string[];
};

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function queryCount(query: string): Promise<number | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(query);
    const value = Number(res.rows?.[0]?.count ?? null);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function probeDeploy(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "manual" });
    if (res.ok) return true;
    if (res.status >= 300 && res.status < 400) return true;
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: { Range: "bytes=0-0" },
      });
      return res.ok || res.status === 206;
    }
    res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function pickNumericMetric(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function seaweedTopologyMetrics(clusterJson: unknown): Record<string, number | null> {
  const root = clusterJson as Record<string, unknown> | null;
  const t = (root?.Topology ?? root?.topology) as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return {};
  return {
    volumeSlotsMax: pickNumericMetric(t.Max, t.max),
    volumeSlotsFree: pickNumericMetric(t.Free, t.free),
  };
}

async function deployPlatformMetrics(): Promise<Record<string, string | number | null>> {
  const out: Record<string, string | number | null> = {};
  const capRoot = process.env.CAPROVER_ROOT?.replace(/\/+$/, "");
  const capPw = process.env.CAPROVER_PASSWORD;
  if (capRoot && capPw) {
    try {
      const lr = await fetch(`${capRoot}/api/v2/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: capPw }),
      });
      const lj = (await lr.json()) as { data?: { token?: string } };
      const tok = lj?.data?.token;
      if (tok) {
        const ar = await fetch(`${capRoot}/api/v2/user/apps/appDefinitions`, {
          headers: { "x-captain-auth": tok },
        });
        const aj = (await ar.json()) as { data?: { appDefinitions?: unknown[] } };
        const apps = aj?.data?.appDefinitions;
        out.caproverApps = Array.isArray(apps) ? apps.length : null;
        out.platformApi = "CapRover";
      }
    } catch {
      out.platformApi = "CapRover (unavailable)";
    }
  }
  const coolUrl = process.env.COOLIFY_URL?.replace(/\/+$/, "");
  const coolTok = process.env.COOLIFY_TOKEN;
  if (!out.platformApi && coolUrl && coolTok) {
    try {
      const paths = ["/api/v1/health", "/api/health"];
      for (const p of paths) {
        const hr = await fetch(`${coolUrl}${p}`, {
          headers: { authorization: `Bearer ${coolTok}` },
        });
        if (hr.ok) {
          out.platformApi = "Coolify";
          out.coolifyHealth = hr.status;
          break;
        }
      }
      if (!out.platformApi) out.platformApi = "Coolify (no health endpoint)";
    } catch {
      out.platformApi = "Coolify (unavailable)";
    }
  }
  return out;
}

function joinConsolePath(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/,"")}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Read-only probe: Windmill operator API with WINDMILL_SECRET (workspace path varies by install). */
async function windmillJobsApiProbe(base: string): Promise<string> {
  const secret = process.env.WINDMILL_SECRET?.trim();
  if (!secret) return "no token in hub env";
  const paths = ["/api/jobs/list?per_page=1", "/api/w/main/jobs/list?per_page=1", "/api/w/default/jobs/list?per_page=1"];
  for (const p of paths) {
    try {
      const res = await fetch(`${base.replace(/\/+$/, "")}${p}`, {
        headers: { authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      if (res.ok) return "reachable";
    } catch {
      /* try next path */
    }
  }
  return "unavailable";
}

async function fetchJsonRetryModules(url: string, init: RequestInit | undefined, attempts: number): Promise<any> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
}

async function directusAccessToken(directusBase: string): Promise<string | null> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;
  try {
    const login = await fetchJsonRetryModules(
      `${directusBase}/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      },
      8
    );
    return (login?.data?.access_token as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function queryScalarText(query: string): Promise<string | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(query);
    const row = res.rows?.[0];
    if (!row) return null;
    const k = Object.keys(row)[0];
    const v = k ? row[k] : null;
    return v != null && v !== "" ? String(v) : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function fetchSignInMethodsSummary(directusBase: string): Promise<string | null> {
  try {
    const j = await fetchJson(`${directusBase}/auth/providers`);
    const list = Array.isArray(j?.data) ? j.data : [];
    if (list.length === 0) return "default (email)";
    const names = list
      .map((p: { name?: string }) => (typeof p?.name === "string" ? p.name : null))
      .filter(Boolean) as string[];
    return names.length ? names.slice(0, 6).join(", ") : "default (email)";
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rawId = params.id;
  if (!isModuleId(rawId)) {
    return NextResponse.json({ error: "unknown module" }, { status: 404 });
  }
  const id = rawId;

  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const productRuntime =
    board.productFrontend === "vite-react" ? "Vite + React" : "Next.js";
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\/+$/, "");
  const windmillBase = toHubBackendServiceUrl(board.urls.functions, productDocker).replace(/\/+$/, "");
  const storageBrowserBase = toHubBackendServiceUrl(board.urls.storageBrowser, productDocker).replace(
    /\/+$/,
    ""
  );
  const appBase = toHubBackendServiceUrl(board.urls.app, productDocker).replace(/\/+$/, "");
  const adminBrowserBase = board.urls.admin.replace(/\/+$/, "");

  if (id === "app") {
    let health: ModuleHealth = "unknown";
    let healthDetail: string | undefined;
    try {
      await fetchText(`${appBase}/api/health`);
      health = "healthy";
      healthDetail = "GET /api/health ok";
    } catch (e: any) {
      health = "degraded";
      healthDetail = String(e?.message || e);
    }
    const body: ModuleSummaryPayload = {
      module: "App",
      provider: productRuntime,
      health,
      healthDetail,
      metrics: { runtime: productRuntime },
      providerConsoleUrl: board.urls.app,
      primaryUrl: board.urls.app,
      actions: [
        { id: "open-app", label: "Open product app", kind: "link", href: board.urls.app, variant: "primary" },
        { id: "open-hub", label: "Open Ploybundle Hub", kind: "link", href: board.urls.dashboard, variant: "outline" },
        {
          id: "restart-product",
          label: "Restart product container",
          kind: "post",
          postPath: "/api/actions/restart-service",
          postBody: { service: board.productFrontend === "vite-react" ? "vite" : "nextjs" },
          confirmMessage: "Restart the product app container? Brief downtime possible.",
          danger: true,
          variant: "outline",
        },
      ],
      notes: [
        "End-user UX lives in the product app; the hub runs whitelisted stack actions (e.g. restart) when Docker is available.",
      ],
    };
    return NextResponse.json(body);
  }

  if (id === "auth") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let users: number | null = null;
    let rolesCount: number | null = null;
    let roleNames: string | null = null;
    const signInMethods = await fetchSignInMethodsSummary(directusBase);
    const lastActivity = await queryScalarText('select max("timestamp")::text as t from directus_activity');

    const token = await directusAccessToken(directusBase);
    if (token) {
      try {
        const headers = { authorization: `Bearer ${token}` };
        const [usersRes, rolesRes] = await Promise.all([
          fetchJson(`${directusBase}/users?limit=1&meta=total_count`, { headers }),
          fetchJson(`${directusBase}/roles?limit=-1`, { headers }),
        ]);
        users = Number(usersRes?.meta?.total_count ?? null);
        const roles = Array.isArray(rolesRes?.data) ? rolesRes.data : [];
        rolesCount = roles.length;
        roleNames = roles
          .slice(0, 14)
          .map((r: { name?: string }) => (typeof r?.name === "string" ? r.name : ""))
          .filter(Boolean)
          .join(", ");
        health = Number.isFinite(users) ? "healthy" : "degraded";
        healthDetail = "Directus auth + user directory";
      } catch (e: any) {
        health = "degraded";
        healthDetail = String(e?.message || e);
      }
    } else {
      healthDetail = "Could not log in to Directus (check ADMIN_EMAIL / ADMIN_PASSWORD in hub env).";
    }

    const body: ModuleSummaryPayload = {
      module: "Auth",
      provider: "Directus",
      health,
      healthDetail,
      metrics: {
        users,
        roles: rolesCount,
        roleNames: roleNames && roleNames.length > 0 ? roleNames : null,
        signInMethods: signInMethods ?? null,
        lastDirectusActivity: lastActivity ?? null,
      },
      providerConsoleUrl: joinConsolePath(adminBrowserBase, "admin/users"),
      actions: [
        {
          id: "users-invites",
          label: "Users & invites",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/users"),
          variant: "primary",
        },
        {
          id: "roles",
          label: "Roles & access",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/settings/roles"),
          variant: "outline",
        },
        {
          id: "settings",
          label: "Project settings",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/settings"),
          variant: "outline",
        },
      ],
      notes: [
        "Ploybundle facts (counts, providers) come from this summary; full IAM screens stay in Directus (advanced).",
        "Use Create user below for a simple Directus user from the hub, or Quick actions for full admin screens.",
      ],
    };
    return NextResponse.json(body);
  }

  if (id === "database") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let collections: number | null = null;
    let approxRows: number | null = null;
    const token = await directusAccessToken(directusBase);
    if (token) {
      try {
        const headers = { authorization: `Bearer ${token}` };
        const [usersRes, filesRes, collectionsRes] = await Promise.all([
          fetchJson(`${directusBase}/users?limit=1&meta=total_count`, { headers }),
          fetchJson(`${directusBase}/files?limit=1&meta=total_count`, { headers }),
          fetchJson(`${directusBase}/collections`, { headers }),
        ]);
        const u = Number(usersRes?.meta?.total_count ?? 0);
        const f = Number(filesRes?.meta?.total_count ?? 0);
        approxRows = (Number.isFinite(u) ? u : 0) + (Number.isFinite(f) ? f : 0);
        const c = collectionsRes?.data;
        collections = Array.isArray(c) ? c.length : null;
        health = "healthy";
        healthDetail = "Collections and content API reachable";
      } catch (e: any) {
        health = "down";
        healthDetail = String(e?.message || e);
      }
    } else {
      healthDetail = "Could not reach Directus with hub credentials.";
    }
    const notes: string[] = [
      board.urls.databaseBrowser
        ? "Adminer has no separate account: use PostgreSQL login — POSTGRES_USER (same as project name) and POSTGRES_PASSWORD from .env; DB name POSTGRES_DB."
        : "Add databaseBrowser to board.json for an Adminer shortcut.",
      "Schema and app data are managed in Directus; Adminer is for raw SQL only.",
    ];
    const actions: ModuleAction[] = [
      {
        id: "content",
        label: "Content & collections",
        kind: "link",
        href: joinConsolePath(adminBrowserBase, "admin/content"),
        variant: "primary",
      },
      {
        id: "data-model",
        label: "Data model",
        kind: "link",
        href: joinConsolePath(adminBrowserBase, "admin/settings/data-model"),
        variant: "outline",
      },
      {
        id: "restart-directus",
        label: "Restart Directus container",
        kind: "post",
        postPath: "/api/actions/restart-service",
        postBody: { service: "directus" },
        confirmMessage: "Restart Directus? Active admin sessions may drop briefly.",
        danger: true,
        variant: "outline",
      },
    ];
    if (board.urls.databaseBrowser) {
      actions.push({
        id: "adminer",
        label: "SQL browser (Adminer)",
        kind: "link",
        href: board.urls.databaseBrowser.replace(/\/+$/, "") + "/",
        variant: "outline",
      });
    }
    const body: ModuleSummaryPayload = {
      module: "Database",
      provider: "Directus + PostgreSQL",
      health,
      healthDetail,
      metrics: { collections, approxContentRows: approxRows },
      providerConsoleUrl: joinConsolePath(adminBrowserBase, "admin"),
      actions,
      notes,
    };
    return NextResponse.json(body);
  }

  if (id === "functions" || id === "jobs") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let executions: number | null = null;
    let windmillVersion: string | null = null;
    try {
      const version = await fetchText(`${windmillBase}/api/version`);
      windmillVersion = version.trim() || null;
      executions = await queryCount("select count(*)::bigint as count from v2_job_completed");
      health = "healthy";
      healthDetail = windmillVersion ? `Windmill ${windmillVersion}` : "Windmill reachable";
    } catch (e: any) {
      health = "down";
      healthDetail = String(e?.message || e);
    }
    const isJobs = id === "jobs";
    const fnBase = board.urls.functions.replace(/\/+$/, "");
    const wmJobsApi = await windmillJobsApiProbe(windmillBase);
    const actions: ModuleAction[] = isJobs
      ? [
          {
            id: "schedules",
            label: "Schedules",
            kind: "link",
            href: joinConsolePath(fnBase, "schedules"),
            variant: "primary",
          },
          {
            id: "runs",
            label: "Recent runs",
            kind: "link",
            href: joinConsolePath(fnBase, "runs"),
            variant: "outline",
          },
          { id: "workspace", label: "Windmill workspace", kind: "link", href: fnBase + "/", variant: "outline" },
          {
            id: "restart-windmill",
            label: "Restart Windmill container",
            kind: "post",
            postPath: "/api/actions/restart-service",
            postBody: { service: "windmill" },
            confirmMessage: "Restart Windmill? Running jobs may be interrupted.",
            danger: true,
            variant: "outline",
          },
        ]
      : [
          { id: "workspace", label: "Scripts & flows", kind: "link", href: fnBase + "/", variant: "primary" },
          {
            id: "runs",
            label: "Recent runs",
            kind: "link",
            href: joinConsolePath(fnBase, "runs"),
            variant: "outline",
          },
          {
            id: "restart-windmill-fn",
            label: "Restart Windmill container",
            kind: "post",
            postPath: "/api/actions/restart-service",
            postBody: { service: "windmill" },
            confirmMessage: "Restart Windmill? Running jobs may be interrupted.",
            danger: true,
            variant: "outline",
          },
        ];
    const body: ModuleSummaryPayload = {
      module: isJobs ? "Jobs" : "Functions",
      provider: "Windmill",
      health,
      healthDetail,
      metrics: {
        completedExecutions: executions,
        version: windmillVersion,
        operatorJobsApi: wmJobsApi,
      },
      providerConsoleUrl: isJobs ? joinConsolePath(fnBase, "schedules") : fnBase + "/",
      actions,
      notes: isJobs
        ? [
            "Schedules and run history are edited in Windmill; the hub only aggregates counts.",
            "Windmill UI: on first visit, complete signup / create the initial workspace user (self-hosted). SUPERADMIN_SECRET in .env is for API automation, not the browser password.",
          ]
        : [
            "Flows and API triggers are configured in Windmill.",
            "Windmill UI: on first visit, complete signup / create the initial workspace user (self-hosted). SUPERADMIN_SECRET in .env is for API automation, not the browser password.",
          ],
    };
    return NextResponse.json(body);
  }

  if (id === "storage") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let clusterJson: unknown = null;
    try {
      clusterJson = await fetchJson(`${storageBrowserBase}/cluster/status`);
      health = "healthy";
      healthDetail = "SeaweedFS cluster status ok";
    } catch (e: any) {
      health = "down";
      healthDetail = String(e?.message || e);
    }
    const buckets = board.bucketCount ?? null;
    const browser = board.urls.storageBrowser.replace(/\/+$/, "");
    const s3 = board.urls.storage.replace(/\/+$/, "");
    const topo = clusterJson ? seaweedTopologyMetrics(clusterJson) : {};
    const hasS3Creds = Boolean(process.env.SEAWEEDFS_ACCESS_KEY && process.env.SEAWEEDFS_SECRET_KEY);
    const body: ModuleSummaryPayload = {
      module: "Storage",
      provider: "SeaweedFS + Directus files",
      health,
      healthDetail,
      metrics: {
        bucketsConfigured: buckets,
        s3Endpoint: s3,
        hubHasS3Credentials: hasS3Creds ? "yes" : "no",
        ...topo,
      },
      providerConsoleUrl: browser + "/",
      primaryUrl: s3,
      actions: [
        {
          id: "files",
          label: "File library (Directus)",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/files"),
          variant: "primary",
        },
        {
          id: "s3",
          label: "S3 API (integrations)",
          kind: "link",
          href: s3 + "/",
          variant: "outline",
        },
        {
          id: "cluster-ui",
          label: "Cluster browser (advanced)",
          kind: "link",
          href: browser + "/",
          variant: "outline",
        },
        {
          id: "restart-seaweed",
          label: "Restart SeaweedFS container",
          kind: "post",
          postPath: "/api/actions/restart-service",
          postBody: { service: "seaweedfs" },
          confirmMessage: "Restart SeaweedFS? Uploads and S3 may be briefly unavailable.",
          danger: true,
          variant: "outline",
        },
      ],
      notes: [
        "Prefer Directus files for editorial assets; raw Seaweed UI is for operators.",
        "Hub login is only for this dashboard. Opening Directus or Windmill opens a separate app — sign in there too (Directus: DIRECTUS_ADMIN_EMAIL / DIRECTUS_ADMIN_PASSWORD in local-dev/.env).",
        "S3 port (:8333) is the AWS-compatible API; the site root often returns 403 without request signing — use Directus files or the cluster browser for normal browsing.",
        "If links fail with connection refused, use 127.0.0.1 instead of localhost (IPv6 vs Docker IPv4) or ensure Docker Compose has started the stack.",
      ],
    };
    return NextResponse.json(body);
  }

  // deploy
  const deployUrl = board.urls.deploy.replace(/\/+$/, "");
  const deployProbeUrl = toDeployProbeUrl(deployUrl, board.urls.app, productDocker);
  const ok = await probeDeploy(deployProbeUrl);
  const platformExtra = await deployPlatformMetrics();
  const body: ModuleSummaryPayload = {
    module: "Deploy",
    provider: "CapRover / Coolify",
    health: ok ? "healthy" : "degraded",
    healthDetail: ok ? "Deploy UI reachable" : "Could not reach deploy URL from hub",
    metrics: { reachable: ok ? "yes" : "no", ...platformExtra },
    providerConsoleUrl: deployUrl + "/",
    primaryUrl: deployUrl + "/",
    actions: [
      {
        id: "deploy-dash",
        label: "Open deploy dashboard",
        kind: "link",
        href: deployUrl + "/",
        variant: "primary",
      },
    ],
    notes: [
      "CapRover/Coolify app counts and health are summarized above when API tokens are present in hub env (CAPROVER_* / COOLIFY_*).",
      "Restart and rollback stay in the deploy platform until wired through hub actions.",
      "Local stacks often point deploy at the product app (e.g. :3001). For CapRover/Coolify on the host, set modes.local.domain.deploy in ploybundle.yaml (e.g. localhost:3000 or :8000) and ensure the hub compose service has extra_hosts host.docker.internal.",
    ],
  };
  return NextResponse.json(body);
}
