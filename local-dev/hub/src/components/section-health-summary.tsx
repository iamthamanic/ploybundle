"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type Phase = "loading" | "ok" | "bad";

function checkPing(url: string, signal: AbortSignal): Promise<boolean> {
  const q = `/api/ping?url=${encodeURIComponent(url)}`;
  return fetch(q, { signal })
    .then((r) => r.json())
    .then((j: { ok?: boolean }) => Boolean(j.ok))
    .catch(() => false);
}

export function SectionHealthSummary(props: { pingUrls: (string | undefined)[] }) {
  const urls = [...new Set(props.pingUrls.filter(Boolean) as string[])];
  const [phase, setPhase] = useState<Phase>(urls.length === 0 ? "ok" : "loading");

  useEffect(() => {
    if (urls.length === 0) {
      setPhase("ok");
      return;
    }
    setPhase("loading");
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      const results = await Promise.all(urls.map((u) => checkPing(u, ctrl.signal)));
      if (cancelled) return;
      if (results.every(Boolean)) setPhase("ok");
      else setPhase("bad");
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [urls.join("|")]);

  if (urls.length === 0) {
    return <span className="text-xs text-base-content/50">No ping · use deep links</span>;
  }
  if (phase === "loading") {
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-base-content/60">
        <LoadingSpinner size="xs" />
        Checking services…
      </span>
    );
  }
  const label = phase === "ok" ? "Healthy" : "Check services";
  const cls = phase === "ok" ? "text-success" : "text-warning";
  return <span className={"text-xs font-medium " + cls}>{label}</span>;
}
