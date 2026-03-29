"use client";

import { StatusDot } from "./status-dot";

export function ServiceCard(props: {
  name: string;
  description: string;
  iconUrl: string;
  href: string;
  pingUrl?: string;
  /** External provider / escape-hatch link — shows Advanced badge */
  providerConsole?: boolean;
}) {
  const { name, description, iconUrl, href, pingUrl, providerConsole } = props;
  return (
    <a
      href={href}
      className="card border border-white/10 bg-[#141927] shadow-md transition hover:border-primary/40 hover:shadow-primary/5"
    >
      <div className="card-body gap-3 p-5">
        <div className="flex items-start gap-3">
          <div className="avatar">
            <div className="mask mask-squircle flex h-11 w-11 items-center justify-center bg-[#1f2740] p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iconUrl}
                alt=""
                className="h-full w-full object-contain brightness-0 invert opacity-90"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate font-semibold text-white">{name}</h4>
              <div className="flex shrink-0 items-center gap-2">
                {providerConsole ? (
                  <span className="badge badge-outline badge-sm border-fuchsia-500/50 text-[10px] uppercase text-fuchsia-200/90">
                    Advanced
                  </span>
                ) : null}
                <StatusDot pingUrl={pingUrl} />
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-slate-400">{description}</p>
          </div>
        </div>
        <div className="card-actions justify-end">
          <span className="btn btn-sm h-8 min-h-8 rounded-lg border border-white/15 bg-white/[0.04] px-4 text-xs font-medium normal-case text-white/95 no-animation shadow-none hover:border-white/35 hover:bg-white/10">
            Open
          </span>
        </div>
      </div>
    </a>
  );
}
