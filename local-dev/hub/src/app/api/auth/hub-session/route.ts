import { NextResponse } from "next/server";
import { HUB_SESSION_COOKIE, hubSessionCookieValue } from "@/lib/hub-action-auth";

export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const expected = process.env.HUB_ACTION_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  const val = hubSessionCookieValue();
  if (!val) {
    return NextResponse.json(
      { error: "HUB_SESSION_SECRET and HUB_ACTION_TOKEN must be set on the hub service" },
      { status: 503 }
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HUB_SESSION_COOKIE, val, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
