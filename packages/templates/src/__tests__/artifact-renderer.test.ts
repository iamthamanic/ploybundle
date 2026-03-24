import { describe, it, expect } from "vitest";
import { StackArtifactRenderer } from "../renderer/artifact-renderer.js";
import type { ProjectConfig } from "@ploybundle/shared";

const config: ProjectConfig = {
  projectName: "questolin",
  target: "lite",
  preset: "learning-app",
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
  email: "admin@questolin.example.com",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    homarr: true,
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
  WINDMILL_DATABASE_URL: "postgresql://questolin:testpass@postgres:5432/questolin",
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
    expect(artifacts.homarrConfig).toBeTruthy();
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

  it("includes nextjs app scaffold", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["app/package.json"]).toBeTruthy();
    expect(artifacts.configs["app/src/app/page.tsx"]).toBeTruthy();
    expect(artifacts.configs["app/src/app/api/health/route.ts"]).toBeTruthy();
  });

  it("includes homarr config files", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.configs["homarr/seed/board-model.json"]).toBeTruthy();
    expect(artifacts.configs["scripts/bootstrap-homarr.sh"]).toBeTruthy();
  });

  it("includes project metadata", () => {
    const artifacts = renderer.render(config, env);
    expect(artifacts.metadata.projectName).toBe("questolin");
    expect(artifacts.metadata.target).toBe("lite");
    expect(artifacts.metadata.preset).toBe("learning-app");
  });
});
