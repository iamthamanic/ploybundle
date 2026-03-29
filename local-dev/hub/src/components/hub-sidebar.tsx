"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BoardJson } from "@/lib/load-board";
import { LoadingSpinner } from "./loading-spinner";

function formatProjectLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function repoLinkLabel(url: string): string {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\./, "") || "Repository";
  } catch {
    return "Repository";
  }
}

export function HubSidebar({ board }: { board: BoardJson }) {
  const pathname = usePathname();
  const router = useRouter();
  const derivedName = board.displayName?.trim() || formatProjectLabel(board.projectName);
  const [nameEdit, setNameEdit] = useState(derivedName);
  const [editingName, setEditingName] = useState(false);
  const [repoUrl, setRepoUrl] = useState(board.repositoryUrl?.trim() ?? "");
  const [repoDraft, setRepoDraft] = useState(repoUrl);
  const [editingRepo, setEditingRepo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setNameEdit(board.displayName?.trim() || formatProjectLabel(board.projectName));
    const r = board.repositoryUrl?.trim() ?? "";
    setRepoUrl(r);
    setRepoDraft(r);
  }, [board.displayName, board.repositoryUrl, board.projectName]);

  const savePatch = useCallback(
    async (patch: { displayName?: string; repositoryUrl?: string }) => {
      setSaving(true);
      setErr(null);
      try {
        const res = await fetch("/api/board", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || res.statusText);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [router]
  );

  const commitName = async () => {
    setEditingName(false);
    const next = nameEdit.trim();
    const prev = (board.displayName?.trim() || formatProjectLabel(board.projectName)).trim();
    if (next === prev) return;
    await savePatch({ displayName: next });
  };

  const commitRepo = async () => {
    setEditingRepo(false);
    const next = repoDraft.trim();
    if (next === (board.repositoryUrl?.trim() ?? "")) return;
    await savePatch({ repositoryUrl: next });
  };

  const navSections = board.sections.filter((s) => s.kind === "overview" || s.kind === "category");
  const byId = new Map(navSections.map((s) => [s.id, s]));
  const grouped = [
    { title: "Frontend", ids: ["app"] },
    { title: "Backend", ids: ["auth", "database", "functions", "storage", "jobs"] },
    { title: "Operations", ids: ["logs", "deploy"] },
    { title: "Project", ids: ["settings"] },
  ];
  const tierLabel = board.target === "full" ? "Full" : "Lite";

  return (
    <aside
      className="sticky top-0 z-40 flex h-screen w-[var(--pb-sidebar)] shrink-0 flex-col border-r border-white/10 bg-[#0f1422]/95 backdrop-blur-md"
      aria-label="Project navigation"
    >
      <div className="border-b border-white/10 px-4 py-5">
        <div className="rounded-lg outline-none focus-within:ring-2 focus-within:ring-primary">
          <Link
            href="/"
            className="mb-2 block rounded-lg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-2 w-2 shrink-0 rounded-full bg-fuchsia-500" />
              <span>PLOYBUNDLE</span>
              <span className="text-slate-600">·</span>
              {editingName ? (
                <input
                  autoFocus
                  className="input input-sm h-7 min-w-[5rem] max-w-[11rem] flex-1 border-white/20 bg-[#1b2233] px-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  onClick={(e) => e.preventDefault()}
                />
              ) : (
                <button
                  type="button"
                  title="Edit display name"
                  className="max-w-[11rem] truncate text-left text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200/90 hover:text-fuchsia-100"
                  onClick={(e) => {
                    e.preventDefault();
                    setNameEdit(board.displayName?.trim() || formatProjectLabel(board.projectName));
                    setEditingName(true);
                  }}
                >
                  {derivedName}
                </button>
              )}
            </div>
          </Link>
          <div className="relative mt-1.5 pl-6 text-[11px] normal-case">
            {saving ? (
              <span className="mb-1 inline-flex items-center gap-2 text-slate-500">
                <LoadingSpinner size="xs" />
              </span>
            ) : null}
            {err ? <span className="mb-1 block text-[10px] text-rose-400">{err}</span> : null}
            {editingRepo ? (
              <div className="flex flex-col gap-1.5">
                <input
                  className="input input-bordered input-sm w-full border-white/20 bg-[#1b2233] text-xs text-white"
                  placeholder="https://…"
                  value={repoDraft}
                  onChange={(e) => setRepoDraft(e.target.value)}
                  autoFocus
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost btn-xs text-fuchsia-300" onClick={() => void commitRepo()}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-slate-400"
                    onClick={() => {
                      setRepoDraft(repoUrl);
                      setEditingRepo(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : repoUrl ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-hover link font-medium text-slate-400 hover:text-fuchsia-300"
                >
                  {repoLinkLabel(repoUrl)}
                </a>
                <button
                  type="button"
                  className="text-[10px] text-slate-500 underline decoration-dotted hover:text-fuchsia-300"
                  onClick={() => {
                    setRepoDraft(repoUrl);
                    setEditingRepo(true);
                  }}
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-slate-500 hover:text-fuchsia-300"
                onClick={() => {
                  setRepoDraft("");
                  setEditingRepo(true);
                }}
              >
                Repo hinzufügen
              </button>
            )}
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm" aria-label="Areas">
        <Link
          href="/"
          className={
            "mb-3 block rounded-lg px-3 py-2 outline-none transition-colors " +
            (pathname === "/" ? "bg-[#212a3f] text-white" : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
          }
        >
          <span className="font-medium leading-snug">Overview</span>
        </Link>
        {grouped.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">{group.title}</div>
            {group.ids.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              const href = "/" + s.id;
              const pathActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={s.id}
                  href={href}
                  className={
                    "mb-1.5 block rounded-lg px-3 py-2 outline-none transition-colors " +
                    (pathActive
                      ? "bg-[#212a3f] text-white"
                      : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
                  }
                >
                  <span className="font-medium leading-snug">{s.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mb-4 px-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">Registry</div>
          <Link
            href="/projects"
            className={
              "block rounded-lg px-3 py-2 outline-none transition-colors " +
              (pathname === "/projects"
                ? "bg-[#212a3f] text-white"
                : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
            }
          >
            <span className="font-medium leading-snug">Other hubs</span>
          </Link>
        </div>
      </nav>
      <div className="border-t border-white/10 p-3 text-[10px] leading-relaxed text-slate-500">
        Curated links · {tierLabel} stack
      </div>
    </aside>
  );
}
