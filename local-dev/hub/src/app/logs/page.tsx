"use client";

/**
 * LogsPage — Tail compose service logs via /api/logs when Docker socket is enabled.
 * Location: hub/src/app/logs/page.tsx (generated).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";

const SERVICES = [
  "hub",
  "app",
  "directus",
  "postgres",
  "redis",
  "windmill",
  "windmill-worker",
  "seaweedfs",
  "adminer",
];

export default function LogsPage() {
  const [service, setService] = useState("hub");
  const [lines, setLines] = useState(200);
  const [log, setLog] = useState<string>("");
  const [meta, setMeta] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLog("");
    setMeta("");
    fetch(
      "/api/logs?service=" + encodeURIComponent(service) + "&lines=" + encodeURIComponent(String(lines)),
      { cache: "no-store" }
    )
      .then(async (r) => {
        const j = (await r.json()) as {
          enabled?: boolean;
          log?: string;
          hint?: string;
          composeExample?: string;
          error?: string;
        };
        if (cancelled) return;
        if (j.log) {
          setLog(j.log);
          setMeta("Live tail from Docker API");
        } else {
          setLog("");
          setMeta(
            (j.hint || "") +
              (j.composeExample ? "\n\nTry: " + j.composeExample : "")
          );
        }
      })
      .catch(() => {
        if (!cancelled) setMeta("Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, lines]);

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <nav className="mb-6 text-xs text-slate-400">
        <Link href="/" className="link link-hover text-primary">
          Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Logs</span>
      </nav>
      <header className="mb-6 max-w-5xl">
        <h1 className="text-2xl font-semibold text-white">Logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Read-only log tail from running containers (local Docker). Requires the hub to run with{" "}
          <code className="text-slate-300">HUB_LOGS_ENABLED=1</code> and a mounted Docker socket.
        </p>
      </header>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="form-control w-full max-w-xs">
          <span className="label-text text-xs text-slate-400">Service</span>
          <select
            className="select select-bordered select-sm border-white/15 bg-[#141927] text-white"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full max-w-[10rem]">
          <span className="label-text text-xs text-slate-400">Lines</span>
          <input
            type="number"
            className="input input-bordered input-sm border-white/15 bg-[#141927] text-white"
            min={20}
            max={500}
            value={lines}
            onChange={(e) => setLines(Number(e.target.value) || 200)}
          />
        </label>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner size="xs" />
            Loading…
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex min-h-[160px] max-w-5xl items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#141927]/80 py-10">
          <LoadingSpinner size="md" />
          <span className="text-sm text-slate-400">Fetching logs…</span>
        </div>
      ) : null}
      {!loading && meta && !log ? (
        <div className="alert alert-info max-w-5xl whitespace-pre-wrap text-sm">{meta}</div>
      ) : null}
      {!loading && log ? (
        <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-slate-200">
          {log}
        </pre>
      ) : null}
    </main>
  );
}
