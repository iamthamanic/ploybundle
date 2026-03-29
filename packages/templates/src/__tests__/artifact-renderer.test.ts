import { describe, it, expect } from "vitest";
import { StackArtifactRenderer } from "../renderer/artifact-renderer.js";
import type { AppSpecV2, ProjectConfig } from "@ploybundle/shared";

const config: ProjectConfig = {
  projectName: "questolin",
  mode: "server",
  target: "lite",
  preset: "learning-app",
  frontend: "nextjs",
  domain: {
    root: "questolin.example.com",
    app: "questolin.example.com",
    admin: "admin.questolin.example.com",
    storage: "storage.questolin.example.com",
    functions: "fn.questolin.example.com",
    deploy: "deploy.questolin.example.com",
    dashboard: "home.questolin.example.com",
  },
  ssh: { host: "1.2.3.4", port: 22, user: "root" },
  projectRoot: "/tmp/questolin",
  email: "admin@questolin.example.com",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    hub: true,
    adminer: false,
  },
  buckets: [
    { name: "assets", public: true },
    { name: "missions", public: false },
    { name: "uploads", public: false },
  ],
  directus: { adminEmail: "admin@questolin.example.com" },
  windmill: { workspace: "questolin", exampleFlows: true },
  resourceProfile: "small",
  providerHint: "hetzner",
};

const env: Record<string, string> = {
  POSTGRES_USER: "questolin",
  POSTGRES_PASSWORD: "testpass",
  POSTGRES_DB: "questolin",
  REDIS_PASSWORD: "redispass",
  DIRECTUS_SECRET: "directussecret",
  DIRECTUS_ADMIN_EMAIL: "admin@questolin.example.com",
  DIRECTUS_ADMIN_PASSWORD: "adminpass",
  SEAWEEDFS_ACCESS_KEY: "accesskey",
  SEAWEEDFS_SECRET_KEY: "secretkey",
  WINDMILL_SECRET: "windmillsecret",
  DATABASE_URL: "postgresql://questolin:testpass@postgres:5432/questolin",
  REDIS_URL: "redis://:redispass@redis:6379",
  WINDMILL_DATABASE_URL: "postgresql://questolin:testpass@postgres:5432/questolin_windmill",
  NEXTAUTH_SECRET: "nextauthsecret",
  APP_SESSION_SECRET: "appsessionsecret",
  NEXTAUTH_URL: "https://questolin.example.com",
  PROJECT_NAME: "questolin",
  NODE_ENV: "production",
};

