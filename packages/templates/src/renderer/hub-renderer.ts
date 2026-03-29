/**
 * Ploybundle Hub — thin, task-first project shell over real tools (Directus, Windmill, etc.).
 * Not a replacement console: categories, health hints, deep links, and quick actions only.
 */
import type { HubBoardConfig, ProjectConfig, ProjectUrls } from "@ploybundle/shared";
import { buildProjectUrls } from "@ploybundle/shared";

function renderHubPingRoute(): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";

async function allowedUrlPrefixes(): Promise<string[]> {
  try {
    const board = await loadBoard();
    const urls = board.urls ?? {};
    return Object.values(urls)
      .filter((u): u is string => typeof u === "string" && /^https?:\\/\\//i.test(u))
      .map((u) => u.replace(/\\/$/, ""));
  } catch {
    return [];
  }
}

function isPingTargetAllowed(target: string, prefixes: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const normalized = (target.split("#")[0] ?? target).trim();
  return prefixes.some(
    (p) => normalized === p || normalized.startsWith(p + "/") || normalized.startsWith(p + "?")
  );
}

async function probe(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "manual" });
    if (res.ok) return true;
    if (res.status >= 300 && res.status < 400) return true;
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: { Range: "bytes=0-0" },
      });
      return res.ok || res.status === 206;
    }
    res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ ok: false, error: "missing url" }, { status: 400 });
  }
  const prefixes = await allowedUrlPrefixes();
  if (prefixes.length === 0) {
    return NextResponse.json({ ok: false, error: "board unavailable" }, { status: 503 });
  }
  if (!isPingTargetAllowed(target, prefixes)) {
    return NextResponse.json({ ok: false, error: "url not allowed" }, { status: 403 });
  }
  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const probeUrl = toHubBackendServiceUrl(target, productDocker);
  const ok = await probe(probeUrl);
  return NextResponse.json({ ok });
}
`;
}

function renderHubOnboardingHintsRoute(): string {
  return `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Safe hints for the first-visit modal: no passwords in JSON (read from .env on the host). */
export async function GET() {
  const projectName = process.env.PROJECT_NAME?.trim() || "project";
  const directusEmail =
    process.env.DIRECTUS_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || "";
  const postgresUser = process.env.POSTGRES_USER?.trim() || projectName;
  const postgresDb = process.env.POSTGRES_DB?.trim() || projectName;

  return NextResponse.json({
    projectName,
    directusEmail: directusEmail.length > 0 ? directusEmail : null,
    postgresUser,
    postgresDb,
    adminerServer: "postgres",
    envFileHint: "Datei .env im selben Ordner wie docker-compose.yml (nicht committen).",
    localSecretsPathHint: ".ploybundle-state/local/secrets.json (lokal, gitignored)",
    windmill: {
      email: "admin@windmill.dev",
      passwordHint: "changeme",
      detail:
        "Im Windmill-Fenster auf Sign in klicken. WINDMILL_SECRET in .env ist für API/Bootstrap, nicht dieses UI-Passwort.",
    },
  });
}
`;
}

function renderHubCredentialsOnboardingModal(): string {
  return `"use client";

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
  return lines.join("\\n");
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
`;
}

export function renderHubBundle(config: ProjectConfig, board: HubBoardConfig): Record<string, string> {
  const urls = buildProjectUrls(config.domain);
  const resolved = resolveBoard(board, urls, config);
  const boardJson = renderHubBoardData(config, resolved, urls);

  return {
    "hub/config/board.json": boardJson,
    "hub/package.json": renderHubPackageJson(),
    "hub/tsconfig.json": renderHubTsConfig(),
    "hub/next.config.mjs": renderHubNextConfig(),
    "hub/next-env.d.ts": renderHubNextEnv(),
    "hub/tailwind.config.ts": renderHubTailwindConfig(),
    "hub/postcss.config.mjs": renderHubPostcssConfig(),
    "hub/.dockerignore": renderHubDockerIgnore(),
    "hub/Dockerfile": renderHubDockerfile(),
    "hub/src/app/globals.css": renderHubGlobalsCss(),
    "hub/src/app/layout.tsx": renderHubRootLayout(),
    "hub/src/app/api/onboarding-hints/route.ts": renderHubOnboardingHintsRoute(),
    "hub/src/app/api/ping/route.ts": renderHubPingRoute(),
    "hub/src/app/api/overview/route.ts": renderHubOverviewRoute(),
    "hub/src/app/api/modules/[id]/route.ts": renderHubModulesRoute(),
    "hub/src/app/api/project-spec/route.ts": renderHubProjectSpecRoute(),
    "hub/src/app/api/board/route.ts": renderHubBoardPatchRoute(),
    "hub/src/app/api/logs/route.ts": renderHubLogsApiRoute(),
    "hub/src/app/api/actions/invite-user/route.ts": renderHubInviteUserRoute(),
    "hub/src/app/api/actions/restart-service/route.ts": renderHubRestartServiceRoute(),
    "hub/src/app/api/actions/request-secret-rotation/route.ts": renderHubRequestSecretRotationRoute(),
    "hub/src/app/api/auth/hub-session/route.ts": renderHubHubSessionRoute(),
    "hub/src/app/api/audit-log/route.ts": renderHubAuditLogRoute(),
    "hub/src/lib/hub-action-auth.ts": renderHubHubActionAuthTs(),
    "hub/src/lib/stack-control.ts": renderHubStackControlTs(),
    "hub/src/app/projects/page.tsx": renderHubProjectsPage(),
    "hub/src/app/page.tsx": renderHubOverviewPage(),
    "hub/src/app/logs/page.tsx": renderHubLogsPage(),
    "hub/src/app/settings/page.tsx": renderHubSettingsPage(),
    "hub/src/app/[categoryId]/page.tsx": renderHubCategoryPage(),
    "hub/src/lib/load-board.ts": renderHubLoadBoardTs(),
    "hub/src/lib/hub-service-urls.ts": renderHubHubServiceUrlsTs(),
    "hub/src/lib/facade-lines.ts": renderHubFacadeLinesTs(),
    "hub/src/components/credentials-onboarding-modal.tsx": renderHubCredentialsOnboardingModal(),
    "hub/src/components/hub-sidebar.tsx": renderHubSidebar(),
    "hub/src/components/loading-spinner.tsx": renderHubLoadingSpinner(),
    "hub/src/components/section-health-summary.tsx": renderHubSectionHealthSummary(),
    "hub/src/components/overall-health-strip.tsx": renderHubOverallHealthStrip(),
    "hub/src/components/overview-live-kpis.tsx": renderHubOverviewLiveKpis(),
    "hub/src/components/module-control-surface.tsx": renderHubModuleControlSurface(),
    "hub/src/components/invite-user-form.tsx": renderHubInviteUserForm(),
    "hub/src/components/service-card.tsx": renderHubServiceCard(),
    "hub/src/components/status-dot.tsx": renderHubStatusDot(),
    "hub/public/.gitkeep": "",
  };
}

export function renderHubBoardJson(config: ProjectConfig, board: HubBoardConfig): string {
  const urls = buildProjectUrls(config.domain);
  return renderHubBoardData(config, resolveBoard(board, urls, config), urls);
}

/** @deprecated Use renderHubBundle */
export const renderHomarrBundle = renderHubBundle;
/** @deprecated Use renderHubBoardJson */
export const renderHomarrBoardJson = renderHubBoardJson;
/** @deprecated Use renderHubBoardJson */
export function renderHomepageConfig(config: ProjectConfig, board: HubBoardConfig): string {
  return renderHubBoardJson(config, board);
}
/** @deprecated Use renderHubBundle */
export const renderFullHomepageBundle = renderHubBundle;

function renderHubBoardData(config: ProjectConfig, board: HubBoardConfig, urls: ProjectUrls): string {
  return JSON.stringify(
    {
      projectName: config.projectName,
      mode: config.mode,
      target: config.target ?? "local",
      preset: config.template?.name ?? config.preset,
      productFrontend: config.frontend,
      domainRoot: config.domain.root,
      urls,
      /** Optional: set deployed product URLs here (not generated from domain). */
      productDeploymentUrls: { serverProd: "", serverTest: "" },
      bucketCount: config.buckets.length,
      /** Hub sidebar label; empty → formatted project slug. Editable via PATCH /api/board. */
      displayName: board.displayName ?? "",
      /** Repository link in sidebar; empty → “Repo hinzufügen”. Editable via PATCH /api/board. */
      repositoryUrl: board.repositoryUrl ?? "",
      title: board.title,
      subtitle: board.subtitle,
      theme: board.theme,
      sections: board.sections,
      apps: board.apps,
      widgets: board.widgets,
      projectsRegistry: board.projectsRegistry ?? [],
    },
    null,
    2
  );
}

function resolveTemplate(template: string, urls: ProjectUrls, config: ProjectConfig): string {
  const db = urls.databaseBrowser ?? "";
  return template
    .replace(/\{\{urls\.app\}\}/g, urls.app)
    .replace(/\{\{urls\.admin\}\}/g, urls.admin)
    .replace(/\{\{urls\.storage\}\}/g, urls.storage)
    .replace(/\{\{urls\.storageBrowser\}\}/g, urls.storageBrowser)
    .replace(/\{\{urls\.databaseBrowser\}\}/g, db)
    .replace(/\{\{urls\.functions\}\}/g, urls.functions)
    .replace(/\{\{urls\.deploy\}\}/g, urls.deploy)
    .replace(/\{\{urls\.dashboard\}\}/g, urls.dashboard)
    .replace(/\{\{projectDbUser\}\}/g, encodeURIComponent(config.projectName))
    .replace(/\{\{projectDbName\}\}/g, encodeURIComponent(config.projectName));
}

function resolveBoard(board: HubBoardConfig, urls: ProjectUrls, config: ProjectConfig): HubBoardConfig {
  const hasDbUi = Boolean(urls.databaseBrowser);
  const keepApp = (app: HubBoardConfig["apps"][number]) => {
    const h = app.href;
    const p = app.pingUrl ?? "";
    if ((h.includes("{{urls.databaseBrowser}}") || p.includes("{{urls.databaseBrowser}}")) && !hasDbUi) {
      return false;
    }
    return true;
  };
  const productStackBadge =
    config.frontend === "vite-react" ? "Vite + React (SPA)" : "Next.js";

  return {
    ...board,
    sections: board.sections.map((s) =>
      s.kind === "category" && s.id === "app"
        ? { ...s, serviceBadge: productStackBadge }
        : s
    ),
    apps: board.apps.filter(keepApp).map((app) => {
      const href = resolveTemplate(app.href, urls, config);
      const pingUrl = app.pingUrl ? resolveTemplate(app.pingUrl, urls, config) : undefined;
      const isProductTile =
        typeof app.pingUrl === "string" && app.pingUrl.includes("{{urls.app}}/api/health");
      if (isProductTile) {
        const name =
          config.frontend === "vite-react" ? "Product app (Vite)" : "Product app (Next.js)";
        const iconUrl =
          config.frontend === "vite-react"
            ? "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/vite.svg"
            : "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/nextdotjs.svg";
        return { ...app, name, iconUrl, href, pingUrl };
      }
      return { ...app, href, pingUrl };
    }),
    widgets: board.widgets.map((w) => ({
      ...w,
      config: Object.fromEntries(
        Object.entries(w.config).map(([k, v]) => [
          k,
          typeof v === "string" ? resolveTemplate(v, urls, config) : v,
        ])
      ),
    })),
  };
}

function renderHubPackageJson(): string {
  return JSON.stringify(
    {
      name: "ploybundle-hub",
      version: "0.1.0",
      private: true,
      scripts: {
        dev: "next dev -p 3000",
        build: "next build",
        start: "next start -p 3000",
        lint: "next lint",
      },
      dependencies: {
        next: "14.2.18",
        dockerode: "^4.0.2",
        pg: "latest",
        react: "18.3.1",
        "react-dom": "18.3.1",
      },
      devDependencies: {
        autoprefixer: "10.4.20",
        daisyui: "4.12.14",
        postcss: "8.4.49",
        tailwindcss: "3.4.15",
        typescript: "5.6.3",
        "@types/dockerode": "^3.3.31",
        "@types/node": "20.14.0",
        "@types/pg": "latest",
        "@types/react": "18.3.12",
        "@types/react-dom": "18.3.1",
      },
    },
    null,
    2
  );
}

function renderHubTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: { "@/*": ["./src/*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    },
    null,
    2
  );
}

function renderHubNextConfig(): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { serverComponentsExternalPackages: ["dockerode"] },
};
export default nextConfig;
`;
}

