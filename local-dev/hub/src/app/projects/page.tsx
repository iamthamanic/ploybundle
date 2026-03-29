import Link from "next/link";
import { loadBoard } from "@/lib/load-board";

export default async function ProjectsPage() {
  const board = await loadBoard();
  const reg = board.projectsRegistry ?? [];

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <nav className="mb-6 text-xs text-slate-400">
        <Link href="/" className="link link-hover text-primary">
          Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Other hubs</span>
      </nav>
      <header className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold text-white">Multi-project registry</h1>
        <p className="mt-2 text-sm text-slate-400">
          Optional links to other Ploybundle hub deployments. Edit{" "}
          <code className="rounded bg-black/30 px-1 text-xs">projectsRegistry</code> in{" "}
          <code className="rounded bg-black/30 px-1 text-xs">config/board.json</code> (validated PATCH{" "}
          <code className="rounded bg-black/30 px-1 text-xs">/api/board</code>).
        </p>
      </header>
      {reg.length === 0 ? (
        <p className="text-sm text-slate-500">No entries yet — add a registry in board.json for quick jumps between environments.</p>
      ) : (
        <ul className="max-w-xl space-y-3">
          {reg.map((p) => (
            <li key={p.id} className="rounded-xl border border-white/10 bg-[#141927] p-4">
              <a href={p.hubUrl} className="font-medium text-primary hover:underline">
                {p.label}
              </a>
              <p className="text-xs text-slate-500">{p.id}</p>
              {p.note ? <p className="mt-1 text-sm text-slate-400">{p.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
