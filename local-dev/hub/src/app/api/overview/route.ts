import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";
import { Client } from "pg";

type ServiceState = { name: string; status: "healthy" | "degraded" | "down"; details?: string };

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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonRetry(url: string, init: RequestInit | undefined, attempts: number): Promise<any> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url, init);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
}

async function fetchTextRetry(url: string, init: RequestInit | undefined, attempts: number): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url, init);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
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

export async function GET() {
  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const productLabel =
    board.productFrontend === "vite-react" ? "Product app (Vite)" : "Product app (Next.js)";
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\/+$/, "");
  const windmillBase = toHubBackendServiceUrl(board.urls.functions, productDocker).replace(/\/+$/, "");
  const storageBrowserBase = toHubBackendServiceUrl(board.urls.storageBrowser, productDocker).replace(
    /\/+$/,
    ""
  );
  const appBase = toHubBackendServiceUrl(board.urls.app, productDocker).replace(/\/+$/, "");
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;
  const workspace = process.env.PROJECT_NAME || "localdev";

  const services: ServiceState[] = [];
  let users: number | null = null;
  let rows: number | null = null;
  let collections: number | null = null;
  let executions: number | null = null;
  let requests: number | null = null;
  let buckets: number | null = board.bucketCount ?? null;

  // Directus metrics: login -> users/files/collections counts.
  if (!adminEmail?.trim() || !adminPassword?.trim()) {
    services.push({
      name: "Directus",
      status: "degraded",
      details:
        "Missing admin credentials: set DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD in .env (hub also receives ADMIN_EMAIL/ADMIN_PASSWORD from compose).",
    });
  } else {
    try {
      const login = await fetchJsonRetry(
        `${directusBase}/auth/login`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: adminEmail, password: adminPassword }),
        },
        8
      );
      const token = login?.data?.access_token as string | undefined;
      if (!token) throw new Error("no access token");

      const headers = { authorization: `Bearer ${token}` };
      const [usersRes, filesRes, collectionsRes] = await Promise.all([
        fetchJson(`${directusBase}/users?limit=1&meta=total_count`, { headers }),
        fetchJson(`${directusBase}/files?limit=1&meta=total_count`, { headers }),
        fetchJson(`${directusBase}/collections`, { headers }),
      ]);
      users = Number(usersRes?.meta?.total_count ?? null);
      const fileRows = Number(filesRes?.meta?.total_count ?? 0);
      rows = (Number.isFinite(users ?? NaN) ? Number(users) : 0) + (Number.isFinite(fileRows) ? fileRows : 0);
      const c = collectionsRes?.data;
      collections = Array.isArray(c) ? c.length : null;
      services.push({ name: "Directus", status: "healthy", details: "users/files/collections live" });
    } catch (err: any) {
      services.push({ name: "Directus", status: "degraded", details: String(err?.message || err) });
    }
  }

  // Windmill: version endpoint + DB-backed execution count (stable for local-dev).
  try {
    const version = await fetchTextRetry(`${windmillBase}/api/version`, undefined, 10);
    executions = await queryCount("select count(*)::bigint as count from v2_job_completed");
    services.push({ name: "Windmill", status: "healthy", details: `version ${version.trim()}` });
  } catch (err: any) {
    services.push({ name: "Windmill", status: "down", details: String(err?.message || err) });
  }

  // SeaweedFS: live cluster signal + configured bucket count from board config.
  try {
    await fetchJson(`${storageBrowserBase}/cluster/status`);
    services.push({ name: "SeaweedFS", status: "healthy", details: "cluster reachable" });
  } catch (err: any) {
    services.push({ name: "SeaweedFS", status: "down", details: String(err?.message || err) });
  }

  // App health.
  try {
    await fetchText(`${appBase}/api/health`);
    services.push({ name: productLabel, status: "healthy", details: "health endpoint ok" });
  } catch {
    services.push({ name: productLabel, status: "degraded", details: "health endpoint not exposed" });
  }

  // Requests KPI from Directus activity table; fallback to healthy service count.
  const reqCount = await queryCount("select count(*)::bigint as count from directus_activity");
  requests = reqCount ?? services.filter((s) => s.status === "healthy").length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    kpis: { users, requests, rows, executions, collections, buckets },
    services,
  });
}
