"use client";

import { SectionHealthSummary } from "./section-health-summary";

export function OverallHealthStrip({ pingUrls }: { pingUrls: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-base-content/10 bg-base-200/40 px-4 py-3 text-sm">
      <span className="font-medium text-base-content/80">Overall signal</span>
      <SectionHealthSummary pingUrls={pingUrls} />
      <span className="text-xs text-base-content/45">(via hub /api/ping — no CORS)</span>
    </div>
  );
}
