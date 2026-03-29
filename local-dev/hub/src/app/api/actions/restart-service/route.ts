import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";
import { restartComposeService } from "@/lib/stack-control";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
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

export async function POST(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  const ip = clientIp(req);
  if (!rateOk(ip)) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  let body: { service?: string };
  try {
    body = (await req.json()) as { service?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const service = typeof body.service === "string" ? body.service.trim() : "";
  if (!service) {
    return NextResponse.json({ error: "expected service" }, { status: 400 });
  }
  const board = await loadBoard();
  const result = await restartComposeService(board.projectName, service);
  await appendHubAudit(req, "restart-service", { service, ok: result.ok, message: result.message });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.message.includes("not found") ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, message: result.message });
}