function renderHubNextEnv(): string {
  return `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`;
}

function renderHubTailwindConfig(): string {
  return `import type { Config } from "tailwindcss";
import daisyui from "daisyui";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [daisyui],
  daisyui: { themes: ["dark"], darkTheme: "dark" },
};

export default config;
`;
}

function renderHubPostcssConfig(): string {
  return `/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
`;
}

function renderHubDockerIgnore(): string {
  return ["node_modules", ".next", "npm-debug.log*", ".env*", "!.env.example", ""].join("\n");
}

function renderHubDockerfile(): string {
  return `FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/config ./config
USER nextjs
EXPOSE 3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
`;
}

function renderHubGlobalsCss(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --pb-sidebar: 15rem;
  --pb-bg: #0d1018;
  --pb-panel: #141927;
  --pb-soft: #1a2030;
  --pb-muted: #8f9bb3;
}

body {
  @apply antialiased;
  background: radial-gradient(1200px 600px at 20% -20%, #1b2440 0%, var(--pb-bg) 45%) fixed;
  color: #e8edf7;
}
`;
}

/** Single root layout (no route group) so Next.js \`output: standalone\` Docker builds trace files correctly. */
function renderHubRootLayout(): string {
  const metaDesc =
    "Ploybundle control plane: area status, whitelisted stack actions, and provider consoles (advanced) for Directus, Windmill, storage, and deploy.";
  return `import type { Metadata } from "next";
import "./globals.css";
import { CredentialsOnboardingModal } from "@/components/credentials-onboarding-modal";
import { HubSidebar } from "@/components/hub-sidebar";
import { loadBoard } from "@/lib/load-board";

function formatProjectLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function hubTitleFromBoard(board: Awaited<ReturnType<typeof loadBoard>>): string {
  const d = board.displayName?.trim();
  return (d && d.length > 0 ? d : formatProjectLabel(board.projectName)) + " — Project hub";
}

export async function generateMetadata(): Promise<Metadata> {
  const board = await loadBoard();
  return {
    title: hubTitleFromBoard(board),
    description: ${JSON.stringify(metaDesc)},
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const board = await loadBoard();
  const accent = board.theme.primaryColor || "#10b981";
  return (
    <html lang="en" data-theme="dark">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: ":root { --p: " + accent + "; --pf: " + accent + "; }",
          }}
        />
      </head>
      <body data-theme="dark" className="min-h-screen bg-transparent text-slate-100">
        <CredentialsOnboardingModal />
        <div className="flex min-h-screen">
          <HubSidebar board={board} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-transparent">{children}</div>
        </div>
      </body>
    </html>
  );
}
`;
}

function renderHubLoadBoardTs(): string {
  return `import { readFile } from "fs/promises";
import path from "path";

export type BoardJson = {
  projectName: string;
  target: string;
  preset: string;
  /** Which product UI compose service maps to app URL (hub overview internal fetches). */
  productFrontend?: "nextjs" | "vite-react";
  domainRoot: string;
  urls: {
    app: string;
    admin: string;
    storage: string;
    storageBrowser: string;
    functions: string;
    deploy: string;
    dashboard: string;
    databaseBrowser?: string;
  };
  /** Edit in board.json: deployed product app URLs (prod / staging). */
  productDeploymentUrls?: { serverProd?: string; serverTest?: string };
  bucketCount: number;
  /** Human-readable sidebar title; empty → formatted projectName. */
  displayName?: string;
  /** Repository URL for sidebar link. */
  repositoryUrl?: string;
  title: string;
  subtitle: string;
  theme: { primaryColor: string; secondaryColor: string };
  sections: {
    kind: string;
    id: string;
    title: string;
    serviceBadge?: string;
    summary?: string;
  }[];
  apps: {
    name: string;
    description: string;
    iconUrl: string;
    href: string;
    pingUrl?: string;
    section: string;
    providerConsole?: boolean;
  }[];
  widgets: { kind: string; section: string; title?: string; config: Record<string, unknown> }[];
  projectsRegistry?: { id: string; label: string; hubUrl: string; note?: string }[];
};

export async function loadBoard(): Promise<BoardJson> {
  const raw = await readFile(path.join(process.cwd(), "config", "board.json"), "utf-8");
  return JSON.parse(raw) as BoardJson;
}
`;
}

function renderHubFacadeLinesTs(): string {
  return `/** Curated facade copy per area — not live data; deep work stays in the source tools. */
export const FACADE_LINES: Record<string, string[]> = {
  overview: [],
  app: ["Local product URL vs server prod/test (set in board.json)", "Health endpoint checks", "Release notes from your pipeline (when wired)"],
  auth: ["Users, roles, invitations", "Sign-in/session policy controls", "Authentication settings in Directus"],
  database: ["Collections and schema management", "Data records and relational views", "SQL browser (Adminer) for direct queries"],
  functions: ["Workspace scripts and flows", "API-triggered backend logic", "Execution endpoints and troubleshooting"],
  storage: ["Buckets and upload targets", "Directus file library", "Raw S3 API endpoint for integrations"],
  jobs: ["Cron and schedules", "Recent runs and failures", "Operational background processing"],
  deploy: ["Current release and history", "Logs and env snapshot (in deploy UI)", "Restart / redeploy shortcuts"],
  logs: ["Tail logs from compose services (when Docker socket is mounted)", "Fallback: docker compose logs from your terminal"],
  settings: [
    "board.json is the hub’s source of truth for URLs and shortcuts",
    "Sidebar display name and repository link: edit in the nav header or PATCH /api/board (not ploybundle.yaml).",
    "Secrets stay in .env — never shown here",
  ],
};
`;
}

function renderHubSidebar(): string {
  return `"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BoardJson } from "@/lib/load-board";
import { LoadingSpinner } from "./loading-spinner";

function formatProjectLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function repoLinkLabel(url: string): string {
  try {
    const h = new URL(url).hostname;
    return h.replace(/^www\\./, "") || "Repository";
  } catch {
    return "Repository";
  }
}

