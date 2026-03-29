import type { ProjectConfig, ScaffoldBlueprint } from "@ploybundle/shared";
import { buildProjectUrls } from "@ploybundle/shared";

export function renderVitePackageJson(config: ProjectConfig, _preset: ScaffoldBlueprint): string {
  const pkg = {
    name: `@${config.projectName}/vite-app`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0 --port 5173",
      build: "vite build",
      preview: "vite preview --host 0.0.0.0 --port 3000",
      lint: "echo 'add eslint when needed'",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
    },
    devDependencies: {
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.0",
      typescript: "^5.5.0",
      vite: "^5.4.0",
    },
  };
  return JSON.stringify(pkg, null, 2);
}

export function renderViteTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["src", "vite.config.ts"],
    },
    null,
    2
  );
}

export function renderViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
});
`;
}

export function renderViteIndexHtml(config: ProjectConfig, preset: ScaffoldBlueprint): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${preset.displayName} — ${config.projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function renderViteMainTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
}

export function renderViteIndexCss(): string {
  return `:root {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  color: #e2e8f0;
  background: #0f172a;
}
body {
  margin: 0;
  min-height: 100vh;
}
`;
}

export function renderViteAppTsx(config: ProjectConfig, preset: ScaffoldBlueprint): string {
  const directus = buildProjectUrls(config.domain).admin;
  const title = JSON.stringify(preset.displayName);
  const desc = JSON.stringify(preset.description);
  const presetId = JSON.stringify(preset.name);
  const projectId = JSON.stringify(config.projectName);
  const adminUrl = JSON.stringify(directus);
  return `export default function App() {
  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>{${title}}</h1>
      <p style={{ color: "#94a3b8" }}>{${desc}}</p>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Stack: <strong>{${presetId}}</strong> · React + Vite · project <code>{${projectId}}</code>
      </p>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Wire this SPA to Directus REST/GraphQL at{" "}
        <a href={${adminUrl}} style={{ color: "#38bdf8" }}>
          {${adminUrl}}
        </a>
        . Use <code>import.meta.env.VITE_DIRECTUS_URL</code> from Vite env (see <code>.env.local</code>).
      </p>
    </main>
  );
}
`;
}

export function renderViteEnvDts(): string {
  return `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DIRECTUS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`;
}

/** Local/dev: browser-reachable Directus URL for the Vite app. */
export function renderViteEnvLocal(config: ProjectConfig): string {
  const urls = buildProjectUrls(config.domain);
  return `# Vite client env (VITE_* are exposed to the browser)
VITE_DIRECTUS_URL=${urls.admin}
`;
}

export function renderViteDockerfile(): string {
  return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache wget
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
`;
}

export function renderViteNginxDefaultConf(): string {
  return `server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    location = /api/health {
        default_type text/plain;
        return 200 'ok';
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
}

export function renderViteDockerIgnore(): string {
  return `node_modules
.next
dist
.git
*.log
.env.local
`;
}
