"use client";

/**
 * CredentialsOnboardingModal — einmaliger Hinweis nach Stack-Start: wo Zugangsdaten stehen (ohne Passwörter aus dem API-Body).
 * Ort: hub/src/components/credentials-onboarding-modal.tsx (generiert).
 */
import { useCallback, useEffect, useState } from "react";

type Hints = {
  projectName: string;
  directusEmail: string | null;
  postgresUser: string;
  postgresDb: string;
  adminerServer: string;
  envFileHint: string;
  localSecretsPathHint: string;
  windmill: { email: string; passwordHint: string; detail: string };
};

const STORAGE_PREFIX = "ploybundle-hub-onboarding-v1:";

function dismissedKey(projectName: string) {
  return STORAGE_PREFIX + projectName;
}

function buildCopyText(h: Hints): string {
  const directusLine =
    "  E-Mail: " + (h.directusEmail ?? "siehe DIRECTUS_ADMIN_EMAIL in .env");
  const lines = [
    "Ploybundle — Zugänge (Projekt: " + h.projectName + ")",
    "",
    "Directus (Admin):",
    directusLine,
    "  Passwort: DIRECTUS_ADMIN_PASSWORD oder ADMIN_PASSWORD in .env",
    "",
    "Adminer (PostgreSQL):",
    "  Server: " + h.adminerServer,
    "  Benutzer: " + h.postgresUser,
    "  Datenbank: " + h.postgresDb,
    "  Passwort: POSTGRES_PASSWORD in .env",
    "",
    "Windmill:",
    "  UI oft: " + h.windmill.email + " / " + h.windmill.passwordHint + " — dann Sign in",
    "  " + h.windmill.detail,
    "",
    h.envFileHint,
    "Lokal: " + h.localSecretsPathHint,
    "",
    "Passwörter stehen nur in der .env; hier nur Hinweise.",
  ];
  return lines.join("\n");
}

export function CredentialsOnboardingModal() {
  const [hints, setHints] = useState<Hints | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding-hints", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Hints;
        if (cancelled) return;
        const force =
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("showOnboarding") === "1";
        if (typeof window !== "undefined" && !force) {
          if (window.localStorage.getItem(dismissedKey(data.projectName))) return;
        }
        setHints(data);
        setVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (hints && typeof window !== "undefined") {
      window.localStorage.setItem(dismissedKey(hints.projectName), "1");
    }
    setVisible(false);
  }, [hints]);

  const copySummary = useCallback(async () => {
    if (!hints || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(hints));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [hints]);

  if (!hints || !visible) return null;

  return (
    <div className="modal modal-open z-[200]" role="dialog" aria-modal="true" aria-labelledby="pb-onboarding-title">
      <div className="modal-box relative max-h-[90vh] max-w-2xl overflow-y-auto border border-white/15 bg-[#141927] text-slate-100 shadow-2xl">
        <button
          type="button"
          className="btn btn-sm absolute right-4 top-4 z-10 gap-1 rounded-lg border border-white/50 bg-transparent font-medium text-white shadow-none hover:border-white hover:bg-white/10"
          onClick={() => void copySummary()}
          aria-label="Zugänge als Text kopieren"
        >
          {copied ? "Kopiert!" : "Kopieren"}
        </button>
        <h2 id="pb-onboarding-title" className="pr-24 text-xl font-bold text-white">
          Zugänge für dieses Projekt
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Beim Start werden Daten und Benutzer angelegt (Seeding). <strong className="text-slate-300">Passwörter werden hier nicht angezeigt</strong> — sie stehen in deiner{" "}
          <code className="rounded bg-black/40 px-1 text-slate-200">.env</code>. Lege sie im Passwortmanager ab und committen{" "}
          <code className="rounded bg-black/40 px-1">.env</code> /{" "}
          <code className="rounded bg-black/40 px-1">secrets.json</code> niemals.
        </p>

        <ul className="mt-4 space-y-4 text-sm">
          <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="font-semibold text-teal-300">Directus (CMS / Admin)</div>
            <p className="mt-1 text-slate-400">
              E-Mail:{" "}
              {hints.directusEmail ? (
                <code className="text-slate-200">{hints.directusEmail}</code>
              ) : (
                <span className="text-slate-500">siehe DIRECTUS_ADMIN_EMAIL in .env</span>
              )}
            </p>
            <p className="mt-1 text-slate-400">
              Passwort: <code className="text-slate-200">DIRECTUS_ADMIN_PASSWORD</code> (oder{" "}
              <code className="text-slate-200">ADMIN_PASSWORD</code>) in .env
            </p>
          </li>
          <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="font-semibold text-teal-300">Adminer (PostgreSQL)</div>
            <p className="mt-1 text-slate-400">
              Server: <code className="text-slate-200">{hints.adminerServer}</code> · Benutzer:{" "}
              <code className="text-slate-200">{hints.postgresUser}</code> · Datenbank:{" "}
              <code className="text-slate-200">{hints.postgresDb}</code>
            </p>
            <p className="mt-1 text-slate-400">
              Passwort: <code className="text-slate-200">POSTGRES_PASSWORD</code> in .env
            </p>
          </li>
          <li className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="font-semibold text-teal-300">Windmill</div>
            <p className="mt-1 text-slate-400">
              UI-Login oft: <code className="text-slate-200">{hints.windmill.email}</code> /{" "}
              <code className="text-slate-200">{hints.windmill.passwordHint}</code> — dann{" "}
              <strong className="text-slate-300">Sign in</strong> klicken.
            </p>
            <p className="mt-1 text-xs text-slate-500">{hints.windmill.detail}</p>
          </li>
        </ul>

        <p className="mt-4 text-xs text-slate-500">{hints.envFileHint}</p>
        <p className="mt-1 text-xs text-slate-500">Lokal zusätzlich: {hints.localSecretsPathHint}</p>
        <p className="mt-1 text-xs text-slate-500">
          Modal erneut testen: URL-Parameter <code className="rounded bg-black/30 px-1">?showOnboarding=1</code>
        </p>

        <div className="modal-action mt-6">
          <button
            type="button"
            className="btn rounded-lg border-0 bg-white px-6 font-medium text-[#141927] shadow-none hover:bg-white/90"
            onClick={dismiss}
          >
            Verstanden — nicht wieder anzeigen
          </button>
        </div>
      </div>
      <button
        type="button"
        className="modal-backdrop bg-black/70"
        aria-label="Schließen"
        onClick={dismiss}
      />
    </div>
  );
}
