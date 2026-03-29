import { readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

function boardPath() {
  return path.join(process.cwd(), "config", "board.json");
}

function validRepoUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validProjectsRegistry(x: unknown): x is { id: string; label: string; hubUrl: string; note?: string }[] {
  if (!Array.isArray(x) || x.length > 50) return false;
  for (const e of x) {
    if (!e || typeof e !== "object") return false;
    const r = e as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length < 1 || r.id.length > 64) return false;
    if (typeof r.label !== "string" || r.label.length < 1 || r.label.length > 200) return false;
    if (typeof r.hubUrl !== "string" || r.hubUrl.length > 2048) return false;
    try {
      const u = new URL(r.hubUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    } catch {
      return false;
    }
    if (r.note !== undefined && (typeof r.note !== "string" || r.note.length > 500)) return false;
  }
  return true;
}

export async function PATCH(req: Request) {
  if (process.env.HUB_BOARD_EDITABLE === "0") {
    return NextResponse.json({ error: "board edits disabled" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const hasDn = Object.prototype.hasOwnProperty.call(o, "displayName");
  const hasRu = Object.prototype.hasOwnProperty.call(o, "repositoryUrl");
  const hasPr = Object.prototype.hasOwnProperty.call(o, "projectsRegistry");
  if (!hasDn && !hasRu && !hasPr) {
    return NextResponse.json(
      { error: "expected displayName, repositoryUrl, and/or projectsRegistry" },
      { status: 400 }
    );
  }

  const gate = assertHubActionAllowed(req);
  if (gate) return gate;

  const displayName =
    hasDn && typeof o.displayName === "string" ? o.displayName.trim().slice(0, 200) : undefined;
  const repositoryUrl =
    hasRu && typeof o.repositoryUrl === "string" ? o.repositoryUrl.trim().slice(0, 2048) : undefined;
  if (repositoryUrl !== undefined && !validRepoUrl(repositoryUrl)) {
    return NextResponse.json(
      { error: "repositoryUrl must be empty or an http(s) URL" },
      { status: 400 }
    );
  }
  let projectsRegistry: { id: string; label: string; hubUrl: string; note?: string }[] | undefined;
  if (hasPr) {
    if (!validProjectsRegistry(o.projectsRegistry)) {
      return NextResponse.json(
        { error: "projectsRegistry must be an array of { id, label, hubUrl, note? } with http(s) hubUrl" },
        { status: 400 }
      );
    }
    projectsRegistry = o.projectsRegistry;
  }

  let raw: string;
  try {
    raw = await readFile(boardPath(), "utf-8");
  } catch {
    return NextResponse.json({ error: "board.json not found" }, { status: 503 });
  }
  let board: Record<string, unknown>;
  try {
    board = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid board.json" }, { status: 500 });
  }
  if (displayName !== undefined) board.displayName = displayName;
  if (repositoryUrl !== undefined) board.repositoryUrl = repositoryUrl;
  if (projectsRegistry !== undefined) board.projectsRegistry = projectsRegistry;
  const out = JSON.stringify(board, null, 2) + "\n";
  await writeFile(boardPath(), out, "utf-8");
  await appendHubAudit(req, "patch-board", {
    displayName: displayName !== undefined,
    repositoryUrl: repositoryUrl !== undefined,
    projectsRegistry: projectsRegistry !== undefined ? projectsRegistry.length : false,
  });
  return NextResponse.json({ ok: true });
}
