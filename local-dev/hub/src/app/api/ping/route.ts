import { NextRequest, NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";

async function allowedUrlPrefixes(): Promise<string[]> {
  try {
    const board = await loadBoard();
    const urls = board.urls ?? {};
    return Object.values(urls)
      .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
      .map((u) => u.replace(/\/$/, ""));
  } catch {
    return [];
  }
}

function isPingTargetAllowed(target: string, prefixes: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const normalized = (target.split("#")[0] ?? target).trim();
  return prefixes.some(
    (p) => normalized === p || normalized.startsWith(p + "/") || normalized.startsWith(p + "?")
  );
}

async function probe(url: string): Promise<boolean> {
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

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ ok: false, error: "missing url" }, { status: 400 });
  }
  const prefixes = await allowedUrlPrefixes();
  if (prefixes.length === 0) {
    return NextResponse.json({ ok: false, error: "board unavailable" }, { status: 503 });
  }
  if (!isPingTargetAllowed(target, prefixes)) {
    return NextResponse.json({ ok: false, error: "url not allowed" }, { status: 403 });
  }
  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const probeUrl = toHubBackendServiceUrl(target, productDocker);
  const ok = await probe(probeUrl);
  return NextResponse.json({ ok });
}
