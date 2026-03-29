"use client";

/**
 * SettingsPage — Effective board/spec view, hub session, audit, registry PATCH, rotation request (no secret values).
 * Location: hub/src/app/settings/page.tsx (generated).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";

type HubPolicy = {
  actionTokenConfigured?: boolean;
  sessionSecretConfigured?: boolean;
  readOnly?: boolean;
  allowUnauthenticatedActions?: boolean;
};

export default function SettingsPage() {
  const [json, setJson] = useState<string>("");
  const [hint, setHint] = useState<string>("");
  const [keys, setKeys] = useState<string[]>([]);
  const [exposed, setExposed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<HubPolicy>({});

  const [token, setToken] = useState("");
  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  const [auditText, setAuditText] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);

  const [regJson, setRegJson] = useState("[]");
  const [regMsg, setRegMsg] = useState<string | null>(null);

  const [rotKey, setRotKey] = useState("");
  const [rotMsg, setRotMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/project-spec", { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (p: {
          board?: unknown;
          envKeyNames?: string[];
          hint?: string;
          envKeysExposed?: boolean;
          hubSecretsPolicy?: HubPolicy;
        }) => {
          setJson(JSON.stringify(p.board, null, 2));
          setKeys(p.envKeyNames || []);
          setHint(p.hint || "");
          setExposed(Boolean(p.envKeysExposed));
          setPolicy(p.hubSecretsPolicy || {});
          const b = p.board as { projectsRegistry?: unknown[] } | undefined;
          setRegJson(JSON.stringify(b?.projectsRegistry ?? [], null, 2));
        }
      )
      .catch(() => setHint("Could not load project spec."))
      .finally(() => setLoading(false));
  }, []);

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const r = await fetch("/api/audit-log", { credentials: "include", cache: "no-store" });
      const j = await r.json();
      setAuditText(JSON.stringify(j, null, 2));
    } catch {
      setAuditText("Could not load audit log.");
    } finally {
      setAuditLoading(false);
    }
  }

  async function saveSession(e: React.FormEvent) {
    e.preventDefault();
    setSessionMsg(null);
    try {
      const r = await fetch("/api/auth/hub-session", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = (await r.json()) as { error?: string };
      setSessionMsg(r.ok ? "Session cookie set for hub actions." : j.error || "failed");
    } catch {
      setSessionMsg("Request failed");
    }
  }

  async function saveRegistry(e: React.FormEvent) {
    e.preventDefault();
    setRegMsg(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(regJson);
    } catch {
      setRegMsg("Invalid JSON");
      return;
    }
    try {
      const r = await fetch("/api/board", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectsRegistry: parsed }),
      });
      const j = (await r.json()) as { error?: string };
      setRegMsg(r.ok ? "Saved projectsRegistry." : j.error || "failed");
    } catch {
      setRegMsg("Request failed");
    }
  }

  async function requestRotation(e: React.FormEvent) {
    e.preventDefault();
    setRotMsg(null);
    try {
      const r = await fetch("/api/actions/request-secret-rotation", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: rotKey }),
      });
      const j = (await r.json()) as { message?: string; error?: string };
      setRotMsg(j.message || j.error || "done");
    } catch {
      setRotMsg("Request failed");
    }
  }

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <nav className="mb-6 text-xs text-slate-400">
        <Link href="/" className="link link-hover text-primary">
          Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Settings</span>
      </nav>
      <header className="mb-6 max-w-5xl">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Hub control-plane policy, read-only spec view, and safe operations. Secret values never appear in the browser.
        </p>
      </header>
      {hint ? <p className="mb-4 max-w-5xl text-sm text-slate-500">{hint}</p> : null}

      <section className="mb-10 max-w-5xl rounded-xl border border-white/10 bg-[#141927] p-5">
        <h2 className="text-sm font-semibold text-slate-300">Hub security policy</h2>
        <ul className="mt-2 list-inside list-disc text-xs text-slate-400">
          <li>HUB_ACTION_TOKEN configured: {policy.actionTokenConfigured ? "yes" : "no"}</li>
          <li>HUB_SESSION_SECRET configured: {policy.sessionSecretConfigured ? "yes" : "no"}</li>
          <li>HUB_READ_ONLY: {policy.readOnly ? "on" : "off"}</li>
          <li>HUB_ALLOW_UNAUTHENTICATED_ACTIONS: {policy.allowUnauthenticatedActions ? "on (dev-style)" : "off"}</li>
        </ul>
        <form className="mt-4 flex max-w-md flex-col gap-2" onSubmit={saveSession}>
          <label className="text-xs text-slate-500">
            Paste HUB_ACTION_TOKEN to obtain an httpOnly session cookie for POST actions
            <input
              type="password"
              className="input input-bordered input-sm mt-1 w-full border-white/15 bg-[#1b2233] text-white"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="btn btn-sm w-fit rounded-lg border border-primary/50 text-primary no-animation hover:bg-primary/10"
          >
            Start hub session
          </button>
          {sessionMsg ? <p className="text-xs text-slate-400">{sessionMsg}</p> : null}
        </form>
      </section>

      <section className="mb-10 max-w-5xl">
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Audit log (recent)</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm mb-2 text-fuchsia-300"
          onClick={() => void loadAudit()}
          disabled={auditLoading}
        >
          {auditLoading ? "Loading…" : "Load audit entries"}
        </button>
        {auditText ? (
          <pre className="max-h-[40vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-slate-200">
            {auditText}
          </pre>
        ) : null}
      </section>

      <section className="mb-10 max-w-5xl rounded-xl border border-white/10 bg-[#141927] p-5">
        <h2 className="text-sm font-semibold text-slate-300">projectsRegistry (validated PATCH)</h2>
        <p className="mb-2 text-xs text-slate-500">
          {"JSON array of { id, label, hubUrl, note? }. Requires authenticated hub session."}
        </p>
        <form className="flex flex-col gap-2" onSubmit={saveRegistry}>
          <textarea
            className="textarea textarea-bordered min-h-[8rem] border-white/15 bg-[#1b2233] font-mono text-xs text-white"
            value={regJson}
            onChange={(e) => setRegJson(e.target.value)}
          />
          <button type="submit" className="btn btn-sm w-fit rounded-lg border border-white/20 text-white no-animation">
            Save registry
          </button>
          {regMsg ? <p className="text-xs text-slate-400">{regMsg}</p> : null}
        </form>
      </section>

      <section className="mb-10 max-w-5xl rounded-xl border border-white/10 bg-[#141927] p-5">
        <h2 className="text-sm font-semibold text-slate-300">Secret rotation (server-side)</h2>
        <p className="mb-2 text-xs text-slate-500">
          Records an audit entry and returns CLI-oriented guidance — values are never read from the browser.
        </p>
        <form className="flex max-w-md flex-col gap-2" onSubmit={requestRotation}>
          <input
            className="input input-bordered input-sm border-white/15 bg-[#1b2233] text-white"
            placeholder="Secret key name (optional)"
            value={rotKey}
            onChange={(e) => setRotKey(e.target.value)}
          />
          <button type="submit" className="btn btn-sm w-fit rounded-lg border border-rose-500/50 text-rose-200 no-animation">
            Request rotation log
          </button>
          {rotMsg ? <p className="text-xs text-slate-400">{rotMsg}</p> : null}
        </form>
      </section>

      <h2 className="mb-2 text-sm font-semibold text-slate-300">Effective board (read-only)</h2>
      {loading ? (
        <div className="mb-8 flex min-h-[120px] items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#141927] p-8">
          <LoadingSpinner size="md" />
          <span className="text-sm text-slate-400">Loading board…</span>
        </div>
      ) : (
        <pre className="mb-8 max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-[#141927] p-4 font-mono text-xs text-slate-200">
          {json || "{}"}
        </pre>
      )}
      <h2 className="mb-2 text-sm font-semibold text-slate-300">Environment variable names</h2>
      {exposed && keys.length > 0 ? (
        <ul className="max-h-48 list-inside list-disc overflow-auto text-sm text-slate-400">
          {keys.map((k) => (
            <li key={k} className="font-mono">
              {k}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Enable HUB_SHOW_ENV_KEY_NAMES=1 on the hub to list key names only.</p>
      )}
    </main>
  );
}
