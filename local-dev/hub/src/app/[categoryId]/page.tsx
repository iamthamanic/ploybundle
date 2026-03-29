import { notFound } from "next/navigation";
import Link from "next/link";
import { loadBoard } from "@/lib/load-board";
import { FACADE_LINES } from "@/lib/facade-lines";
import { InviteUserForm } from "@/components/invite-user-form";
import { ModuleControlSurface } from "@/components/module-control-surface";
import { ServiceCard } from "@/components/service-card";

function isExternalHubHref(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function formatProjectLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default async function CategoryPage({ params }: { params: { categoryId: string } }) {
  const board = await loadBoard();
  if (params.categoryId === "overview") notFound();
  const section = board.sections.find((s) => s.id === params.categoryId);
  if (!section || section.kind !== "category") notFound();

  const apps = board.apps.filter((a) => a.section === section.title);
  const toolWidgets = board.widgets.filter(
    (w) =>
      w.section === section.title &&
      (w.kind === "open_link" || (w.kind === "iframe" && typeof w.config?.embedUrl === "string"))
  );
  const bullets = FACADE_LINES[section.id] ?? [];
  const projectLabel = formatProjectLabel(board.projectName);

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <nav className="mb-6 text-xs text-slate-400">
        <Link href="/" className="link link-hover text-primary">
          Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">{section.title}</span>
      </nav>

      <header className="mb-8 max-w-5xl rounded-xl border border-white/10 bg-[#141927] p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{projectLabel}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{section.title}</h1>
        {section.serviceBadge ? (
          <p className="mt-2 font-mono text-sm text-slate-400">{section.serviceBadge}</p>
        ) : null}
        <p className="mt-3 max-w-2xl text-base text-slate-300">
          Work in the hub first: area status, metrics, and control actions. Open a provider console (advanced) only when
          you need the native UI.
        </p>
      </header>

      {bullets.length > 0 ? (
        <ul className="mb-10 max-w-2xl list-inside list-disc space-y-1 text-sm text-slate-300">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <ModuleControlSurface moduleId={section.id} />

      {section.id === "auth" ? <InviteUserForm /> : null}

      {toolWidgets.length > 0 ? (
        <div className="mb-10 max-w-5xl space-y-6">
          {toolWidgets.map((w) => {
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
        </div>
      ) : null}

      <section className="w-full">
        <h2 className="mb-4 text-lg font-semibold text-white">Provider consoles (advanced)</h2>
        <p className="mb-4 max-w-2xl text-xs text-slate-500">
          These links open external tools. Prefer the module summary above for Ploybundle-native status and actions.
        </p>
        {apps.length === 0 ? (
          <p className="text-sm text-slate-400">No shortcuts configured for this area.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => (
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

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-slate-500">
        Need infra access? Use the <Link href="/deploy">Deploy</Link> area for CapRover / Coolify.
      </footer>
    </main>
  );
}
