import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { n: number; t: number }>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return true;
  }
  if (h.n >= MAX_PER_WINDOW) return false;
  h.n += 1;
  return true;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(res.status + " " + (body?.errors?.[0]?.message || text).slice(0, 200));
  return body;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateOk(ip)) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\/+$/, "");
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;

  try {
    const login = await fetchJson(`${directusBase}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const token = login?.data?.access_token as string | undefined;
    if (!token) throw new Error("no access token");

    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    let roleId = process.env.DIRECTUS_INVITE_ROLE_ID?.trim();
    if (!roleId) {
      const roles = await fetchJson(`${directusBase}/roles?limit=-1`, { headers });
      const list = Array.isArray(roles?.data) ? roles.data : [];
      const pick = list.find((r: { id?: string; name?: string }) => r?.name === "Editor") || list[0];
      roleId = pick?.id;
    }
    if (!roleId) throw new Error("no role id");

    const created = await fetchJson(`${directusBase}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, role: roleId, status: "active" }),
    });
    const id = created?.data?.id;
    await appendHubAudit(req, "invite-user", { email, id });
    return NextResponse.json({ ok: true, id, email });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