export function HubSidebar({ board }: { board: BoardJson }) {
  const pathname = usePathname();
  const router = useRouter();
  const derivedName = board.displayName?.trim() || formatProjectLabel(board.projectName);
  const [nameEdit, setNameEdit] = useState(derivedName);
  const [editingName, setEditingName] = useState(false);
  const [repoUrl, setRepoUrl] = useState(board.repositoryUrl?.trim() ?? "");
  const [repoDraft, setRepoDraft] = useState(repoUrl);
  const [editingRepo, setEditingRepo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setNameEdit(board.displayName?.trim() || formatProjectLabel(board.projectName));
    const r = board.repositoryUrl?.trim() ?? "";
    setRepoUrl(r);
    setRepoDraft(r);
  }, [board.displayName, board.repositoryUrl, board.projectName]);

  const savePatch = useCallback(
    async (patch: { displayName?: string; repositoryUrl?: string }) => {
      setSaving(true);
      setErr(null);
      try {
        const res = await fetch("/api/board", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || res.statusText);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [router]
  );

  const commitName = async () => {
    setEditingName(false);
    const next = nameEdit.trim();
    const prev = (board.displayName?.trim() || formatProjectLabel(board.projectName)).trim();
    if (next === prev) return;
    await savePatch({ displayName: next });
  };

  const commitRepo = async () => {
    setEditingRepo(false);
    const next = repoDraft.trim();
    if (next === (board.repositoryUrl?.trim() ?? "")) return;
    await savePatch({ repositoryUrl: next });
  };

  const navSections = board.sections.filter((s) => s.kind === "overview" || s.kind === "category");
  const byId = new Map(navSections.map((s) => [s.id, s]));
  const grouped = [
    { title: "Frontend", ids: ["app"] },
    { title: "Backend", ids: ["auth", "database", "functions", "storage", "jobs"] },
    { title: "Operations", ids: ["logs", "deploy"] },
    { title: "Project", ids: ["settings"] },
  ];
  const tierLabel = board.target === "full" ? "Full" : "Lite";

  return (
    <aside
      className="sticky top-0 z-40 flex h-screen w-[var(--pb-sidebar)] shrink-0 flex-col border-r border-white/10 bg-[#0f1422]/95 backdrop-blur-md"
      aria-label="Project navigation"
    >
      <div className="border-b border-white/10 px-4 py-5">
        <div className="rounded-lg outline-none focus-within:ring-2 focus-within:ring-primary">
          <Link
            href="/"
            className="mb-2 block rounded-lg outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <span className="h-2 w-2 shrink-0 rounded-full bg-fuchsia-500" />
              <span>PLOYBUNDLE</span>
              <span className="text-slate-600">·</span>
              {editingName ? (
                <input
                  autoFocus
                  className="input input-sm h-7 min-w-[5rem] max-w-[11rem] flex-1 border-white/20 bg-[#1b2233] px-2 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                  onBlur={() => void commitName()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  onClick={(e) => e.preventDefault()}
                />
              ) : (
                <button
                  type="button"
                  title="Edit display name"
                  className="max-w-[11rem] truncate text-left text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200/90 hover:text-fuchsia-100"
                  onClick={(e) => {
                    e.preventDefault();
                    setNameEdit(board.displayName?.trim() || formatProjectLabel(board.projectName));
                    setEditingName(true);
                  }}
                >
                  {derivedName}
                </button>
              )}
            </div>
          </Link>
          <div className="relative mt-1.5 pl-6 text-[11px] normal-case">
            {saving ? (
              <span className="mb-1 inline-flex items-center gap-2 text-slate-500">
                <LoadingSpinner size="xs" />
              </span>
            ) : null}
            {err ? <span className="mb-1 block text-[10px] text-rose-400">{err}</span> : null}
            {editingRepo ? (
              <div className="flex flex-col gap-1.5">
                <input
                  className="input input-bordered input-sm w-full border-white/20 bg-[#1b2233] text-xs text-white"
                  placeholder="https://…"
                  value={repoDraft}
                  onChange={(e) => setRepoDraft(e.target.value)}
                  autoFocus
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost btn-xs text-fuchsia-300" onClick={() => void commitRepo()}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-slate-400"
                    onClick={() => {
                      setRepoDraft(repoUrl);
                      setEditingRepo(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : repoUrl ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-hover link font-medium text-slate-400 hover:text-fuchsia-300"
                >
                  {repoLinkLabel(repoUrl)}
                </a>
                <button
                  type="button"
                  className="text-[10px] text-slate-500 underline decoration-dotted hover:text-fuchsia-300"
                  onClick={() => {
                    setRepoDraft(repoUrl);
                    setEditingRepo(true);
                  }}
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-slate-500 hover:text-fuchsia-300"
                onClick={() => {
                  setRepoDraft("");
                  setEditingRepo(true);
                }}
              >
                Repo hinzufügen
              </button>
            )}
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm" aria-label="Areas">
        <Link
          href="/"
          className={
            "mb-3 block rounded-lg px-3 py-2 outline-none transition-colors " +
            (pathname === "/" ? "bg-[#212a3f] text-white" : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
          }
        >
          <span className="font-medium leading-snug">Overview</span>
        </Link>
        {grouped.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">{group.title}</div>
            {group.ids.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              const href = "/" + s.id;
              const pathActive = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={s.id}
                  href={href}
                  className={
                    "mb-1.5 block rounded-lg px-3 py-2 outline-none transition-colors " +
                    (pathActive
                      ? "bg-[#212a3f] text-white"
                      : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
                  }
                >
                  <span className="font-medium leading-snug">{s.title}</span>
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mb-4 px-3">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-400">Registry</div>
          <Link
            href="/projects"
            className={
              "block rounded-lg px-3 py-2 outline-none transition-colors " +
              (pathname === "/projects"
                ? "bg-[#212a3f] text-white"
                : "text-slate-300 hover:bg-[#1b2336] hover:text-white")
            }
          >
            <span className="font-medium leading-snug">Other hubs</span>
          </Link>
        </div>
      </nav>
      <div className="border-t border-white/10 p-3 text-[10px] leading-relaxed text-slate-500">
        Curated links · {tierLabel} stack
      </div>
    </aside>
  );
}
`;
}

function renderHubSectionHealthSummary(): string {
  return `"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type Phase = "loading" | "ok" | "bad";

function checkPing(url: string, signal: AbortSignal): Promise<boolean> {
  const q = \`/api/ping?url=\${encodeURIComponent(url)}\`;
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
`;
}

function renderHubOverallHealthStrip(): string {
  return `"use client";

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
`;
}

function renderHubOverviewLiveKpis(): string {
  return `"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type OverviewPayload = {
  generatedAt: string;
  kpis: {
    users: number | null;
    requests: number | null;
    rows: number | null;
    executions: number | null;
    collections: number | null;
    buckets: number | null;
  };
  services: Array<{ name: string; status: "healthy" | "degraded" | "down"; details?: string }>;
};

function fmt(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("de-DE").format(value);
}

const statusClass: Record<string, string> = {
  healthy: "text-emerald-100 bg-emerald-500/18 border-emerald-300/45",
  degraded: "text-amber-100 bg-amber-500/18 border-amber-300/45",
  down: "text-rose-100 bg-rose-500/18 border-rose-300/45",
};

export function OverviewLiveKpis() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const res = await fetch("/api/overview", { cache: "no-store" });
        const json = (await res.json()) as OverviewPayload;
        if (active) setData(json);
      } catch (err) {
        console.error("overview fetch failed", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const k = data?.kpis;
  return (
    <section className="mb-9 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-fuchsia-300">Live Overview</h2>
        <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200">
          v2
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Users</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.users ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Requests</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.requests ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Rows</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.rows ?? null)}
          </div>
        </div>
        <div className="h-[120px] rounded-2xl border border-white/10 bg-[#141927] p-5 shadow-[0_12px_24px_rgba(0,0,0,0.22)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Executions</div>
          <div className="mt-3 flex min-h-[40px] items-center text-[36px] font-semibold leading-none text-slate-100">
            {loading ? <LoadingSpinner size="md" /> : fmt(k?.executions ?? null)}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#141927] shadow-[0_12px_28px_rgba(0,0,0,0.25)]">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Integrations
          </div>
          <div className="text-xs text-slate-500">
            {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("de-DE") : "live"}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] border-b border-white/5 px-5 py-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
          <span>Service</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-white/5">
          {loading && !data?.services?.length ? (
            <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 px-5 py-8">
              <LoadingSpinner size="md" />
              <span className="text-sm text-slate-400">Loading service status…</span>
            </div>
          ) : (
            (data?.services ?? []).map((s) => (
              <div key={s.name} className="grid min-h-[62px] grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5">
                <div>
                  <div className="text-[13px] font-semibold text-slate-100">{s.name}</div>
                  {s.details ? <div className="text-xs text-slate-400">{s.details}</div> : null}
                </div>
                <span className={\`rounded-lg border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide \${statusClass[s.status] ?? statusClass.degraded}\`}>
                  {s.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
`;
}

function renderHubHubServiceUrlsTs(): string {
  return `import type { BoardJson } from "./load-board";

/** Compose service hostname for the product UI (hub runs in Docker; localhost URLs must be remapped). */
export function productDockerHostFromBoard(board: BoardJson): string {
  return board.productFrontend === "vite-react" ? "vite:3000" : "nextjs:3000";
}

/**
 * Hub API routes that call other stack services should remap browser URLs (localhost:PORT) to
 * Docker DNS names when the hub shares the compose network (DATABASE_URL points at @postgres:).
 * If you run the hub with \`pnpm dev\` on the host and DB is localhost, no rewrite occurs.
 */
export function hubRunsInsideComposeNetwork(): boolean {
  return (process.env.DATABASE_URL ?? "").includes("@postgres");
}

export function toInternalServiceUrl(raw: string, productDockerHost: string): string {
  const u = new URL(raw);
  const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!isLocal) return raw;
  const byPort: Record<string, string> = {
    "8055": "directus:8055",
    "8000": "windmill:8000",
    "9333": "seaweedfs:9333",
    "8333": "seaweedfs:8333",
    "8088": "adminer:8080",
    "3001": productDockerHost,
    /** Product container listens on 3000; host may publish as :3000 (server mode) or :3001 (local dev). */
    "3000": productDockerHost,
  };
  const mapped = byPort[u.port];
  if (!mapped) return raw;
  return \`\${u.protocol}//\${mapped}\${u.pathname}\${u.search}\`;
}

export function toHubBackendServiceUrl(raw: string, productDockerHost: string): string {
  if (!hubRunsInsideComposeNetwork()) return raw;
  return toInternalServiceUrl(raw, productDockerHost);
}

/**
 * Deploy health checks: when deploy URL is CapRover on the host (:3000) while the app uses another port,
 * reach the host via host.docker.internal (hub extra_hosts). If deploy and app URLs match, use compose DNS.
 */
export function toDeployProbeUrl(deployUrl: string, appUrl: string, productDockerHost: string): string {
  if (!hubRunsInsideComposeNetwork()) return deployUrl;
  let d: URL;
  let a: URL;
  try {
    d = new URL(deployUrl);
    a = new URL(appUrl);
  } catch {
    return deployUrl;
  }
  const local = (h: string) => h === "localhost" || h === "127.0.0.1";
  if (!local(d.hostname)) return deployUrl;
  const sameAsApp = d.hostname === a.hostname && d.port === a.port;
  if (sameAsApp) return toInternalServiceUrl(deployUrl, productDockerHost);
  if (d.port === "3000") {
    return \`\${d.protocol}//host.docker.internal:3000\${d.pathname}\${d.search}\`;
  }
  return toInternalServiceUrl(deployUrl, productDockerHost);
}
`;
}

function renderHubOverviewRoute(): string {
  return `import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";
import { Client } from "pg";

type ServiceState = { name: string; status: "healthy" | "degraded" | "down"; details?: string };

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(\`\${res.status} \${res.statusText}\`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(\`\${res.status} \${res.statusText}\`);
  return res.text();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchJsonRetry(url: string, init: RequestInit | undefined, attempts: number): Promise<any> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJson(url, init);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
}

async function fetchTextRetry(url: string, init: RequestInit | undefined, attempts: number): Promise<string> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url, init);
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
}

async function queryCount(query: string): Promise<number | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(query);
    const value = Number(res.rows?.[0]?.count ?? null);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function GET() {
  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const productLabel =
    board.productFrontend === "vite-react" ? "Product app (Vite)" : "Product app (Next.js)";
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\\/+$/, "");
  const windmillBase = toHubBackendServiceUrl(board.urls.functions, productDocker).replace(/\\/+$/, "");
  const storageBrowserBase = toHubBackendServiceUrl(board.urls.storageBrowser, productDocker).replace(
    /\\/+$/,
    ""
  );
  const appBase = toHubBackendServiceUrl(board.urls.app, productDocker).replace(/\\/+$/, "");
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;
  const workspace = process.env.PROJECT_NAME || "localdev";

  const services: ServiceState[] = [];
  let users: number | null = null;
  let rows: number | null = null;
  let collections: number | null = null;
  let executions: number | null = null;
  let requests: number | null = null;
  let buckets: number | null = board.bucketCount ?? null;

  // Directus metrics: login -> users/files/collections counts.
  if (!adminEmail?.trim() || !adminPassword?.trim()) {
    services.push({
      name: "Directus",
      status: "degraded",
      details:
        "Missing admin credentials: set DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD in .env (hub also receives ADMIN_EMAIL/ADMIN_PASSWORD from compose).",
    });
  } else {
    try {
      const login = await fetchJsonRetry(
        \`\${directusBase}/auth/login\`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: adminEmail, password: adminPassword }),
        },
        8
      );
      const token = login?.data?.access_token as string | undefined;
      if (!token) throw new Error("no access token");

      const headers = { authorization: \`Bearer \${token}\` };
      const [usersRes, filesRes, collectionsRes] = await Promise.all([
        fetchJson(\`\${directusBase}/users?limit=1&meta=total_count\`, { headers }),
        fetchJson(\`\${directusBase}/files?limit=1&meta=total_count\`, { headers }),
        fetchJson(\`\${directusBase}/collections\`, { headers }),
      ]);
      users = Number(usersRes?.meta?.total_count ?? null);
      const fileRows = Number(filesRes?.meta?.total_count ?? 0);
      rows = (Number.isFinite(users ?? NaN) ? Number(users) : 0) + (Number.isFinite(fileRows) ? fileRows : 0);
      const c = collectionsRes?.data;
      collections = Array.isArray(c) ? c.length : null;
      services.push({ name: "Directus", status: "healthy", details: "users/files/collections live" });
    } catch (err: any) {
      services.push({ name: "Directus", status: "degraded", details: String(err?.message || err) });
    }
  }

  // Windmill: version endpoint + DB-backed execution count (stable for local-dev).
  try {
    const version = await fetchTextRetry(\`\${windmillBase}/api/version\`, undefined, 10);
    executions = await queryCount("select count(*)::bigint as count from v2_job_completed");
    services.push({ name: "Windmill", status: "healthy", details: \`version \${version.trim()}\` });
  } catch (err: any) {
    services.push({ name: "Windmill", status: "down", details: String(err?.message || err) });
  }

  // SeaweedFS: live cluster signal + configured bucket count from board config.
  try {
    await fetchJson(\`\${storageBrowserBase}/cluster/status\`);
    services.push({ name: "SeaweedFS", status: "healthy", details: "cluster reachable" });
  } catch (err: any) {
    services.push({ name: "SeaweedFS", status: "down", details: String(err?.message || err) });
  }

  // App health.
  try {
    await fetchText(\`\${appBase}/api/health\`);
    services.push({ name: productLabel, status: "healthy", details: "health endpoint ok" });
  } catch {
    services.push({ name: productLabel, status: "degraded", details: "health endpoint not exposed" });
  }

  // Requests KPI from Directus activity table; fallback to healthy service count.
  const reqCount = await queryCount("select count(*)::bigint as count from directus_activity");
  requests = reqCount ?? services.filter((s) => s.status === "healthy").length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    kpis: { users, requests, rows, executions, collections, buckets },
    services,
  });
}
`;
}

function renderHubModulesRoute(): string {
  return `import { NextResponse } from "next/server";
import { Client } from "pg";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toDeployProbeUrl, toHubBackendServiceUrl } from "@/lib/hub-service-urls";

const MODULE_IDS = ["app", "auth", "database", "functions", "storage", "jobs", "deploy"] as const;
type ModuleId = (typeof MODULE_IDS)[number];

function isModuleId(id: string): id is ModuleId {
  return (MODULE_IDS as readonly string[]).includes(id);
}

type ModuleHealth = "healthy" | "degraded" | "unknown" | "down";

export type ModuleAction = {
  id: string;
  label: string;
  /** Default "link" when href is set. */
  kind?: "link" | "post";
  href?: string;
  postPath?: string;
  postBody?: Record<string, unknown>;
  confirmMessage?: string;
  danger?: boolean;
  variant?: "primary" | "outline";
};

export type ModuleSummaryPayload = {
  module: string;
  provider: string;
  health: ModuleHealth;
  healthDetail?: string;
  metrics: Record<string, string | number | null>;
  providerConsoleUrl?: string;
  primaryUrl?: string;
  /** Quick actions: in-hub links or POSTs to /api/actions/* (whitelisted server ops). */
  actions?: ModuleAction[];
  notes: string[];
};

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) {
    throw new Error(\`\${res.status} \${res.statusText}\`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(\`\${res.status} \${res.statusText}\`);
  return res.text();
}

async function queryCount(query: string): Promise<number | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(query);
    const value = Number(res.rows?.[0]?.count ?? null);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function probeDeploy(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal, redirect: "manual" });
    if (res.ok) return true;
    if (res.status >= 300 && res.status < 400) return true;
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        signal: ctrl.signal,
        redirect: "manual",
        headers: { Range: "bytes=0-0" },
      });
      return res.ok || res.status === 206;
    }
    res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      redirect: "manual",
      headers: { Range: "bytes=0-0" },
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function pickNumericMetric(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function seaweedTopologyMetrics(clusterJson: unknown): Record<string, number | null> {
  const root = clusterJson as Record<string, unknown> | null;
  const t = (root?.Topology ?? root?.topology) as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return {};
  return {
    volumeSlotsMax: pickNumericMetric(t.Max, t.max),
    volumeSlotsFree: pickNumericMetric(t.Free, t.free),
  };
}

async function deployPlatformMetrics(): Promise<Record<string, string | number | null>> {
  const out: Record<string, string | number | null> = {};
  const capRoot = process.env.CAPROVER_ROOT?.replace(/\\/+$/, "");
  const capPw = process.env.CAPROVER_PASSWORD;
  if (capRoot && capPw) {
    try {
      const lr = await fetch(\`\${capRoot}/api/v2/login\`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: capPw }),
      });
      const lj = (await lr.json()) as { data?: { token?: string } };
      const tok = lj?.data?.token;
      if (tok) {
        const ar = await fetch(\`\${capRoot}/api/v2/user/apps/appDefinitions\`, {
          headers: { "x-captain-auth": tok },
        });
        const aj = (await ar.json()) as { data?: { appDefinitions?: unknown[] } };
        const apps = aj?.data?.appDefinitions;
        out.caproverApps = Array.isArray(apps) ? apps.length : null;
        out.platformApi = "CapRover";
      }
    } catch {
      out.platformApi = "CapRover (unavailable)";
    }
  }
  const coolUrl = process.env.COOLIFY_URL?.replace(/\\/+$/, "");
  const coolTok = process.env.COOLIFY_TOKEN;
  if (!out.platformApi && coolUrl && coolTok) {
    try {
      const paths = ["/api/v1/health", "/api/health"];
      for (const p of paths) {
        const hr = await fetch(\`\${coolUrl}\${p}\`, {
          headers: { authorization: \`Bearer \${coolTok}\` },
        });
        if (hr.ok) {
          out.platformApi = "Coolify";
          out.coolifyHealth = hr.status;
          break;
        }
      }
      if (!out.platformApi) out.platformApi = "Coolify (no health endpoint)";
    } catch {
      out.platformApi = "Coolify (unavailable)";
    }
  }
  return out;
}

function joinConsolePath(base: string, path: string): string {
  return \`\${base.replace(/\\/+$/, "")}/\${path.replace(/^\\/+/,"")}\`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Read-only probe: Windmill operator API with WINDMILL_SECRET (workspace path varies by install). */
async function windmillJobsApiProbe(base: string): Promise<string> {
  const secret = process.env.WINDMILL_SECRET?.trim();
  if (!secret) return "no token in hub env";
  const paths = ["/api/jobs/list?per_page=1", "/api/w/main/jobs/list?per_page=1", "/api/w/default/jobs/list?per_page=1"];
  for (const p of paths) {
    try {
      const res = await fetch(\`\${base.replace(/\\/+$/, "")}\${p}\`, {
        headers: { authorization: \`Bearer \${secret}\` },
        cache: "no-store",
      });
      if (res.ok) return "reachable";
    } catch {
      /* try next path */
    }
  }
  return "unavailable";
}

async function fetchJsonRetryModules(url: string, init: RequestInit | undefined, attempts: number): Promise<any> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (!res.ok) throw new Error(\`\${res.status} \${res.statusText}\`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (e) {
      last = e;
      if (i < attempts - 1) await sleep(2500);
    }
  }
  throw last;
}

async function directusAccessToken(directusBase: string): Promise<string | null> {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;
  try {
    const login = await fetchJsonRetryModules(
      \`\${directusBase}/auth/login\`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      },
      8
    );
    return (login?.data?.access_token as string | undefined) ?? null;
  } catch {
    return null;
  }
}

async function queryScalarText(query: string): Promise<string | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query(query);
    const row = res.rows?.[0];
    if (!row) return null;
    const k = Object.keys(row)[0];
    const v = k ? row[k] : null;
    return v != null && v !== "" ? String(v) : null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function fetchSignInMethodsSummary(directusBase: string): Promise<string | null> {
  try {
    const j = await fetchJson(\`\${directusBase}/auth/providers\`);
    const list = Array.isArray(j?.data) ? j.data : [];
    if (list.length === 0) return "default (email)";
    const names = list
      .map((p: { name?: string }) => (typeof p?.name === "string" ? p.name : null))
      .filter(Boolean) as string[];
    return names.length ? names.slice(0, 6).join(", ") : "default (email)";
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rawId = params.id;
  if (!isModuleId(rawId)) {
    return NextResponse.json({ error: "unknown module" }, { status: 404 });
  }
  const id = rawId;

  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const productRuntime =
    board.productFrontend === "vite-react" ? "Vite + React" : "Next.js";
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\\/+$/, "");
  const windmillBase = toHubBackendServiceUrl(board.urls.functions, productDocker).replace(/\\/+$/, "");
  const storageBrowserBase = toHubBackendServiceUrl(board.urls.storageBrowser, productDocker).replace(
    /\\/+$/,
    ""
  );
  const appBase = toHubBackendServiceUrl(board.urls.app, productDocker).replace(/\\/+$/, "");
  const adminBrowserBase = board.urls.admin.replace(/\\/+$/, "");

  if (id === "app") {
    let health: ModuleHealth = "unknown";
    let healthDetail: string | undefined;
    try {
      await fetchText(\`\${appBase}/api/health\`);
      health = "healthy";
      healthDetail = "GET /api/health ok";
    } catch (e: any) {
      health = "degraded";
      healthDetail = String(e?.message || e);
    }
    const body: ModuleSummaryPayload = {
      module: "App",
      provider: productRuntime,
      health,
      healthDetail,
      metrics: { runtime: productRuntime },
      providerConsoleUrl: board.urls.app,
      primaryUrl: board.urls.app,
      actions: [
        { id: "open-app", label: "Open product app", kind: "link", href: board.urls.app, variant: "primary" },
        { id: "open-hub", label: "Open Ploybundle Hub", kind: "link", href: board.urls.dashboard, variant: "outline" },
        {
          id: "restart-product",
          label: "Restart product container",
          kind: "post",
          postPath: "/api/actions/restart-service",
          postBody: { service: board.productFrontend === "vite-react" ? "vite" : "nextjs" },
          confirmMessage: "Restart the product app container? Brief downtime possible.",
          danger: true,
          variant: "outline",
        },
      ],
      notes: [
        "End-user UX lives in the product app; the hub runs whitelisted stack actions (e.g. restart) when Docker is available.",
      ],
    };
    return NextResponse.json(body);
  }

  if (id === "auth") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let users: number | null = null;
    let rolesCount: number | null = null;
    let roleNames: string | null = null;
    const signInMethods = await fetchSignInMethodsSummary(directusBase);
    const lastActivity = await queryScalarText('select max("timestamp")::text as t from directus_activity');

    const token = await directusAccessToken(directusBase);
    if (token) {
      try {
        const headers = { authorization: \`Bearer \${token}\` };
        const [usersRes, rolesRes] = await Promise.all([
          fetchJson(\`\${directusBase}/users?limit=1&meta=total_count\`, { headers }),
          fetchJson(\`\${directusBase}/roles?limit=-1\`, { headers }),
        ]);
        users = Number(usersRes?.meta?.total_count ?? null);
        const roles = Array.isArray(rolesRes?.data) ? rolesRes.data : [];
        rolesCount = roles.length;
        roleNames = roles
          .slice(0, 14)
          .map((r: { name?: string }) => (typeof r?.name === "string" ? r.name : ""))
          .filter(Boolean)
          .join(", ");
        health = Number.isFinite(users) ? "healthy" : "degraded";
        healthDetail = "Directus auth + user directory";
      } catch (e: any) {
        health = "degraded";
        healthDetail = String(e?.message || e);
      }
    } else {
      healthDetail = "Could not log in to Directus (check ADMIN_EMAIL / ADMIN_PASSWORD in hub env).";
    }

    const body: ModuleSummaryPayload = {
      module: "Auth",
      provider: "Directus",
      health,
      healthDetail,
      metrics: {
        users,
        roles: rolesCount,
        roleNames: roleNames && roleNames.length > 0 ? roleNames : null,
        signInMethods: signInMethods ?? null,
        lastDirectusActivity: lastActivity ?? null,
      },
      providerConsoleUrl: joinConsolePath(adminBrowserBase, "admin/users"),
      actions: [
        {
          id: "users-invites",
          label: "Users & invites",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/users"),
          variant: "primary",
        },
        {
          id: "roles",
          label: "Roles & access",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/settings/roles"),
          variant: "outline",
        },
        {
          id: "settings",
          label: "Project settings",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/settings"),
          variant: "outline",
        },
      ],
      notes: [
        "Ploybundle facts (counts, providers) come from this summary; full IAM screens stay in Directus (advanced).",
        "Use Create user below for a simple Directus user from the hub, or Quick actions for full admin screens.",
      ],
    };
    return NextResponse.json(body);
  }

  if (id === "database") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let collections: number | null = null;
    let approxRows: number | null = null;
    const token = await directusAccessToken(directusBase);
    if (token) {
      try {
        const headers = { authorization: \`Bearer \${token}\` };
        const [usersRes, filesRes, collectionsRes] = await Promise.all([
          fetchJson(\`\${directusBase}/users?limit=1&meta=total_count\`, { headers }),
          fetchJson(\`\${directusBase}/files?limit=1&meta=total_count\`, { headers }),
          fetchJson(\`\${directusBase}/collections\`, { headers }),
        ]);
        const u = Number(usersRes?.meta?.total_count ?? 0);
        const f = Number(filesRes?.meta?.total_count ?? 0);
        approxRows = (Number.isFinite(u) ? u : 0) + (Number.isFinite(f) ? f : 0);
        const c = collectionsRes?.data;
        collections = Array.isArray(c) ? c.length : null;
        health = "healthy";
        healthDetail = "Collections and content API reachable";
      } catch (e: any) {
        health = "down";
        healthDetail = String(e?.message || e);
      }
    } else {
      healthDetail = "Could not reach Directus with hub credentials.";
    }
    const notes: string[] = [
      board.urls.databaseBrowser
        ? "Adminer has no separate account: use PostgreSQL login — POSTGRES_USER (same as project name) and POSTGRES_PASSWORD from .env; DB name POSTGRES_DB."
        : "Add databaseBrowser to board.json for an Adminer shortcut.",
      "Schema and app data are managed in Directus; Adminer is for raw SQL only.",
    ];
    const actions: ModuleAction[] = [
      {
        id: "content",
        label: "Content & collections",
        kind: "link",
        href: joinConsolePath(adminBrowserBase, "admin/content"),
        variant: "primary",
      },
      {
        id: "data-model",
        label: "Data model",
        kind: "link",
        href: joinConsolePath(adminBrowserBase, "admin/settings/data-model"),
        variant: "outline",
      },
      {
        id: "restart-directus",
        label: "Restart Directus container",
        kind: "post",
        postPath: "/api/actions/restart-service",
        postBody: { service: "directus" },
        confirmMessage: "Restart Directus? Active admin sessions may drop briefly.",
        danger: true,
        variant: "outline",
      },
    ];
    if (board.urls.databaseBrowser) {
      actions.push({
        id: "adminer",
        label: "SQL browser (Adminer)",
        kind: "link",
        href: board.urls.databaseBrowser.replace(/\\/+$/, "") + "/",
        variant: "outline",
      });
    }
    const body: ModuleSummaryPayload = {
      module: "Database",
      provider: "Directus + PostgreSQL",
      health,
      healthDetail,
      metrics: { collections, approxContentRows: approxRows },
      providerConsoleUrl: joinConsolePath(adminBrowserBase, "admin"),
      actions,
      notes,
    };
    return NextResponse.json(body);
  }

  if (id === "functions" || id === "jobs") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let executions: number | null = null;
    let windmillVersion: string | null = null;
    try {
      const version = await fetchText(\`\${windmillBase}/api/version\`);
      windmillVersion = version.trim() || null;
      executions = await queryCount("select count(*)::bigint as count from v2_job_completed");
      health = "healthy";
      healthDetail = windmillVersion ? \`Windmill \${windmillVersion}\` : "Windmill reachable";
    } catch (e: any) {
      health = "down";
      healthDetail = String(e?.message || e);
    }
    const isJobs = id === "jobs";
    const fnBase = board.urls.functions.replace(/\\/+$/, "");
    const wmJobsApi = await windmillJobsApiProbe(windmillBase);
    const actions: ModuleAction[] = isJobs
      ? [
          {
            id: "schedules",
            label: "Schedules",
            kind: "link",
            href: joinConsolePath(fnBase, "schedules"),
            variant: "primary",
          },
          {
            id: "runs",
            label: "Recent runs",
            kind: "link",
            href: joinConsolePath(fnBase, "runs"),
            variant: "outline",
          },
          { id: "workspace", label: "Windmill workspace", kind: "link", href: fnBase + "/", variant: "outline" },
          {
            id: "restart-windmill",
            label: "Restart Windmill container",
            kind: "post",
            postPath: "/api/actions/restart-service",
            postBody: { service: "windmill" },
            confirmMessage: "Restart Windmill? Running jobs may be interrupted.",
            danger: true,
            variant: "outline",
          },
        ]
      : [
          { id: "workspace", label: "Scripts & flows", kind: "link", href: fnBase + "/", variant: "primary" },
          {
            id: "runs",
            label: "Recent runs",
            kind: "link",
            href: joinConsolePath(fnBase, "runs"),
            variant: "outline",
          },
          {
            id: "restart-windmill-fn",
            label: "Restart Windmill container",
            kind: "post",
            postPath: "/api/actions/restart-service",
            postBody: { service: "windmill" },
            confirmMessage: "Restart Windmill? Running jobs may be interrupted.",
            danger: true,
            variant: "outline",
          },
        ];
    const body: ModuleSummaryPayload = {
      module: isJobs ? "Jobs" : "Functions",
      provider: "Windmill",
      health,
      healthDetail,
      metrics: {
        completedExecutions: executions,
        version: windmillVersion,
        operatorJobsApi: wmJobsApi,
      },
      providerConsoleUrl: isJobs ? joinConsolePath(fnBase, "schedules") : fnBase + "/",
      actions,
      notes: isJobs
        ? [
            "Schedules and run history are edited in Windmill; the hub only aggregates counts.",
            "Windmill UI: on first visit, complete signup / create the initial workspace user (self-hosted). SUPERADMIN_SECRET in .env is for API automation, not the browser password.",
          ]
        : [
            "Flows and API triggers are configured in Windmill.",
            "Windmill UI: on first visit, complete signup / create the initial workspace user (self-hosted). SUPERADMIN_SECRET in .env is for API automation, not the browser password.",
          ],
    };
    return NextResponse.json(body);
  }

  if (id === "storage") {
    let health: ModuleHealth = "down";
    let healthDetail: string | undefined;
    let clusterJson: unknown = null;
    try {
      clusterJson = await fetchJson(\`\${storageBrowserBase}/cluster/status\`);
      health = "healthy";
      healthDetail = "SeaweedFS cluster status ok";
    } catch (e: any) {
      health = "down";
      healthDetail = String(e?.message || e);
    }
    const buckets = board.bucketCount ?? null;
    const browser = board.urls.storageBrowser.replace(/\\/+$/, "");
    const s3 = board.urls.storage.replace(/\\/+$/, "");
    const topo = clusterJson ? seaweedTopologyMetrics(clusterJson) : {};
    const hasS3Creds = Boolean(process.env.SEAWEEDFS_ACCESS_KEY && process.env.SEAWEEDFS_SECRET_KEY);
    const body: ModuleSummaryPayload = {
      module: "Storage",
      provider: "SeaweedFS + Directus files",
      health,
      healthDetail,
      metrics: {
        bucketsConfigured: buckets,
        s3Endpoint: s3,
        hubHasS3Credentials: hasS3Creds ? "yes" : "no",
        ...topo,
      },
      providerConsoleUrl: browser + "/",
      primaryUrl: s3,
      actions: [
        {
          id: "files",
          label: "File library (Directus)",
          kind: "link",
          href: joinConsolePath(adminBrowserBase, "admin/files"),
          variant: "primary",
        },
        {
          id: "s3",
          label: "S3 API (integrations)",
          kind: "link",
          href: s3 + "/",
          variant: "outline",
        },
        {
          id: "cluster-ui",
          label: "Cluster browser (advanced)",
          kind: "link",
          href: browser + "/",
          variant: "outline",
        },
        {
          id: "restart-seaweed",
          label: "Restart SeaweedFS container",
          kind: "post",
          postPath: "/api/actions/restart-service",
          postBody: { service: "seaweedfs" },
          confirmMessage: "Restart SeaweedFS? Uploads and S3 may be briefly unavailable.",
          danger: true,
          variant: "outline",
        },
      ],
      notes: [
        "Prefer Directus files for editorial assets; raw Seaweed UI is for operators.",
        "Hub login is only for this dashboard. Opening Directus or Windmill opens a separate app — sign in there too (Directus: DIRECTUS_ADMIN_EMAIL / DIRECTUS_ADMIN_PASSWORD in local-dev/.env).",
        "S3 port (:8333) is the AWS-compatible API; the site root often returns 403 without request signing — use Directus files or the cluster browser for normal browsing.",
        "If links fail with connection refused, use 127.0.0.1 instead of localhost (IPv6 vs Docker IPv4) or ensure Docker Compose has started the stack.",
      ],
    };
    return NextResponse.json(body);
  }

  // deploy
  const deployUrl = board.urls.deploy.replace(/\\/+$/, "");
  const deployProbeUrl = toDeployProbeUrl(deployUrl, board.urls.app, productDocker);
  const ok = await probeDeploy(deployProbeUrl);
  const platformExtra = await deployPlatformMetrics();
  const body: ModuleSummaryPayload = {
    module: "Deploy",
    provider: "CapRover / Coolify",
    health: ok ? "healthy" : "degraded",
    healthDetail: ok ? "Deploy UI reachable" : "Could not reach deploy URL from hub",
    metrics: { reachable: ok ? "yes" : "no", ...platformExtra },
    providerConsoleUrl: deployUrl + "/",
    primaryUrl: deployUrl + "/",
    actions: [
      {
        id: "deploy-dash",
        label: "Open deploy dashboard",
        kind: "link",
        href: deployUrl + "/",
        variant: "primary",
      },
    ],
    notes: [
      "CapRover/Coolify app counts and health are summarized above when API tokens are present in hub env (CAPROVER_* / COOLIFY_*).",
      "Restart and rollback stay in the deploy platform until wired through hub actions.",
      "Local stacks often point deploy at the product app (e.g. :3001). For CapRover/Coolify on the host, set modes.local.domain.deploy in ploybundle.yaml (e.g. localhost:3000 or :8000) and ensure the hub compose service has extra_hosts host.docker.internal.",
    ],
  };
  return NextResponse.json(body);
}
`;
}

function renderHubOverviewPage(): string {
  return `import Link from "next/link";
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
`;
}

function renderHubCategoryPage(): string {
  return `import { notFound } from "next/navigation";
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
`;
}

function renderHubModuleControlSurface(): string {
  return `"use client";

/**
 * ModuleControlSurface — Fetches /api/modules/[id] and shows provider, health, metrics, and console link for a hub category.
 * Location: hub/src/components/module-control-surface.tsx (generated).
 */
import { useEffect, useState } from "react";
import { LoadingSpinner } from "./loading-spinner";

type ModuleHealth = "healthy" | "degraded" | "unknown" | "down";

type ModuleAction = {
  id: string;
  label: string;
  kind?: "link" | "post";
  href?: string;
  postPath?: string;
  postBody?: Record<string, unknown>;
  confirmMessage?: string;
  danger?: boolean;
  variant?: "primary" | "outline";
};

type ModuleSummaryPayload = {
  module: string;
  provider: string;
  health: ModuleHealth;
  healthDetail?: string;
  metrics: Record<string, string | number | null>;
  providerConsoleUrl?: string;
  primaryUrl?: string;
  actions?: ModuleAction[];
  notes: string[];
};

function ModuleActionButton(props: { action: ModuleAction }) {
  const { action: a } = props;
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const isPost = a.kind === "post" && a.postPath;

  async function runPost() {
    if (a.confirmMessage && typeof window !== "undefined" && !window.confirm(a.confirmMessage)) return;
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch(a.postPath!, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(a.postBody ?? {}),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(j.error || res.statusText || "failed");
      setToast(j.message || "Done");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const btnBase =
    "btn btn-sm rounded-lg no-animation font-medium shadow-none disabled:opacity-50 " +
    (a.danger
      ? "border border-rose-500/80 bg-rose-600/90 text-white hover:border-rose-400 hover:bg-rose-500"
      : "border border-white/30 bg-transparent text-white hover:border-white/50 hover:bg-white/[0.08]");

  if (isPost) {
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className={btnBase} disabled={busy} onClick={() => void runPost()}>
          {busy ? "…" : a.label}
        </button>
        {toast ? <span className="text-xs text-slate-400">{toast}</span> : null}
      </div>
    );
  }

  if (!a.href) return null;

  return (
    <a
      href={a.href}
      className={
        "btn btn-sm rounded-lg no-animation border border-white/30 bg-transparent font-medium text-white shadow-none hover:border-white/50 hover:bg-white/[0.08]"
      }
    >
      {a.label}
    </a>
  );
}

function healthBadgeClass(health: ModuleHealth): string {
  switch (health) {
    case "healthy":
      return "badge-success";
    case "degraded":
      return "badge-warning";
    case "down":
      return "badge-error";
    default:
      return "badge-ghost";
  }
}

export function ModuleControlSurface(props: { moduleId: string }) {
  const { moduleId } = props;
  const [data, setData] = useState<ModuleSummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    (async () => {
      try {
        const res = await fetch(\`/api/modules/\${encodeURIComponent(moduleId)}\`, {
          signal: ac.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          setError(res.status === 404 ? "Unknown module" : \`HTTP \${res.status}\`);
          return;
        }
        const json = (await res.json()) as ModuleSummaryPayload;
        setData(json);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Could not load module summary");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [moduleId]);

  return (
    <section className="mb-10 max-w-5xl space-y-4" aria-label="Module control summary">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Area status</h2>
        {loading && !error ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner size="xs" />
            Loading…
          </span>
        ) : null}
      </div>
      {error ? <div className="alert alert-warning text-sm">{error}</div> : null}
      {loading && !error ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-[#141927] px-6 py-14 shadow-md">
          <LoadingSpinner size="md" />
          <p className="text-center text-sm text-slate-400">Loading area status and shortcuts…</p>
        </div>
      ) : null}
      {!loading && data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card border border-white/10 bg-[#141927] shadow-md">
            <div className="card-body gap-2 p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">{data.provider}</div>
              <h3 className="text-xl font-semibold text-white">{data.module}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    "badge badge-outline " + healthBadgeClass(data.health)
                  }
                >
                  {data.health}
                </span>
                {data.healthDetail ? (
                  <span className="text-xs text-slate-400">{data.healthDetail}</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="card border border-white/10 bg-[#141927] shadow-md">
            <div className="card-body gap-3 p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metrics</div>
              <dl className="space-y-1 text-sm">
                {Object.entries(data.metrics).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="font-mono text-slate-100">
                      {v === null || v === undefined ? "—" : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
              {data.providerConsoleUrl ? (
                <a
                  href={data.providerConsoleUrl}
                  className="btn btn-outline btn-sm mt-2 w-fit rounded-lg border-primary/40 text-primary no-animation hover:border-primary hover:bg-primary/10"
                >
                  Open provider console (advanced)
                </a>
              ) : null}
            </div>
          </div>
          {data.actions && data.actions.length > 0 ? (
            <div className="card border border-white/10 bg-[#141927] shadow-md md:col-span-2">
              <div className="card-body gap-3 p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick actions</div>
                <p className="text-xs text-slate-500">
                  Links open provider screens (advanced). POST actions call the hub API (whitelisted Docker restarts,
                  etc.) — authenticate under Settings when required.
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.actions.map((a) => (
                    <ModuleActionButton key={a.id} action={a} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {data.notes.length > 0 ? (
            <div className="card border border-white/10 bg-[#141927] shadow-md md:col-span-2">
              <div className="card-body p-5">
                <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                  {data.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
`;
}

function renderHubServiceCard(): string {
  return `"use client";

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
`;
}

function renderHubBoardPatchRoute(): string {
  return `import { readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

function boardPath() {
  return path.join(process.cwd(), "config", "board.json");
}

function validRepoUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validProjectsRegistry(x: unknown): x is { id: string; label: string; hubUrl: string; note?: string }[] {
  if (!Array.isArray(x) || x.length > 50) return false;
  for (const e of x) {
    if (!e || typeof e !== "object") return false;
    const r = e as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length < 1 || r.id.length > 64) return false;
    if (typeof r.label !== "string" || r.label.length < 1 || r.label.length > 200) return false;
    if (typeof r.hubUrl !== "string" || r.hubUrl.length > 2048) return false;
    try {
      const u = new URL(r.hubUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    } catch {
      return false;
    }
    if (r.note !== undefined && (typeof r.note !== "string" || r.note.length > 500)) return false;
  }
  return true;
}

export async function PATCH(req: Request) {
  if (process.env.HUB_BOARD_EDITABLE === "0") {
    return NextResponse.json({ error: "board edits disabled" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const hasDn = Object.prototype.hasOwnProperty.call(o, "displayName");
  const hasRu = Object.prototype.hasOwnProperty.call(o, "repositoryUrl");
  const hasPr = Object.prototype.hasOwnProperty.call(o, "projectsRegistry");
  if (!hasDn && !hasRu && !hasPr) {
    return NextResponse.json(
      { error: "expected displayName, repositoryUrl, and/or projectsRegistry" },
      { status: 400 }
    );
  }

  const gate = assertHubActionAllowed(req);
  if (gate) return gate;

  const displayName =
    hasDn && typeof o.displayName === "string" ? o.displayName.trim().slice(0, 200) : undefined;
  const repositoryUrl =
    hasRu && typeof o.repositoryUrl === "string" ? o.repositoryUrl.trim().slice(0, 2048) : undefined;
  if (repositoryUrl !== undefined && !validRepoUrl(repositoryUrl)) {
    return NextResponse.json(
      { error: "repositoryUrl must be empty or an http(s) URL" },
      { status: 400 }
    );
  }
  let projectsRegistry: { id: string; label: string; hubUrl: string; note?: string }[] | undefined;
  if (hasPr) {
    if (!validProjectsRegistry(o.projectsRegistry)) {
      return NextResponse.json(
        { error: "projectsRegistry must be an array of { id, label, hubUrl, note? } with http(s) hubUrl" },
        { status: 400 }
      );
    }
    projectsRegistry = o.projectsRegistry;
  }

  let raw: string;
  try {
    raw = await readFile(boardPath(), "utf-8");
  } catch {
    return NextResponse.json({ error: "board.json not found" }, { status: 503 });
  }
  let board: Record<string, unknown>;
  try {
    board = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid board.json" }, { status: 500 });
  }
  if (displayName !== undefined) board.displayName = displayName;
  if (repositoryUrl !== undefined) board.repositoryUrl = repositoryUrl;
  if (projectsRegistry !== undefined) board.projectsRegistry = projectsRegistry;
  const out = JSON.stringify(board, null, 2) + "\\n";
  await writeFile(boardPath(), out, "utf-8");
  await appendHubAudit(req, "patch-board", {
    displayName: displayName !== undefined,
    repositoryUrl: repositoryUrl !== undefined,
    projectsRegistry: projectsRegistry !== undefined ? projectsRegistry.length : false,
  });
  return NextResponse.json({ ok: true });
}
`;
}

function renderHubProjectSpecRoute(): string {
  return `import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";

export async function GET() {
  const board = await loadBoard();
  const exposed = process.env.HUB_SHOW_ENV_KEY_NAMES === "1";
  const envKeyNames = exposed
    ? Object.keys(process.env)
        .filter((k) => /^[A-Z_][A-Z0-9_]*$/.test(k))
        .sort()
    : [];
  return NextResponse.json({
    board,
    envKeyNames,
    envKeysExposed: exposed,
    hubSecretsPolicy: {
      actionTokenConfigured: Boolean(process.env.HUB_ACTION_TOKEN),
      sessionSecretConfigured: Boolean(process.env.HUB_SESSION_SECRET),
      readOnly: process.env.HUB_READ_ONLY === "1",
      allowUnauthenticatedActions: process.env.HUB_ALLOW_UNAUTHENTICATED_ACTIONS === "1",
    },
    hint: exposed
      ? "Only key names are listed — values are never sent to the browser."
      : "Set HUB_SHOW_ENV_KEY_NAMES=1 on the hub service to list env variable names (values stay hidden).",
  });
}
`;
}

function renderHubLogsApiRoute(): string {
  return `import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import Docker from "dockerode";
import { loadBoard } from "@/lib/load-board";

const SERVICE_SUFFIX: Record<string, string> = {
  postgres: "postgres",
  redis: "redis",
  adminer: "adminer",
  seaweedfs: "seaweedfs",
  directus: "directus",
  windmill: "windmill",
  "windmill-worker": "windmill-worker",
  app: "nextjs",
  nextjs: "nextjs",
  hub: "hub",
};

function demuxDockerLogs(buf: Buffer): string {
  let i = 0;
  let out = "";
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    if (len < 0 || i + 8 + len > buf.length) break;
    out += buf.subarray(i + 8, i + 8 + len).toString("utf8");
    i += 8 + len;
  }
  return out.length > 0 ? out : buf.toString("utf8");
}

export async function GET(req: Request) {
  const board = await loadBoard();
  const { searchParams } = new URL(req.url);
  const rawSvc = (searchParams.get("service") || "hub").toLowerCase();
  const lines = Math.min(500, Math.max(20, Number(searchParams.get("lines")) || 200));
  const suffix = SERVICE_SUFFIX[rawSvc] || rawSvc;
  const needle = (board.projectName + "-" + suffix).toLowerCase();

  const enabled = process.env.HUB_LOGS_ENABLED === "1";
  const sock = "/var/run/docker.sock";
  if (!enabled || !existsSync(sock)) {
    return NextResponse.json({
      enabled: false,
      service: rawSvc,
      hint: !enabled
        ? "HUB_LOGS_ENABLED is not set to 1 on this hub instance."
        : "Docker socket missing. Local compose templates mount /var/run/docker.sock for the hub.",
      composeExample: "docker compose logs --tail=" + lines + " " + rawSvc,
    });
  }

  try {
    const docker = new Docker({ socketPath: sock });
    const list = await docker.listContainers({ all: true });
    const c = list.find((x) =>
      (x.Names || []).some((n) => n.replace(/^\\//, "").toLowerCase().includes(needle))
    );
    if (!c) {
      return NextResponse.json({ error: "container not found", needle }, { status: 404 });
    }
    const raw = await docker.getContainer(c.Id).logs({
      stdout: true,
      stderr: true,
      tail: lines,
      timestamps: true,
    });
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
    return NextResponse.json({
      enabled: true,
      service: rawSvc,
      container: c.Names?.[0],
      lines,
      log: demuxDockerLogs(buf),
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
`;
}

function renderHubHubActionAuthTs(): string {
  return `import crypto from "node:crypto";
import { Client } from "pg";
import { NextResponse } from "next/server";

export const HUB_SESSION_COOKIE = "pb_hub_act";

export function hubSessionCookieValue(): string {
  const secret = process.env.HUB_SESSION_SECRET || "";
  const token = process.env.HUB_ACTION_TOKEN || "";
  if (!secret || !token) return "";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

export function readHubSessionCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") || "";
  const parts = raw.split(";");
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === HUB_SESSION_COOKIE) return decodeURIComponent(v);
  }
  return null;
}

/** Returns a NextResponse error when the caller may not invoke hub POST actions. */
export function assertHubActionAllowed(req: Request): NextResponse | null {
  if (process.env.HUB_READ_ONLY === "1") {
    return NextResponse.json({ error: "hub read-only" }, { status: 403 });
  }
  if (process.env.HUB_ALLOW_UNAUTHENTICATED_ACTIONS === "1") {
    return null;
  }
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") || "";
  const expectedToken = process.env.HUB_ACTION_TOKEN || "";
  if (bearer && expectedToken && bearer === expectedToken) {
    return null;
  }
  const cookieVal = readHubSessionCookie(req);
  const expected = hubSessionCookieValue();
  if (cookieVal && expected && cookieVal === expected) {
    return null;
  }
  return NextResponse.json(
    {
      error: "unauthorized",
      hint: "POST /api/auth/hub-session with { token } using HUB_ACTION_TOKEN, or send Authorization: Bearer",
    },
    { status: 401 }
  );
}

export async function appendHubAudit(req: Request, action: string, detail: Record<string, unknown>): Promise<void> {
  const db = process.env.DATABASE_URL;
  if (!db) return;
  const client = new Client({ connectionString: db });
  try {
    await client.connect();
    await client.query(\`CREATE TABLE IF NOT EXISTS ploybundle_hub_audit (
      id bigserial primary key,
      created_at timestamptz default now(),
      action text not null,
      detail jsonb,
      ip text,
      user_agent text
    )\`);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";
    await client.query(
      \`insert into ploybundle_hub_audit (action, detail, ip, user_agent) values ($1, $2::jsonb, $3, $4)\`,
      [action, JSON.stringify(detail), ip, req.headers.get("user-agent") || ""]
    );
  } catch {
    /* ignore audit failures */
  } finally {
    await client.end().catch(() => undefined);
  }
}
`;
}

function renderHubStackControlTs(): string {
  return `import { existsSync } from "node:fs";
import Docker from "dockerode";

const ALLOWED = new Set([
  "nextjs",
  "hub",
  "directus",
  "windmill",
  "windmill-worker",
  "redis",
  "postgres",
  "adminer",
  "seaweedfs",
  "vite",
]);

export async function restartComposeService(
  projectName: string,
  service: string
): Promise<{ ok: boolean; message: string }> {
  const s = service.toLowerCase().trim();
  if (!ALLOWED.has(s)) {
    return { ok: false, message: "service not on restart whitelist" };
  }
  const sock = "/var/run/docker.sock";
  if (!existsSync(sock)) {
    return { ok: false, message: "docker socket not available" };
  }
  const needle = (projectName + "-" + s).toLowerCase();
  const docker = new Docker({ socketPath: sock });
  const list = await docker.listContainers({ all: true });
  const c = list.find((x) =>
    (x.Names || []).some((n) => n.replace(/^\\//, "").toLowerCase().includes(needle))
  );
  if (!c?.Id) {
    return { ok: false, message: "container not found for " + s };
  }
  await docker.getContainer(c.Id).restart();
  return { ok: true, message: "restarted " + s };
}
`;
}

function renderHubHubSessionRoute(): string {
  return `import { NextResponse } from "next/server";
import { HUB_SESSION_COOKIE, hubSessionCookieValue } from "@/lib/hub-action-auth";

export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const expected = process.env.HUB_ACTION_TOKEN || "";
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }
  const val = hubSessionCookieValue();
  if (!val) {
    return NextResponse.json(
      { error: "HUB_SESSION_SECRET and HUB_ACTION_TOKEN must be set on the hub service" },
      { status: 503 }
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(HUB_SESSION_COOKIE, val, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
`;
}

function renderHubRestartServiceRoute(): string {
  return `import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";
import { restartComposeService } from "@/lib/stack-control";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, { n: number; t: number }>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return true;
  }
  if (h.n >= MAX_PER_WINDOW) return false;
  h.n += 1;
  return true;
}

export async function POST(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  const ip = clientIp(req);
  if (!rateOk(ip)) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  let body: { service?: string };
  try {
    body = (await req.json()) as { service?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const service = typeof body.service === "string" ? body.service.trim() : "";
  if (!service) {
    return NextResponse.json({ error: "expected service" }, { status: 400 });
  }
  const board = await loadBoard();
  const result = await restartComposeService(board.projectName, service);
  await appendHubAudit(req, "restart-service", { service, ok: result.ok, message: result.message });
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.message.includes("not found") ? 404 : 400 });
  }
  return NextResponse.json({ ok: true, message: result.message });
}
`;
}

function renderHubAuditLogRoute(): string {
  return `import { Client } from "pg";
import { NextResponse } from "next/server";
import { assertHubActionAllowed } from "@/lib/hub-action-auth";

export async function GET(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  const db = process.env.DATABASE_URL;
  if (!db) {
    return NextResponse.json({ rows: [], hint: "DATABASE_URL not set on hub" });
  }
  const client = new Client({ connectionString: db });
  try {
    await client.connect();
    const res = await client.query(
      \`select id, created_at, action, detail, ip from ploybundle_hub_audit order by id desc limit 100\`
    );
    return NextResponse.json({ rows: res.rows });
  } catch {
    return NextResponse.json({ rows: [], hint: "no audit table yet — run a POST action once to create it" });
  } finally {
    await client.end().catch(() => undefined);
  }
}
`;
}

function renderHubRequestSecretRotationRoute(): string {
  return `import { NextResponse } from "next/server";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

export async function POST(req: Request) {
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;
  let body: { key?: string };
  try {
    body = (await req.json()) as { key?: string };
  } catch {
    body = {};
  }
  const key = typeof body.key === "string" ? body.key.trim().slice(0, 120) : "";
  await appendHubAudit(req, "request-secret-rotation", { key: key || "(unspecified)" });
  return NextResponse.json({
    ok: true,
    message:
      "Rotation is server-side only. Regenerate the secret in .env / your vault, redeploy, then update dependents. Use the Ploybundle CLI secrets workflow from your project root when available.",
  });
}
`;
}

function renderHubProjectsPage(): string {
  return `import Link from "next/link";
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
`;
}

function renderHubInviteUserRoute(): string {
  return `import { NextResponse } from "next/server";
import { loadBoard } from "@/lib/load-board";
import { productDockerHostFromBoard, toHubBackendServiceUrl } from "@/lib/hub-service-urls";
import { appendHubAudit, assertHubActionAllowed } from "@/lib/hub-action-auth";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { n: number; t: number }>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function rateOk(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    return true;
  }
  if (h.n >= MAX_PER_WINDOW) return false;
  h.n += 1;
  return true;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(res.status + " " + (body?.errors?.[0]?.message || text).slice(0, 200));
  return body;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateOk(ip)) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }
  const gate = assertHubActionAllowed(req);
  if (gate) return gate;

  let body: { email?: string };
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const board = await loadBoard();
  const productDocker = productDockerHostFromBoard(board);
  const directusBase = toHubBackendServiceUrl(board.urls.admin, productDocker).replace(/\\/+$/, "");
  const adminEmail = process.env.ADMIN_EMAIL || process.env.DIRECTUS_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.DIRECTUS_ADMIN_PASSWORD;

  try {
    const login = await fetchJson(\`\${directusBase}/auth/login\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    const token = login?.data?.access_token as string | undefined;
    if (!token) throw new Error("no access token");

    const headers = { authorization: \`Bearer \${token}\`, "content-type": "application/json" };
    let roleId = process.env.DIRECTUS_INVITE_ROLE_ID?.trim();
    if (!roleId) {
      const roles = await fetchJson(\`\${directusBase}/roles?limit=-1\`, { headers });
      const list = Array.isArray(roles?.data) ? roles.data : [];
      const pick = list.find((r: { id?: string; name?: string }) => r?.name === "Editor") || list[0];
      roleId = pick?.id;
    }
    if (!roleId) throw new Error("no role id");

    const created = await fetchJson(\`\${directusBase}/users\`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, role: roleId, status: "active" }),
    });
    const id = created?.data?.id;
    await appendHubAudit(req, "invite-user", { email, id });
    return NextResponse.json({ ok: true, id, email });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
`;
}

function renderHubLogsPage(): string {
  return `"use client";

/**
 * LogsPage — Tail compose service logs via /api/logs when Docker socket is enabled.
 * Location: hub/src/app/logs/page.tsx (generated).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/loading-spinner";

const SERVICES = [
  "hub",
  "app",
  "directus",
  "postgres",
  "redis",
  "windmill",
  "windmill-worker",
  "seaweedfs",
  "adminer",
];

export default function LogsPage() {
  const [service, setService] = useState("hub");
  const [lines, setLines] = useState(200);
  const [log, setLog] = useState<string>("");
  const [meta, setMeta] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLog("");
    setMeta("");
    fetch(
      "/api/logs?service=" + encodeURIComponent(service) + "&lines=" + encodeURIComponent(String(lines)),
      { cache: "no-store" }
    )
      .then(async (r) => {
        const j = (await r.json()) as {
          enabled?: boolean;
          log?: string;
          hint?: string;
          composeExample?: string;
          error?: string;
        };
        if (cancelled) return;
        if (j.log) {
          setLog(j.log);
          setMeta("Live tail from Docker API");
        } else {
          setLog("");
          setMeta(
            (j.hint || "") +
              (j.composeExample ? "\\n\\nTry: " + j.composeExample : "")
          );
        }
      })
      .catch(() => {
        if (!cancelled) setMeta("Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service, lines]);

  return (
    <main className="flex-1 px-6 py-8 lg:px-10">
      <nav className="mb-6 text-xs text-slate-400">
        <Link href="/" className="link link-hover text-primary">
          Overview
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-300">Logs</span>
      </nav>
      <header className="mb-6 max-w-5xl">
        <h1 className="text-2xl font-semibold text-white">Logs</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Read-only log tail from running containers (local Docker). Requires the hub to run with{" "}
          <code className="text-slate-300">HUB_LOGS_ENABLED=1</code> and a mounted Docker socket.
        </p>
      </header>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="form-control w-full max-w-xs">
          <span className="label-text text-xs text-slate-400">Service</span>
          <select
            className="select select-bordered select-sm border-white/15 bg-[#141927] text-white"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control w-full max-w-[10rem]">
          <span className="label-text text-xs text-slate-400">Lines</span>
          <input
            type="number"
            className="input input-bordered input-sm border-white/15 bg-[#141927] text-white"
            min={20}
            max={500}
            value={lines}
            onChange={(e) => setLines(Number(e.target.value) || 200)}
          />
        </label>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-xs text-slate-400">
            <LoadingSpinner size="xs" />
            Loading…
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex min-h-[160px] max-w-5xl items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#141927]/80 py-10">
          <LoadingSpinner size="md" />
          <span className="text-sm text-slate-400">Fetching logs…</span>
        </div>
      ) : null}
      {!loading && meta && !log ? (
        <div className="alert alert-info max-w-5xl whitespace-pre-wrap text-sm">{meta}</div>
      ) : null}
      {!loading && log ? (
        <pre className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-slate-200">
          {log}
        </pre>
      ) : null}
    </main>
  );
}
`;
}

function renderHubSettingsPage(): string {
  return `"use client";

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
`;
}

function renderHubInviteUserForm(): string {
  return `"use client";

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
`;
}

function renderHubLoadingSpinner(): string {
  return `"use client";

/**
 * DaisyUI loading spinner for hub async UI (health pings, KPIs, module panels, logs).
 * Location: hub/src/components/loading-spinner.tsx (generated).
 */
export function LoadingSpinner(props: { className?: string; size?: "xs" | "sm" | "md" }) {
  const size = props.size ?? "sm";
  const sizeCls = size === "xs" ? "loading-xs" : size === "md" ? "loading-md" : "loading-sm";
  return (
    <span
      className={\`loading loading-spinner text-fuchsia-400 \${sizeCls} \${props.className ?? ""}\`}
      aria-label="Loading"
      role="status"
    />
  );
}
`;
}

function renderHubStatusDot(): string {
  return `"use client";

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
        const q = \`/api/ping?url=\${encodeURIComponent(pingUrl)}\`;
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
`;
}
