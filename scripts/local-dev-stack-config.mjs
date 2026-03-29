/**
 * Single source of truth for the local-dev reference stack (ports + preset).
 * Used by materialize-local-stack.mjs and sync-local-dev-hub.mjs.
 *
 * URLs (host, 127.0.0.1): App :3001, Directus :8055, Windmill :8000, Seaweed S3 :8333 / UI :9333, Adminer :8088, Hub :7580
 */
export function getLocalDevStackConfig() {
  const projectName = "localdev";
  return {
    projectName,
    mode: "local",
    projectRoot: ".",
    target: "lite",
    /** `vite-react` → vite-app/ + compose service `vite` instead of Next `app/`. */
    frontend: "nextjs",
    /** Neutral baseline: generic tenant/data shape, not a domain-specific demo. */
    preset: "crud-saas",
    domain: {
      root: "127.0.0.1",
      scheme: "http",
      app: "127.0.0.1:3001",
      admin: "127.0.0.1:8055",
      /** S3 API — not a normal website; hub links the browser UI below. */
      storage: "127.0.0.1:8333",
      /** SeaweedFS master HTML UI (docker maps 9333). */
      storageBrowser: "127.0.0.1:9333",
      functions: "127.0.0.1:8000",
      /** Local “deploy” surface: runnable app (compose service nextjs). */
      deploy: "127.0.0.1:3001",
      dashboard: "127.0.0.1:7580",
      databaseBrowser: "127.0.0.1:8088",
    },
    ssh: { host: "127.0.0.1", port: 22, user: "root" },
    email: `admin@${projectName}.com`,
    services: {
      nextjs: true,
      postgres: true,
      redis: true,
      directus: true,
      seaweedfs: true,
      windmill: true,
      hub: true,
      adminer: true,
    },
    buckets: [
      { name: "uploads", public: false },
      { name: "exports", public: false },
    ],
    directus: { adminEmail: `admin@${projectName}.com` },
    windmill: { workspace: projectName, exampleFlows: true },
    resourceProfile: "small",
    providerHint: "generic",
    hubPresentation: {
      displayName: "Local dev",
      repositoryUrl: "",
    },
  };
}
