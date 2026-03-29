"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type OverviewPayload = {
  generatedAt: string;
  kpis: {
    users: number | null;
    requests: number | null;
    rows: number | null;
    executions: number | null;
    collections: number | null;
    buckets: number | null;
  };
  services: Array<{ name: string; status: "healthy" | "degraded" | "down"; details?: string }>;
};

function fmt(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("de-DE").format(value);
}

const statusClass: Record<string, string> = {
  healthy: "text-emerald-100 bg-emerald-500/18 border-emerald-300/45",
  degraded: "text-amber-100 bg-amber-500/18 border-amber-300/45",
  down: "text-rose-100 bg-rose-500/18 border-rose-300/45",
};

export function OverviewLiveKpis() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch("/api/overview", { cache: "no-store" });
        const json = (await res.json()) as OverviewPayload;
        if (active) setData(json);
      } catch (err) {
        console.error("overview fetch failed", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const k = data?.kpis;
  return (
    <section className="mb-9 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-fuchsia-300">Live Overview</h2>
        <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200">
          v2
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Users</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.users ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Requests</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.requests ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Rows</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.rows ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Executions</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.executions ?? null)}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141927] shadow-[0_12px_28px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Integrations
          </div>
          <div className="text-xs text-slate-500">
            {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("de-DE") : "live"}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] border-b border-white/5 px-5 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
          <span>Service</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-white/5">
          {loading && !data?.services?.length ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 px-5 py-8">
              <LoadingSpinner size="md" />
              <span className="text-sm text-slate-400">Loading service status…</span>
            </div>
          ) : (
            (data?.services ?? []).map((s) => (
              <div key={s.name} className="grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5">
                <div>
                  <div className="text-[13px] font-semibold text-slate-100">{s.name}</div>
                  {s.details ? <div className="text-xs text-slate-400">{s.details}</div> : null}
                </div>
                <span className={`rounded-lg border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${statusClass[s.status] ?? statusClass.degraded}`}>
                  {s.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
