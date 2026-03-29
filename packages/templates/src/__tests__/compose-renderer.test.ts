import { describe, it, expect } from "vitest";
import { renderComposeFile } from "../renderer/compose-renderer.js";
import type { AppSpecV2, ProjectConfig } from "@ploybundle/shared";

const baseConfig: ProjectConfig = {
  projectName: "testproject",
  mode: "server",
  target: "lite",
  preset: "learning-app",
  frontend: "nextjs",
  domain: {
    root: "test.example.com",
    app: "test.example.com",
    admin: "admin.test.example.com",
    storage: "storage.test.example.com",
    functions: "fn.test.example.com",
    deploy: "deploy.test.example.com",
    dashboard: "home.test.example.com",
  },
  ssh: { host: "1.2.3.4", port: 22, user: "root" },
  projectRoot: "/tmp/testproject",
  email: "admin@test.example.com",
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
  buckets: [{ name: "assets", public: false }],
  directus: { adminEmail: "admin@test.example.com" },
  windmill: { workspace: "testproject", exampleFlows: true },
  resourceProfile: "small",
  providerHint: "generic",
};

describe("renderComposeFile", () => {
  it("generates valid YAML", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toBeTruthy();
    expect(result).toContain("services:");
    expect(result).not.toMatch(/^version:\s*["']?3\.8["']?\s*$/m);
  });

  it("includes all enabled services", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("postgres:");
    expect(result).toContain("redis:");
    expect(result).toContain("directus:");
    expect(result).toContain("seaweedfs:");
    expect(result).toContain("windmill:");
    expect(result).toContain("nextjs:");
    expect(result).toContain("hub:");
    expect(result).toContain("./hub");
  });

  it("uses project name as container name prefix", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("testproject-postgres");
    expect(result).toContain("testproject-redis");
    expect(result).toContain("testproject-directus");
  });

  it("includes healthchecks for all services", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("healthcheck:");
  });

  it("includes volumes for stateful services", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("postgres_data:");
    expect(result).toContain("redis_data:");
    expect(result).toContain("seaweedfs_data:");
  });

  it("uses SeaweedFS master /cluster/healthz for docker healthcheck", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("9333/cluster/healthz");
  });

  it("mounts postgres init scripts when Windmill is enabled", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d:ro");
  });

  it("does not mount postgres init scripts when Windmill is disabled", () => {
    const config = { ...baseConfig, services: { ...baseConfig.services, windmill: false } };
    const result = renderComposeFile(config);
    expect(result).not.toContain("docker-entrypoint-initdb.d");
  });

  it("excludes disabled services", () => {
    const config = { ...baseConfig, services: { ...baseConfig.services, windmill: false } };
    const result = renderComposeFile(config);
    expect(result).not.toContain("windmill:");
  });

  it("includes network definition", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("ploybundle:");
  });

  it("includes adminer when enabled with postgres", () => {
    const config: ProjectConfig = {
      ...baseConfig,
      services: { ...baseConfig.services, adminer: true },
    };
    const result = renderComposeFile(config);
    expect(result).toContain("adminer:");
    expect(result).toContain("8088:8080");
    expect(result).toContain("ADMINER_DEFAULT_SERVER=postgres");
  });

  it("switches Next.js and hub ports for local mode", () => {
    const result = renderComposeFile({
      ...baseConfig,
      mode: "local",
      domain: {
        root: "localhost",
        scheme: "http",
        app: "localhost:3001",
        admin: "localhost:8055",
        storage: "localhost:8333",
        storageBrowser: "localhost:9333",
        functions: "localhost:8000",
        deploy: "localhost:3001",
        dashboard: "localhost:7580",
        databaseBrowser: "localhost:8088",
      },
    });

    expect(result).toContain("3001:3000");
    expect(result).toContain("7580:3000");
    expect(result).toContain("npm run dev -- --hostname 0.0.0.0 --port 3000");
    expect(result).toContain("BASE_URL=http://localhost:8000");
    expect(result).toContain("/var/run/docker.sock:/var/run/docker.sock");
    expect(result).toContain("host.docker.internal:host-gateway");
    expect(result).toContain("HUB_LOGS_ENABLED=1");
    expect(result).toContain("HUB_ALLOW_UNAUTHENTICATED_ACTIONS=1");
    expect(result).toContain("HUB_ACTION_TOKEN=${HUB_ACTION_TOKEN}");
    expect(result).toContain("HUB_SESSION_SECRET=${HUB_SESSION_SECRET}");
    expect(result).toContain("ADMIN_EMAIL=${DIRECTUS_ADMIN_EMAIL}");
    expect(result).toContain("hub:");
    expect(result).toContain("directus:");
    expect(result).toContain("condition: service_healthy");
  });

  it("pins Windmill to a release image and gives the hub stable admin env + startup order", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("ghcr.io/windmill-labs/windmill:1.659");
    expect(result).toContain("ADMIN_EMAIL=${DIRECTUS_ADMIN_EMAIL}");
    expect(result).toContain("ADMIN_PASSWORD=${DIRECTUS_ADMIN_PASSWORD}");
    const hubStart = result.indexOf("\n  hub:");
    expect(hubStart).toBeGreaterThan(0);
    const hubBlock = result.slice(hubStart, hubStart + 1400);
    expect(hubBlock).toContain("depends_on:");
    expect(hubBlock).toContain("postgres:");
    expect(hubBlock).toContain("directus:");
    expect(hubBlock).toContain("condition: service_healthy");
  });

  it("uses vite service instead of nextjs when frontend is vite-react", () => {
    const result = renderComposeFile({ ...baseConfig, frontend: "vite-react" });
    expect(result).toContain("vite:");
    expect(result).toContain("context: ./vite-app");
    expect(result).not.toContain("testproject-nextjs");
    expect(result).toContain("testproject-vite");
  });

  it("renders custom api and worker services from AppSpec v2", () => {
    const result = renderComposeFile({
      ...baseConfig,
      appSpec: {
        version: 2,
        app: {
          id: "testproject",
          name: "Test Project",
          archetype: "tool",
          frontend: "nextjs",
        },
        modes: {
          local: { enabled: true },
          server: {
            enabled: true,
            target: "lite",
            ssh: { host: "1.2.3.4", port: 22, user: "root" },
            domain: { root: "test.example.com" },
          },
        },
        modules: {
          database: { enabled: true, provider: "postgres" },
          auth: { enabled: true, provider: "directus" },
          customApis: [
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
              dependsOn: ["database"],
            },
          ],
        },
      },
    } as ProjectConfig & { appSpec?: AppSpecV2 });

    expect(result).toContain("custom-api-core:");
    expect(result).toContain("context: ./services/api");
    expect(result).toContain("4100:3000");
    expect(result).toContain("worker-preview-runner:");
    expect(result).toContain("context: ./services/preview-runner");
  });
});
