"use client";

/**
 * InviteUserForm — POST /api/actions/invite-user (Directus) with basic rate limit server-side.
 * Location: hub/src/components/invite-user-form.tsx (generated).
 */
import { useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

export function InviteUserForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/actions/invite-user", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || "failed");
      setMsg("User created in Directus.");
      setEmail("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mb-10 max-w-xl border border-white/10 bg-[#141927] shadow-md">
      <div className="card-body gap-3 p-5">
        <h3 className="text-sm font-semibold text-white">Create user (Directus)</h3>
        <p className="text-xs text-slate-500">
          Creates an active user with the default invite role (Editor if present, else first role). For full invite
          flows, use Directus.
        </p>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <input
            type="email"
            required
            placeholder="email@example.com"
            className="input input-bordered input-sm border-white/15 bg-[#1b2233] text-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-sm w-fit rounded-lg no-animation border border-fuchsia-500/90 bg-fuchsia-600 text-white shadow-sm hover:border-fuchsia-400 hover:bg-fuchsia-500 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="xs" className="text-white" />
                Create user
              </span>
            ) : (
              "Create user"
            )}
          </button>
        </form>
        {msg ? <div className="text-sm text-success">{msg}</div> : null}
        {err ? <div className="text-sm text-error">{err}</div> : null}
      </div>
    </div>
  );
}
