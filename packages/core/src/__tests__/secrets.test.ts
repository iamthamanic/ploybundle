import { describe, it, expect } from "vitest";
import { SecretsManager } from "../secrets/secrets-manager.js";
import { SshService } from "../ssh/ssh-service.js";

describe("SecretsManager", () => {
  const manager = new SecretsManager(new SshService());

  describe("generate", () => {
    it("generates all required secrets", () => {
      const secrets = manager.generate();

      expect(secrets.postgresPassword).toBeTruthy();
      expect(secrets.redisPassword).toBeTruthy();
      expect(secrets.directusSecret).toBeTruthy();
      expect(secrets.directusAdminPassword).toBeTruthy();
      expect(secrets.seaweedfsAccessKey).toBeTruthy();
      expect(secrets.seaweedfsSecretKey).toBeTruthy();
      expect(secrets.windmillSecret).toBeTruthy();
      expect(secrets.appSessionSecret).toBeTruthy();
      expect(secrets.nextauthSecret).toBeTruthy();
    });

    it("generates unique secrets each time", () => {
      const a = manager.generate();
      const b = manager.generate();

      expect(a.postgresPassword).not.toBe(b.postgresPassword);
      expect(a.directusSecret).not.toBe(b.directusSecret);
    });

    it("generates secrets of appropriate length", () => {
      const secrets = manager.generate();

      expect(secrets.postgresPassword.length).toBeGreaterThanOrEqual(20);
      expect(secrets.directusSecret.length).toBeGreaterThanOrEqual(32);
      expect(secrets.seaweedfsAccessKey.length).toBeGreaterThanOrEqual(16);
      expect(secrets.seaweedfsSecretKey.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("metadata", () => {
    it("generates metadata with timestamp", () => {
      const meta = manager.metadata();
      expect(meta.generated).toBe(true);
      expect(meta.generatedAt).toBeTruthy();
      expect(new Date(meta.generatedAt).getTime()).not.toBeNaN();
    });
  });

  describe("buildEnvMap", () => {
    it("builds a complete env map from secrets and config", () => {
      const secrets = manager.generate();
      const config = {
        projectName: "testproject",
        target: "lite" as const,
        preset: "learning-app" as const,
        domain: {
          root: "test.example.com",
          app: "test.example.com",
          admin: "admin.test.example.com",
        },
        ssh: { host: "1.2.3.4", port: 22, user: "root" },
        email: "admin@test.example.com",
        services: { nextjs: true, postgres: true, redis: true, directus: true, seaweedfs: true, windmill: true, homepage: true },
        buckets: [{ name: "assets", public: false }],
        directus: { adminEmail: "admin@test.example.com" },
        windmill: { workspace: "testproject", exampleFlows: true },
        resourceProfile: "small" as const,
        providerHint: "generic" as const,
      };

      const env = manager.buildEnvMap(secrets, config);

      expect(env.POSTGRES_USER).toBe("testproject");
      expect(env.POSTGRES_PASSWORD).toBe(secrets.postgresPassword);
      expect(env.DATABASE_URL).toContain("postgresql://");
      expect(env.REDIS_URL).toContain("redis://");
      expect(env.DIRECTUS_SECRET).toBe(secrets.directusSecret);
      expect(env.SEAWEEDFS_ACCESS_KEY).toBe(secrets.seaweedfsAccessKey);
      expect(env.NEXTAUTH_URL).toBe("https://test.example.com");
      expect(env.PROJECT_NAME).toBe("testproject");
      expect(env.NODE_ENV).toBe("production");
    });
  });
});
