import { describe, it, expect } from "vitest";
import { parseAndValidateConfig, buildConfigFromFlags } from "../config/parser.js";
import { parseAndValidateAppSpec, materializeProjectConfigFromAppSpec } from "../config/app-spec-parser.js";

describe("parseAndValidateConfig", () => {
  const validInput = {
    projectName: "testproject",
    target: "lite",
    preset: "learning-app",
    domain: { root: "test.example.com" },
    ssh: { host: "1.2.3.4", port: 22, user: "root" },
    email: "admin@test.example.com",
    directus: { adminEmail: "admin@test.example.com" },
  };

  const validAppSpec = {
    version: 2 as const,
    app: {
      id: "visudev",
      name: "VisuDEV",
      archetype: "tool",
      frontend: "vite-react",
      resourceProfile: "medium",
    },
    modes: {
      local: { enabled: true },
      server: {
        enabled: true,
        target: "lite",
        ssh: { host: "1.2.3.4", user: "root", port: 22 },
        domain: { root: "visudev.example.com" },
      },
    },
    modules: {
      database: { enabled: true, provider: "postgres" },
      auth: { enabled: true, provider: "directus" },
      storage: {
        enabled: true,
        provider: "seaweedfs",
        buckets: [
          { name: "uploads", public: false },
          { name: "artifacts", public: false },
        ],
      },
      jobs: {
        enabled: true,
        provider: "windmill",
        schedules: [{ id: "nightly-sync", cron: "0 3 * * *" }],
      },
      customApis: [
        {
          id: "core",
          enabled: true,
          runtime: "node",
          framework: "hono",
          path: "services/api",
          dependsOn: ["database", "auth", "storage"],
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
      ],
      hub: { enabled: true, editableSpec: true },
    },
    product: {
      roles: ["owner", "member"],
      entities: [
        {
          id: "projects",
          sourceOfTruth: "database",
          admin: "none",
          api: "custom-api:core",
          ownership: "team",
          fields: [
            { name: "name", type: "string", required: true },
            { name: "status", type: "enum", values: ["draft", "active"] },
          ],
        },
      ],
      workflows: [
        {
          id: "build-preview",
          trigger: "api",
          executor: "worker:preview-runner",
        },
      ],
    },
    dashboard: {
      editSpec: true,
      showAreas: ["app", "auth", "workers"],
    },
  };

  it("parses a valid config", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.projectName).toBe("testproject");
    expect(config.mode).toBe("server");
    expect(config.target).toBe("lite");
    expect(config.preset).toBe("learning-app");
    expect(config.domain.root).toBe("test.example.com");
    expect(config.domain.admin).toBe("admin.test.example.com");
  });

  it("passes through optional hubPresentation", () => {
    const config = parseAndValidateConfig({
      ...validInput,
      hubPresentation: {
        displayName: "My CRM",
        repositoryUrl: "https://github.com/org/repo",
      },
    });
    expect(config.hubPresentation?.displayName).toBe("My CRM");
    expect(config.hubPresentation?.repositoryUrl).toBe("https://github.com/org/repo");
  });

  it("applies defaults for services", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.services.nextjs).toBe(true);
    expect(config.services.postgres).toBe(true);
    expect(config.services.hub).toBe(true);
    expect(config.services.adminer).toBe(false);
  });

  it("defaults frontend to nextjs", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.frontend).toBe("nextjs");
  });

  it("accepts frontend vite-react", () => {
    const config = parseAndValidateConfig({ ...validInput, frontend: "vite-react" });
    expect(config.frontend).toBe("vite-react");
  });

  it("applies default resource profile", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.resourceProfile).toBe("small");
  });

  it("applies default buckets", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.buckets).toHaveLength(1);
    expect(config.buckets[0]!.name).toBe("assets");
  });

  it("rejects invalid project names", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "INVALID" })
    ).toThrow();
  });

  it("rejects invalid project names starting with numbers", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "123abc" })
    ).toThrow();
  });

  it("rejects unknown targets", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, target: "unknown" })
    ).toThrow();
  });

  it("rejects unknown presets", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, preset: "unknown-preset" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, email: "notanemail" })
    ).toThrow();
  });

  it("rejects missing project name", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "" })
    ).toThrow();
  });

  it("resolves local mode defaults without requiring SSH target details", () => {
    const config = parseAndValidateConfig({
      projectName: "localproj",
      mode: "local",
      preset: "crud-saas",
      email: "admin@localproj.test",
      directus: { adminEmail: "admin@localproj.test" },
    });

    expect(config.mode).toBe("local");
    expect(config.target).toBeUndefined();
    expect(config.domain.root).toBe("127.0.0.1");
    expect(config.domain.app).toBe("127.0.0.1:3001");
    expect(config.ssh.host).toBe("127.0.0.1");
  });

  it("resolves mode-specific overrides from a dual-mode config", () => {
    const config = parseAndValidateConfig({
      projectName: "dualmode",
      mode: "local",
      preset: "crud-saas",
      email: "admin@dualmode.test",
      directus: { adminEmail: "admin@dualmode.test" },
      modes: {
        local: {
          domain: { app: "localhost:4001" },
        },
        server: {
          target: "full",
          ssh: { host: "10.0.0.8", user: "root" },
          domain: { root: "dualmode.example.com" },
        },
      },
    });

    expect(config.mode).toBe("local");
    expect(config.domain.app).toBe("localhost:4001");
    expect(config.target).toBeUndefined();
  });

  it("accepts an AppSpec v2 and materializes a compatible runtime config", () => {
    const config = parseAndValidateConfig(validAppSpec);

    expect(config.projectName).toBe("visudev");
    expect(config.frontend).toBe("vite-react");
    expect(config.preset).toBe("workflow-app");
    expect(config.template?.name).toBe("visudev");
    expect(config.services.directus).toBe(true);
    expect(config.services.windmill).toBe(true);
    expect(config.services.redis).toBe(true);
    expect(config.buckets.map((bucket) => bucket.name)).toEqual(["uploads", "artifacts"]);
  });

  it("materializes local mode from AppSpec v2 when requested", () => {
    const spec = parseAndValidateAppSpec(validAppSpec);
    const config = materializeProjectConfigFromAppSpec(spec, {
      mode: "local",
      projectRoot: "/tmp/visudev",
    });

    expect(config.mode).toBe("local");
    expect(config.domain.root).toBe("127.0.0.1");
    expect(config.projectRoot).toBe("/tmp/visudev");
    expect(config.email).toBe("admin@visudev.local");
  });

  it("accepts selective scaffold ids and generated module plans", () => {
    const spec = parseAndValidateAppSpec({
      ...validAppSpec,
      generation: {
        scaffoldCustomApis: false,
        scaffoldCustomApiIds: ["core"],
        scaffoldWorkers: false,
        scaffoldWorkerIds: ["preview-runner"],
        realtimeChannels: [
          {
            id: "projects",
            source: "projects",
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
              { type: "presence_join", origin: "system", schema: "json" },
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
                table: "projects",
                ownership: "team",
                tenantField: "workspace_id",
                primaryKeyField: "id",
                summary: "List projects with custom authz",
              },
            ],
          },
          {
            moduleType: "worker",
            moduleId: "preview-runner",
            template: "supabase-realtime-worker",
            tasks: [
              {
                id: "projects-fanout",
                kind: "realtime-fanout",
                source: "projects",
                channel: "projects",
                summary: "Publish project events",
              },
            ],
          },
        ],
      },
    });

    expect(spec.generation?.modulePlans).toHaveLength(2);
  });

  it("rejects invalid AppSpec combinations", () => {
    expect(() =>
      parseAndValidateAppSpec({
        ...validAppSpec,
        modules: {
          ...validAppSpec.modules,
          admin: { enabled: false, provider: "directus" },
        },
        product: {
          ...validAppSpec.product,
          entities: [
            {
              id: "records",
              sourceOfTruth: "database",
              admin: "generated",
              api: "generated",
              ownership: "team",
              fields: [{ name: "title", type: "string" }],
            },
          ],
        },
      })
    ).toThrow("Invalid app spec");
  });
});

describe("buildConfigFromFlags", () => {
  it("builds a config from CLI flags", () => {
    const config = buildConfigFromFlags({
      projectName: "myproject",
      target: "lite",
      preset: "crud-saas",
      domain: "myproject.example.com",
      host: "root@1.2.3.4",
      email: "admin@myproject.example.com",
    });

    expect(config.projectName).toBe("myproject");
    expect(config.mode).toBe("server");
    expect(config.target).toBe("lite");
    expect(config.preset).toBe("crud-saas");
    expect(config.ssh.host).toBe("1.2.3.4");
    expect(config.ssh.user).toBe("root");
  });

  it("throws on missing required flags", () => {
    expect(() => buildConfigFromFlags({})).toThrow();
    expect(() => buildConfigFromFlags({ projectName: "test" })).toThrow();
  });

  it("defaults email from domain", () => {
    const config = buildConfigFromFlags({
      projectName: "myproject",
      preset: "crud-saas",
      domain: "myproject.example.com",
      host: "root@1.2.3.4",
    });
    expect(config.email).toBe("admin@myproject.example.com");
  });
});
