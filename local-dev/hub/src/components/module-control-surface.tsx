"use client";

/**
 * ModuleControlSurface — Fetches /api/modules/[id] and shows provider, health, metrics, and console link for a hub category.
 * Location: hub/src/components/module-control-surface.tsx (generated).
 */
import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type ModuleHealth = "healthy" | "degraded" | "unknown" | "down";

type ModuleAction = {
  id: string;
  label: string;
  kind?: "link" | "post";
  href?: string;
  postPath?: string;
  postBody?: Record<string, unknown>;
  confirmMessage?: string;
  danger?: boolean;
  variant?: "primary" | "outline";
};

type ModuleSummaryPayload = {
  module: string;
  provider: string;
  health: ModuleHealth;
  healthDetail?: string;
  metrics: Record<string, string | number | null>;
  providerConsoleUrl?: string;
  primaryUrl?: string;
  actions?: ModuleAction[];
  notes: string[];
};

function ModuleActionButton(props: { action: ModuleAction }) {
  const { action: a } = props;
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isPost = a.kind === "post" && a.postPath;

  async function runPost() {
    if (a.confirmMessage && typeof window !== "undefined" && !window.confirm(a.confirmMessage)) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(a.postPath!, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a.postBody ?? {}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(j.error || res.statusText || "failed");
      setToast(j.message || "Done");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const btnBase =
    "btn btn-sm rounded-lg no-animation font-medium shadow-none disabled:opacity-50 " +
    (a.danger
      ? "border border-rose-500/80 bg-rose-600/90 text-white hover:border-rose-400 hover:bg-rose-500"
      : "border border-white/30 bg-transparent text-white hover:border-white/50 hover:bg-white/[0.08]");

  if (isPost) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className={btnBase} disabled={busy} onClick={() => void runPost()}>
          {busy ? "…" : a.label}
        </button>
        {toast ? <span className="text-xs text-slate-400">{toast}</span> : null}
      </div>
    );
  }

  if (!a.href) return null;

  return (
    <a
      href={a.href}
      className={
        "btn btn-sm rounded-lg no-animation border border-white/30 bg-transparent font-medium text-white shadow-none hover:border-white/50 hover:bg-white/[0.08]"
      }
    >
      {a.label}
    </a>
  );
}

function healthBadgeClass(health: ModuleHealth): string {
  switch (health) {
    case "healthy":
      return "badge-success";
    case "degraded":
      return "badge-warning";
    case "down":
      return "badge-error";
    default:
      return "badge-ghost";
  }
}

export function ModuleControlSurface(props: { moduleId: string }) {
  const { moduleId } = props;
  const [data, setData] = useState<ModuleSummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/modules/${encodeURIComponent(moduleId)}`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setError(res.status === 404 ? "Unknown module" : `HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as ModuleSummaryPayload;
        setData(json);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Could not load module summary");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [moduleId]);

  return (
    <section className="mb-10 max-w-5xl space-y-4" aria-label="Module control summary">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Area status</h2>
        {loading && !error ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner size="xs" />
            Loading…
          </span>
        ) : null}
      </div>
      {error ? <div className="alert alert-warning text-sm">{error}</div> : null}
      {loading && !error ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-[#141927] px-6 py-14 shadow-md">
          <LoadingSpinner size="md" />
          <p className="text-center text-sm text-slate-400">Loading area status and shortcuts…</p>
        </div>
      ) : null}
      {!loading && data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card border border-white/10 bg-[#141927] shadow-md">
            <div className="card-body gap-2 p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">{data.provider}</div>
              <h3 className="text-xl font-semibold text-white">{data.module}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    "badge badge-outline " + healthBadgeClass(data.health)
                  }
                >
                  {data.health}
                </span>
                {data.healthDetail ? (
                  <span className="text-xs text-slate-400">{data.healthDetail}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="card border border-white/10 bg-[#141927] shadow-md">
            <div className="card-body gap-3 p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics</div>
              <dl className="space-y-1 text-sm">
                {Object.entries(data.metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="font-mono text-slate-100">
                      {v === null || v === undefined ? "—" : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
              {data.providerConsoleUrl ? (
                <a
                  href={data.providerConsoleUrl}
                  className="btn btn-outline btn-sm mt-2 w-fit rounded-lg border-primary/40 text-primary no-animation hover:border-primary hover:bg-primary/10"
                >
                  Open provider console (advanced)
                </a>
              ) : null}
            </div>
          </div>
          {data.actions && data.actions.length > 0 ? (
            <div className="card border border-white/10 bg-[#141927] shadow-md md:col-span-2">
              <div className="card-body gap-3 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</div>
                <p className="text-xs text-slate-500">
                  Links open provider screens (advanced). POST actions call the hub API (whitelisted Docker restarts,
                  etc.) — authenticate under Settings when required.
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.actions.map((a) => (
                    <ModuleActionButton key={a.id} action={a} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {data.notes.length > 0 ? (
            <div className="card border border-white/10 bg-[#141927] shadow-md md:col-span-2">
              <div className="card-body p-5">
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                  {data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
