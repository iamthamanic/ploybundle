import Link from "next/link";
import { loadBoard } from "@/lib/load-board";
import { OverallHealthStrip } from "@/components/overall-health-strip";
import { OverviewLiveKpis } from "@/components/overview-live-kpis";
import { ServiceCard } from "@/components/service-card";

function isExternalHubHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

export default async function OverviewPage() {
  const board = await loadBoard();
  const overviewToolWidgets = board.widgets.filter(
    (w) =>
      w.section === "Overview" &&
      (w.kind === "open_link" || (w.kind === "iframe" && typeof w.config?.embedUrl === "string"))
  );
  const allPingUrls = board.apps.map((a) => a.pingUrl).filter(Boolean) as string[];
  const categorySections = board.sections.filter((s) => s.kind === "category");
  const externalShortcutApps = board.apps.filter((a) => isExternalHubHref(a.href));

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <header className="mb-6 w-full">
        <div className="mb-4 grid gap-3 grid-cols-1 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#141927] p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">APP LOCAL URL</div>
            <a
              href={board.urls.app}
              className="mt-1 block truncate font-mono text-sm text-primary hover:underline"
            >
              {board.urls.app}
            </a>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141927] p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">APP SERVER PROD URL</div>
            {board.productDeploymentUrls?.serverProd?.trim() ? (
              <a
                href={board.productDeploymentUrls.serverProd.trim()}
                className="mt-1 block truncate font-mono text-sm text-primary hover:underline"
              >
                {board.productDeploymentUrls.serverProd.trim()}
              </a>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Not set — add{" "}
                <code className="rounded bg-black/30 px-1 text-xs text-slate-400">productDeploymentUrls.serverProd</code>{" "}
                in <code className="rounded bg-black/30 px-1 text-xs text-slate-400">config/board.json</code>
              </p>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-[#141927] p-4">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">APP SERVER TEST URL</div>
            {board.productDeploymentUrls?.serverTest?.trim() ? (
              <a
                href={board.productDeploymentUrls.serverTest.trim()}
                className="mt-1 block truncate font-mono text-sm text-primary hover:underline"
              >
                {board.productDeploymentUrls.serverTest.trim()}
              </a>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Not set — add{" "}
                <code className="rounded bg-black/30 px-1 text-xs text-slate-400">productDeploymentUrls.serverTest</code>{" "}
                in <code className="rounded bg-black/30 px-1 text-xs text-slate-400">config/board.json</code>
              </p>
            )}
          </div>
        </div>
        <div>
          <OverallHealthStrip pingUrls={allPingUrls} />
        </div>
      </header>
      <OverviewLiveKpis />

      <section className="mt-10 w-full">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">Control plane areas</h3>
          <span className="text-xs text-slate-400">Ploybundle first — provider UIs only when you need them</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categorySections.map((s) => (
            <Link
              key={s.id}
              href={"/" + s.id}
              className="card border border-white/10 bg-[#141927] shadow-md transition hover:border-primary/40 hover:shadow-primary/5"
            >
              <div className="card-body gap-1 p-4">
                <div className="text-sm font-semibold text-white">{s.title}</div>
                {s.serviceBadge ? <p className="text-xs text-slate-400">{s.serviceBadge}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {overviewToolWidgets.length > 0 ? (
        <section className="mt-12 w-full space-y-6">
          <div className="text-sm font-medium text-slate-300">Highlights</div>
          {overviewToolWidgets.map((w) => {
            const href =
              w.kind === "open_link" && typeof w.config?.href === "string"
                ? (w.config.href as string)
                : typeof w.config?.embedUrl === "string"
                  ? (w.config.embedUrl as string)
                  : "";
            if (!href) return null;
            const blurb =
              typeof w.config?.blurb === "string"
                ? (w.config.blurb as string)
                : "This console cannot be embedded in the hub (browser security). Open it in the same tab.";
            const title = w.title ?? "Open tool";
            const external = isExternalHubHref(href);
            return (
              <div
                key={(w.title ?? "") + href}
                className="overflow-hidden rounded-2xl border border-white/10 bg-[#141927] shadow-lg"
              >
                <div className="border-b border-white/10 bg-[#1b2233] px-4 py-2 text-xs text-slate-400">
                  {title}
                </div>
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-2xl text-sm text-slate-300">{blurb}</p>
                  <a
                    href={href}
                    className={
                      "btn shrink-0 rounded-lg no-animation " +
                      (external
                        ? "border border-fuchsia-500/90 bg-fuchsia-600 text-white shadow-sm hover:border-fuchsia-400 hover:bg-fuchsia-500"
                        : "btn-outline border-primary/50 text-primary")
                    }
                  >
                    {external ? "Open " + title : "Go to " + title}
                  </a>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      <section className="mt-12 w-full">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-lg font-semibold text-white">Provider consoles (advanced)</h3>
          <span className="text-xs text-slate-400">
            Native UIs (Directus, Windmill, …) — use area pages first for hub status and actions
          </span>
        </div>
        {externalShortcutApps.length === 0 ? (
          <p className="text-sm text-slate-400">No external shortcuts configured.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {externalShortcutApps.map((app) => (
              <ServiceCard
                key={app.name + app.href}
                name={app.name}
                description={app.description}
                iconUrl={app.iconUrl}
                href={app.href}
                pingUrl={app.pingUrl}
                providerConsole={app.providerConsole}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
