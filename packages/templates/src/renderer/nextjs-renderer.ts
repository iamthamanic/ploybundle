import type { ProjectConfig, ScaffoldBlueprint } from "@ploybundle/shared";

export function renderNextjsPackageJson(config: ProjectConfig, _preset: ScaffoldBlueprint): string {
  const pkg = {
    name: `@${config.projectName}/app`,
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start -p 3000",
      lint: "next lint",
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
    },
    devDependencies: {
      "@types/node": "^20.14.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      typescript: "^5.5.0",
    },
  };

  return JSON.stringify(pkg, null, 2);
}

export function renderNextjsConfig(config: ProjectConfig): string {
  const scheme = config.domain.scheme ?? (config.mode === "local" ? "http" : "https");
  const storageHost = config.domain.storage ?? `storage.${config.domain.root}`;
  const [hostname, port] = storageHost.split(":");

  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "${scheme}",
        hostname: "${hostname}",
        ${port ? `port: "${port}",` : ""}
      },
    ],
  },
};

module.exports = nextConfig;
`;
}

export function renderNextjsTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "es2017",
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

export function renderNextjsLayout(config: ProjectConfig, preset: ScaffoldBlueprint): string {
  return `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${preset.displayName} - ${config.projectName}",
  description: "${preset.description}",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

export function renderNextjsGlobalsCss(): string {
  return `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --foreground: #171717;
  --background: #ffffff;
  --primary: #2563eb;
  --primary-light: #3b82f6;
  --muted: #6b7280;
  --border: #e5e7eb;
  --radius: 8px;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--foreground);
  background: var(--background);
  line-height: 1.6;
}

a {
  color: var(--primary);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}
`;
}

export function renderNextjsHomePage(config: ProjectConfig, preset: ScaffoldBlueprint): string {
  const features = preset.nextjsFeatures
    .map((f) => `          <li key="${f}">${f.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</li>`)
    .join("\n");
  const runtimeLabel = config.mode === "local" ? "local" : config.target;
  const scheme = config.domain.scheme ?? (config.mode === "local" ? "http" : "https");
  const dashboardHost = config.domain.dashboard ?? `home.${config.domain.root}`;
  const hubUrl = `${scheme}://${dashboardHost}`;

  return `export default function Home() {
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      <aside
        style={{
          marginBottom: "1.75rem",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius)",
          border: "1px solid #bae6fd",
          background: "#f0f9ff",
          color: "#0c4a6e",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", marginBottom: "0.35rem" }}>Starter-Seite (Platzhalter)</strong>
        <span>
          Ploybundle hat diese Ansicht automatisch erzeugt, damit der App-Container eine funktionierende Route hat.
          Das ist <strong>noch keine</strong> fertige Produkt-Oberfläche — baue dein echtes Frontend z.&nbsp;B. in{" "}
          <code style={{ fontSize: "0.9em", background: "#e0f2fe", padding: "0.15rem 0.35rem", borderRadius: 4 }}>
            src/app/page.tsx
          </code>
          .
        </span>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.95rem" }}>
          <a href="${hubUrl}" style={{ fontWeight: 600 }}>
            Zum Projekt-Hub
          </a>
          {" "}
          (Directus, Windmill, Datenbank, …)
        </p>
      </aside>

      <h1>${preset.displayName}</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>
        ${preset.description}
      </p>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Project: ${config.projectName}</h2>
        <p>Preset: ${preset.name} | Runtime: ${runtimeLabel}</p>
      </section>

      <section style={{ marginBottom: "2rem" }}>
        <h2>Geplante Bausteine (Preset)</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
          Orientierung aus der Vorlage — noch nicht als fertige Screens umgesetzt.
        </p>
        <ul style={{ paddingLeft: "1.5rem" }}>
${features}
        </ul>
      </section>

      <section>
        <h2>Technik</h2>
        <ul style={{ paddingLeft: "1.5rem" }}>
          <li><a href="/api/health">Health Check API</a></li>
        </ul>
      </section>
    </main>
  );
}
`;
}

export function renderNextjsHealthRoute(): string {
  return `import { NextResponse } from "next/server";

export async function GET() {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  };

  return NextResponse.json(health);
}
`;
}

export function renderNextjsEnvLocal(config: ProjectConfig): string {
  const scheme = config.domain.scheme ?? (config.mode === "local" ? "http" : "https");
  const appUrl = `${scheme}://${config.domain.app ?? config.domain.root}`;
  const adminUrl = `${scheme}://${config.domain.admin ?? `admin.${config.domain.root}`}`;
  const storageUrl = `${scheme}://${config.domain.storage ?? `storage.${config.domain.root}`}`;

  return `# Auto-generated by ploybundle - do not edit directly
# Use ploybundle.yaml to manage configuration

# App
NEXT_PUBLIC_APP_URL=${appUrl}
NEXT_PUBLIC_API_URL=${appUrl}/api

# Directus
NEXT_PUBLIC_DIRECTUS_URL=${adminUrl}
DIRECTUS_URL=http://directus:8055
DIRECTUS_TOKEN=\${DIRECTUS_ADMIN_TOKEN}

# Storage
NEXT_PUBLIC_STORAGE_URL=${storageUrl}

# Auth
NEXTAUTH_URL=${appUrl}
NEXTAUTH_SECRET=\${NEXTAUTH_SECRET}

# Database
DATABASE_URL=\${DATABASE_URL}

# Redis
REDIS_URL=\${REDIS_URL}
`;
}
