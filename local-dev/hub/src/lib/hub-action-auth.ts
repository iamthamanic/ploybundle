import crypto from "node:crypto";
import { Client } from "pg";
import { NextResponse } from "next/server";

export const HUB_SESSION_COOKIE = "pb_hub_act";

export function hubSessionCookieValue(): string {
  const secret = process.env.HUB_SESSION_SECRET || "";
  const token = process.env.HUB_ACTION_TOKEN || "";
  if (!secret || !token) return "";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function readHubSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === HUB_SESSION_COOKIE) return decodeURIComponent(v);
  }
  return null;
}

/** Returns a NextResponse error when the caller may not invoke hub POST actions. */
export function assertHubActionAllowed(req: Request): NextResponse | null {
  if (process.env.HUB_READ_ONLY === "1") {
    return NextResponse.json({ error: "hub read-only" }, { status: 403 });
  }
  if (process.env.HUB_ALLOW_UNAUTHENTICATED_ACTIONS === "1") {
    return null;
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expectedToken = process.env.HUB_ACTION_TOKEN || "";
  if (bearer && expectedToken && bearer === expectedToken) {
    return null;
  }
  const cookieVal = readHubSessionCookie(req);
  const expected = hubSessionCookieValue();
  if (cookieVal && expected && cookieVal === expected) {
    return null;
  }
  return NextResponse.json(
    {
      error: "unauthorized",
      hint: "POST /api/auth/hub-session with { token } using HUB_ACTION_TOKEN, or send Authorization: Bearer",
    },
    { status: 401 }
  );
}

export async function appendHubAudit(req: Request, action: string, detail: Record<string, unknown>): Promise<void> {
  const db = process.env.DATABASE_URL;
  if (!db) return;
  const client = new Client({ connectionString: db });
  try {
    await client.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS ploybundle_hub_audit (
      id bigserial primary key,
      created_at timestamptz default now(),
      action text not null,
      detail jsonb,
      ip text,
      user_agent text
    )`);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
    await client.query(
      `insert into ploybundle_hub_audit (action, detail, ip, user_agent) values ($1, $2::jsonb, $3, $4)`,
      [action, JSON.stringify(detail), ip, req.headers.get("user-agent") || ""]
    );
  } catch {
    /* ignore audit failures */
  } finally {
    await client.end().catch(() => undefined);
  }
}
