import { describe, it, expect } from "vitest";
import { renderComposeFile } from "../renderer/compose-renderer.js";
import type { ProjectConfig } from "@ploybundle/shared";

const baseConfig: ProjectConfig = {
  projectName: "testproject",
  target: "lite",
  preset: "learning-app",
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
  email: "admin@test.example.com",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    homarr: true,
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
  });

  it("includes all enabled services", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("postgres:");
    expect(result).toContain("redis:");
    expect(result).toContain("directus:");
    expect(result).toContain("seaweedfs:");
    expect(result).toContain("windmill:");
    expect(result).toContain("nextjs:");
    expect(result).toContain("homarr:");
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

  it("excludes disabled services", () => {
    const config = { ...baseConfig, services: { ...baseConfig.services, windmill: false } };
    const result = renderComposeFile(config);
    expect(result).not.toContain("windmill:");
  });

  it("includes network definition", () => {
    const result = renderComposeFile(baseConfig);
    expect(result).toContain("ploybundle:");
  });
});