describe("StackArtifactRenderer", () => {
  const renderer = new StackArtifactRenderer();

  it("renders all artifact types", () => {
    const artifacts = renderer.render(config, env);

    expect(artifacts.composeFile).toBeTruthy();
    expect(artifacts.envFiles).toBeTruthy();
    expect(artifacts.configs).toBeTruthy();
    expect(artifacts.hubConfig).toBeTruthy();
    expect(artifacts.metadata).toBeTruthy();
  });

  it("includes docker-compose content", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.composeFile).toContain("postgres");
    expect(artifacts.composeFile).toContain("directus");
  });

  it("includes .env file", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.envFiles[".env"]).toBeTruthy();
    expect(artifacts.envFiles[".env"]).toContain("POSTGRES_USER");
  });

  it("includes seaweedfs config", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["seaweedfs/s3.json"]).toBeTruthy();
    expect(artifacts.configs["seaweedfs/s3.json"]).toContain("accesskey");
  });

  it("includes directus configs", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["directus/.env"]).toBeTruthy();
    expect(artifacts.configs["scripts/bootstrap-directus.sh"]).toBeTruthy();
  });

  it("includes windmill bootstrap script", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["scripts/bootstrap-windmill.sh"]).toBeTruthy();
    expect(artifacts.configs["scripts/bootstrap-windmill.sh"]).toContain("questolin");
  });

  it("includes postgres init SQL for Windmill database", () => {
    const artifacts = renderer.render(config, env);
    const sql = artifacts.configs["scripts/docker-entrypoint-initdb.d/01-windmill-database.sql"];
    expect(sql).toBeTruthy();
    expect(sql).toContain("CREATE DATABASE");
    expect(sql).toContain("questolin_windmill");
  });

  it("includes nextjs app scaffold", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["app/package.json"]).toBeTruthy();
    expect(artifacts.configs["app/src/app/page.tsx"]).toBeTruthy();
    expect(artifacts.configs["app/src/app/page.tsx"]).toContain("Starter-Seite (Platzhalter)");
    expect(artifacts.configs["app/src/app/api/health/route.ts"]).toBeTruthy();
  });

  it("includes Ploybundle Hub (Next.js) scaffold and board config", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["hub/config/board.json"]).toBeTruthy();
    expect(artifacts.configs["hub/package.json"]).toBeTruthy();
    expect(artifacts.configs["hub/Dockerfile"]).toBeTruthy();
    expect(artifacts.configs["hub/src/app/page.tsx"]).toBeTruthy();
    expect(artifacts.configs["hub/src/app/layout.tsx"]).toContain("HubSidebar");
    expect(artifacts.configs["hub/src/app/[categoryId]/page.tsx"]).toBeTruthy();
    expect(artifacts.configs["hub/src/app/api/ping/route.ts"]).toContain("allowedUrlPrefixes");
    expect(artifacts.configs["hub/src/app/api/ping/route.ts"]).toContain("toHubBackendServiceUrl");
    expect(artifacts.configs["hub/src/components/loading-spinner.tsx"]).toContain("LoadingSpinner");
    expect(artifacts.configs["hub/src/components/service-card.tsx"]).toBeTruthy();
    expect(artifacts.configs["hub/src/lib/hub-service-urls.ts"]).toContain("toHubBackendServiceUrl");
    expect(artifacts.configs["hub/src/lib/hub-service-urls.ts"]).toContain("toDeployProbeUrl");
    expect(artifacts.configs["hub/src/app/api/overview/route.ts"]).toContain("hub-service-urls");
    expect(artifacts.configs["hub/src/app/api/modules/[id]/route.ts"]).toContain("MODULE_IDS");
    expect(artifacts.configs["hub/src/app/api/modules/[id]/route.ts"]).toContain("directusAccessToken");
    expect(artifacts.configs["hub/src/app/api/modules/[id]/route.ts"]).toContain("ModuleAction");
    expect(artifacts.configs["hub/src/app/api/project-spec/route.ts"]).toContain("loadBoard");
    expect(artifacts.configs["hub/src/app/api/logs/route.ts"]).toContain("dockerode");
    expect(artifacts.configs["hub/src/app/api/actions/invite-user/route.ts"]).toContain("/auth/login");
    expect(artifacts.configs["hub/src/app/logs/page.tsx"]).toContain("Logs");
    expect(artifacts.configs["hub/src/app/settings/page.tsx"]).toContain("Effective board");
    expect(artifacts.configs["hub/src/lib/hub-action-auth.ts"]).toContain("assertHubActionAllowed");
    expect(artifacts.configs["hub/src/lib/stack-control.ts"]).toContain("restartComposeService");
    expect(artifacts.configs["hub/src/app/api/auth/hub-session/route.ts"]).toContain("hubSessionCookieValue");
    expect(artifacts.configs["hub/src/app/api/actions/restart-service/route.ts"]).toContain("restartComposeService");
    expect(artifacts.configs["hub/src/app/projects/page.tsx"]).toContain("projectsRegistry");
    expect(artifacts.configs["hub/src/components/invite-user-form.tsx"]).toContain("InviteUserForm");
    expect(artifacts.configs["hub/src/components/module-control-surface.tsx"]).toContain(
      "ModuleControlSurface"
    );
    const categoryPage = artifacts.configs["hub/src/app/[categoryId]/page.tsx"];
    expect(categoryPage).toContain("ModuleControlSurface");
    expect(categoryPage).toContain("InviteUserForm");
    expect(categoryPage).toContain("Provider consoles (advanced)");
    expect(artifacts.configs["hub/src/app/layout.tsx"]).toContain("Ploybundle control plane");
    expect(artifacts.configs["hub/src/app/api/board/route.ts"]).toContain("projectsRegistry");
    expect(artifacts.configs["hub/src/app/api/board/route.ts"]).toContain("PATCH");
    const hubOverview = artifacts.configs["hub/src/app/page.tsx"];
    expect(hubOverview).toContain("APP LOCAL URL");
    expect(hubOverview).toContain("APP SERVER PROD URL");
    expect(hubOverview).toContain("APP SERVER TEST URL");
    expect(hubOverview).toContain("productDeploymentUrls");
    expect(hubOverview).toContain("Control plane areas");
    expect(hubOverview).toContain("Provider consoles (advanced)");
    expect(hubOverview).toContain("isExternalHubHref");
    expect(artifacts.configs["hub/src/components/module-control-surface.tsx"]).toContain(
      "Open provider console (advanced)"
    );
    expect(artifacts.configs["hub/src/components/module-control-surface.tsx"]).toContain("Quick actions");
  });

  it("renders hub board with resolved URLs", () => {
    const artifacts = renderer.render(config, env);
    const boardJson = artifacts.configs["hub/config/board.json"];
    expect(boardJson).toContain('"projectName": "questolin"');
    expect(boardJson).toContain('"title": "Ploybundle"');
    expect(boardJson).toContain('"preset": "learning-app"');
    expect(boardJson).toContain('"target":');
    expect(boardJson).toContain('"bucketCount":');
    expect(boardJson).toContain('"productFrontend": "nextjs"');
    expect(boardJson).toContain('"productDeploymentUrls"');
    expect(boardJson).toContain('"serverProd"');
    expect(boardJson).toContain("admin.questolin.example.com");
    expect(boardJson).not.toContain("{{urls.");
  });

  it("merges hub board into hubConfig artifact", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.hubConfig).toContain("admin.questolin.example.com");
    expect(artifacts.hubConfig).not.toContain("{{urls.");
  });

  it("includes project metadata", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.metadata.projectName).toBe("questolin");
    expect(artifacts.metadata.target).toBe("lite");
    expect(artifacts.metadata.preset).toBe("learning-app");
    expect(artifacts.metadata.frontend).toBe("nextjs");
  });

  it("renders vite-app scaffold when frontend is vite-react", () => {
    const viteConfig = { ...config, frontend: "vite-react" as const };
    const artifacts = renderer.render(viteConfig, env);
    expect(artifacts.configs["vite-app/package.json"]).toBeTruthy();
    expect(artifacts.configs["vite-app/Dockerfile"]).toContain("nginx");
    expect(artifacts.configs["vite-app/nginx/default.conf"]).toContain("/api/health");
    expect(artifacts.configs["app/package.json"]).toBeUndefined();
    expect(artifacts.composeFile).toContain("vite:");
    expect(artifacts.composeFile).toContain("vite-app");
  });

  it("prefers a generated template blueprint when present", () => {
    const specBackedConfig: ProjectConfig & { appSpec?: AppSpecV2 } = {
      ...config,
      template: {
        name: "visudev",
        displayName: "VisuDEV",
        description: "Tool blueprint generated from AppSpec v2",
        buckets: [{ name: "artifacts", public: false }],
        directusCollections: [],
        windmillFlows: [],
        envDefaults: { PLOYBUNDLE_APP_SPEC_VERSION: "2" },
        nextjsFeatures: ["custom-api", "workers"],
      },
      appSpec: {
        version: 2,
        app: {
          id: "visudev",
          name: "VisuDEV",
          archetype: "tool",
          frontend: "nextjs",
        },
        modes: {
          local: { enabled: true },
          server: {
            enabled: true,
            target: "lite",
            ssh: { host: "1.2.3.4", port: 22, user: "root" },
            domain: { root: "visudev.example.com" },
          },
        },
        modules: {
          database: { enabled: true, provider: "postgres" },
          auth: { enabled: true, provider: "directus" },
          customApis: [
            {
              id: "hello",
              enabled: true,
              runtime: "deno",
              framework: "none",
              path: "supabase/functions/hello",
              dependsOn: ["database"],
            },
            {
              id: "core",
              enabled: true,
              runtime: "node",
              framework: "hono",
              path: "services/api",
              dependsOn: ["database", "auth"],
            },
          ],
          workers: [
            {
              id: "preview-runner",
              enabled: true,
              runtime: "node",
              kind: "long-running",
              path: "services/preview-runner",
              dependsOn: ["storage"],
            },
            {
              id: "realtime-events",
              enabled: true,
              runtime: "node",
              kind: "background",
              path: "workers/realtime-events",
              dependsOn: ["database", "auth"],
            },
          ],
        },
        generation: {
          scaffoldCustomApis: false,
          scaffoldCustomApiIds: ["core"],
          scaffoldWorkers: false,
          scaffoldWorkerIds: ["realtime-events"],
          realtimeChannels: [
            {
              id: "project-feed",
              source: "project-feed",
              transport: "hybrid",
              subscribeAcl: "team",
              publishAcl: "service",
              ownership: "team",
              tenantField: "workspace_id",
              presence: {
                enabled: true,
                scope: "workspace",
                fields: ["user_id", "workspace_id", "transport"],
              },
              events: [
                { type: "message", origin: "service", schema: "json" },
                { type: "connected", origin: "system", schema: "json" },
                { type: "heartbeat", origin: "system", schema: "json" },
                { type: "pong", origin: "system", schema: "json" },
                { type: "presence_join", origin: "system", schema: "json" },
                { type: "presence_leave", origin: "system", schema: "json" },
                { type: "presence_snapshot", origin: "system", schema: "json" },
                { type: "fanout", origin: "worker", schema: "json" },
              ],
            },
          ],
          modulePlans: [
            {
              moduleType: "custom-api",
              moduleId: "core",
              template: "supabase-core-api",
              routes: [
                {
                  id: "projects-list",
                  kind: "authz-crud",
                  method: "get",
                  path: "/internal/projects",
                  summary: "List projects with migrated authorization checks",
                  table: "projects",
                  accessTarget: "custom-api-authz",
                },
                {
                  id: "project-feed-stream",
                  kind: "realtime-sse",
                  method: "get",
                  path: "/realtime/project-feed/stream",
                  channel: "project-feed",
                  summary: "Realtime delivery stub for project-feed",
                },
              ],
            },
            {
              moduleType: "worker",
              moduleId: "realtime-events",
              template: "supabase-realtime-worker",
              tasks: [
                {
                  id: "projects-fanout",
                  kind: "realtime-fanout",
                  source: "projects",
                  channel: "project-feed",
                  summary: "Fan out realtime events for projects",
                },
              ],
            },
          ],
        },
      },
    };

    const artifacts = renderer.render(specBackedConfig, env);
    expect(artifacts.configs["app/src/app/page.tsx"]).toContain("VisuDEV");
    expect(artifacts.metadata.preset).toBe("visudev");
    expect(artifacts.hubConfig).toContain('"preset": "visudev"');
    expect(artifacts.configs["supabase/functions/hello/main.ts"]).toBeUndefined();
    expect(artifacts.configs["services/api/package.json"]).toBeTruthy();
    expect(artifacts.configs["services/api/package.json"]).toContain('"jose"');
    expect(artifacts.configs["services/api/package.json"]).toContain('"ws"');
    expect(artifacts.configs["services/api/src/index.js"]).toContain("attachWebSocketServer");
    expect(artifacts.configs["services/api/src/index.js"]).toContain("configureRealtime(channelSpecs)");
    expect(artifacts.configs["services/api/src/plans.js"]).toContain('"projects-list"');
    expect(artifacts.configs["services/api/src/plans.js"]).toContain('"project-feed"');
    expect(artifacts.configs["services/api/src/lib/db.js"]).toContain("new Pool");
    expect(artifacts.configs["services/api/src/lib/auth.js"]).toContain("authenticateWebSocketRequest");
    expect(artifacts.configs["services/api/src/lib/auth.js"]).toContain("PLOYBUNDLE_INTERNAL_TOKEN");
    expect(artifacts.configs["services/api/src/lib/realtime.js"]).toContain("WebSocketServer");
    expect(artifacts.configs["services/api/src/lib/realtime.js"]).toContain("validateChannelAccess");
    expect(artifacts.configs["services/api/src/lib/realtime.js"]).toContain('"presence_snapshot"');
    expect(artifacts.configs["services/api/src/routes/authz.js"]).toContain("handleList");
    expect(artifacts.configs["services/api/src/routes/realtime.js"]).toContain("Upgrade this endpoint with WebSocket");
    expect(artifacts.configs["services/api/src/routes/realtime.js"]).toContain("validateChannelAccess");
    expect(artifacts.configs["services/preview-runner/src/index.js"]).toBeUndefined();
    expect(artifacts.configs["workers/realtime-events/src/index.js"]).toContain("describeTasks");
    expect(artifacts.configs["workers/realtime-events/src/plans.js"]).toContain('"projects-fanout"');
    expect(artifacts.configs["workers/realtime-events/src/plans.js"]).toContain('"project-feed"');
    expect(artifacts.configs["workers/realtime-events/src/handlers.js"]).toContain("x-ploybundle-service");
    expect(artifacts.configs["workers/realtime-events/src/handlers.js"]).toContain("eventType");
  });
});
