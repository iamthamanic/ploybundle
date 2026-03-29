"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type Status = "loading" | "ok" | "bad";

export function StatusDot({ pingUrl }: { pingUrl?: string }) {
  const [s, setS] = useState<Status>("loading");

  useEffect(() => {
    if (!pingUrl) return;
    setS("loading");
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      try {
        const q = `/api/ping?url=${encodeURIComponent(pingUrl)}`;
        const res = await fetch(q, { signal: ctrl.signal });
        const j = (await res.json()) as { ok?: boolean };
        if (!cancelled) setS(j.ok ? "ok" : "bad");
      } catch {
        if (!cancelled) setS("bad");
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [pingUrl]);

  if (!pingUrl) {
    return <span className="badge badge-ghost badge-xs opacity-40">—</span>;
  }
  if (s === "loading") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center" title="Checking reachability">
        <LoadingSpinner size="xs" />
      </span>
    );
  }
  const cls = s === "ok" ? "bg-success" : "bg-error";
  return (
    <span
      className={"inline-block h-2 w-2 rounded-full " + cls}
      title={s === "ok" ? "Reachable" : "Unreachable"}
    />
  );
}
