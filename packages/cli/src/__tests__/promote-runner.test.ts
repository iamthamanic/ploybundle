import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DeployResult, GeneratedSecrets, ProjectConfig } from "@ploybundle/shared";
import { ConfigError } from "@ploybundle/shared";
import {
  PromoteRunner,
  collectPromoteBuckets,
  getDatabaseDependentComposeServices,
  rewriteLocalStorageEndpointForDocker,
} from "../promote-runner.js";

function createConfig(mode: "local" | "server", projectRoot: string): ProjectConfig {
  return {
    projectName: "demo",
    mode,
    target: mode === "server" ? "lite" : undefined,
    preset: "crud-saas",
    frontend: "nextjs",
    domain: mode === "local"
      ? {
          root: "localhost",
          app: "localhost:3001",
          admin: "localhost:8055",
          storage: "localhost:8333",
          storageBrowser: "localhost:9333",
          functions: "localhost:8000",
          deploy: "localhost:3001",
          dashboard: "localhost:7580",
          databaseBrowser: "localhost:8088",
          scheme: "http",
        }
      : {
          root: "demo.example.com",
          app: "demo.example.com",
          admin: "admin.demo.example.com",
          storage: "storage.demo.example.com",
          storageBrowser: "storage.demo.example.com",
          functions: "fn.demo.example.com",
          deploy: "deploy.demo.example.com",
          dashboard: "home.demo.example.com",
          scheme: "https",
        },
    ssh: mode === "local"
      ? { host: "127.0.0.1", port: 22, user: "root" }
      : { host: "1.2.3.4", port: 22, user: "root" },
    projectRoot,
    email: "admin@example.com",
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
    buckets: [{ name: "assets", public: false }, { name: "media", public: true }],
    directus: { adminEmail: "admin@example.com" },
    windmill: { workspace: "main", exampleFlows: true },
    resourceProfile: "small",
    providerHint: "generic",
  };
}

function createSecrets(): GeneratedSecrets {
  return {
    postgresPassword: "pg-pass",
    redisPassword: "redis-pass",
    directusSecret: "directus-secret",
    directusAdminPassword: "admin-pass",
    internalServiceToken: "internal-service-token",
    seaweedfsAccessKey: "seaweed-access",
    seaweedfsSecretKey: "seaweed-secret",
    windmillSecret: "windmill-secret",
    appSessionSecret: "app-secret",
    nextauthSecret: "nextauth-secret",
  };
}

describe("promote helpers", () => {
  it("rewrites localhost storage endpoints for dockerized helpers", () => {
    expect(rewriteLocalStorageEndpointForDocker("http://localhost:8333")).toBe("http://host.docker.internal:8333/");
    expect(rewriteLocalStorageEndpointForDocker("https://storage.example.com")).toBe("https://storage.example.com/");
  });

  it("collects unique buckets including directus when needed", () => {
    const localConfig = createConfig("local", "/tmp/ploybundle-promote-test");
    const serverConfig = createConfig("server", "/tmp/ploybundle-promote-test");

    expect(collectPromoteBuckets(localConfig, serverConfig)).toEqual(["assets", "directus", "media"]);
  });

  it("builds a compose stop list for db-dependent services", () => {
    const config = createConfig("server", "/tmp/ploybundle-promote-test");

    expect(getDatabaseDependentComposeServices(config)).toEqual([
      "nextjs",
      "directus",
      "windmill",
      "hub",
      "adminer",
    ]);
  });
});

describe("PromoteRunner", () => {
  it("rejects if nothing is left to do", async () => {
    const runner = new PromoteRunner();
    const localConfig = createConfig("local", "/tmp/ploybundle-promote-test");
    const serverConfig = createConfig("server", "/tmp/ploybundle-promote-test");

    await expect(
      runner.run(localConfig, serverConfig, { skipDeploy: true, skipDb: true, skipStorage: true })
    ).rejects.toThrow(ConfigError);
  });

  it("runs deploy, database, and storage phases through injected dependencies", async () => {
    const projectRoot = path.join("/tmp", `ploybundle-promote-test-${Date.now()}`);
    const localConfig = createConfig("local", projectRoot);
    const serverConfig = createConfig("server", projectRoot);
    const secrets = createSecrets();
    const deployServer = vi.fn<(_: ProjectConfig) => Promise<DeployResult>>().mockResolvedValue({
      success: true,
      phases: [],
    });
    const dumpLocalDatabase = vi.fn<(_: ProjectConfig, __: string) => Promise<void>>().mockResolvedValue();
    const mirrorStorage = vi.fn<() => Promise<void>>().mockResolvedValue();
    const ssh = {
      exec: vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 }),
      uploadFile: vi.fn().mockResolvedValue(undefined),
    };
    const secretsManager = {
      loadOrGenerateLocal: vi.fn().mockReturnValue({ secrets, isNew: false }),
      loadOrGenerate: vi.fn().mockResolvedValue({ secrets, isNew: false }),
    };

    const runner = new PromoteRunner(
      {},
      {
        deployServer,
        dumpLocalDatabase,
        mirrorStorage,
        ssh,
        secretsManager,
      }
    );

    mkdirSync(path.join(projectRoot, ".ploybundle-state", "local", "stack"), { recursive: true });

    try {
      const result = await runner.run(localConfig, serverConfig);

      expect(result.success).toBe(true);
      expect(deployServer).toHaveBeenCalledWith(serverConfig, expect.any(Object));
      expect(dumpLocalDatabase).toHaveBeenCalledTimes(1);
      expect(ssh.uploadFile).toHaveBeenCalledTimes(1);
      expect(mirrorStorage).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
