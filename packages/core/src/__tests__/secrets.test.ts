import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { SecretsManager } from "../secrets/secrets-manager.js";
import type { SshService } from "../ssh/ssh-service.js";

describe("SecretsManager", () => {
  const manager = new SecretsManager({} as SshService);

  describe("generate", () => {
    it("generates all required secrets", () => {
      const secrets = manager.generate();

      expect(secrets.postgresPassword).toBeTruthy();
      expect(secrets.redisPassword).toBeTruthy();
      expect(secrets.directusSecret).toBeTruthy();
      expect(secrets.directusAdminPassword).toBeTruthy();
      expect(secrets.internalServiceToken).toBeTruthy();
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
      expect(a.internalServiceToken).not.toBe(b.internalServiceToken);
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
        mode: "server" as const,
        target: "lite" as const,
        preset: "learning-app" as const,
        frontend: "nextjs" as const,
        domain: {
          root: "test.example.com",
          app: "test.example.com",
          admin: "admin.test.example.com",
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
        resourceProfile: "small" as const,
        providerHint: "generic" as const,
      };

      const env = manager.buildEnvMap(secrets, config);

      expect(env.POSTGRES_USER).toBe("testproject");
      expect(env.POSTGRES_PASSWORD).toBe(secrets.postgresPassword);
      expect(env.DATABASE_URL).toContain("postgresql://");
      expect(env.REDIS_URL).toContain("redis://");
      expect(env.DIRECTUS_SECRET).toBe(secrets.directusSecret);
      expect(env.SECRET).toBe(secrets.directusSecret);
      expect(env.PLOYBUNDLE_INTERNAL_TOKEN).toBe(secrets.internalServiceToken);
      expect(env.DB_CLIENT).toBe("pg");
      expect(env.DB_HOST).toBe("postgres");
      expect(env.REDIS).toContain("redis://");
      expect(env.PUBLIC_URL).toBe("https://admin.test.example.com");
      expect(env.SEAWEEDFS_ACCESS_KEY).toBe(secrets.seaweedfsAccessKey);
      expect(env.NEXTAUTH_URL).toBe("https://test.example.com");
      expect(env.PROJECT_NAME).toBe("testproject");
      expect(env.NODE_ENV).toBe("production");
    });

    it("percent-encodes @#$ in postgres and redis URLs so Windmill and clients can parse them", () => {
      const secrets = manager.generate();
      secrets.postgresPassword = "p@ss#word$x";
      secrets.redisPassword = "r#d$x";
      const config = {
        projectName: "myapp",
        mode: "server" as const,
        target: "lite" as const,
        preset: "learning-app" as const,
        frontend: "nextjs" as const,
        domain: { root: "x.com", app: "x.com", admin: "a.x.com" },
        ssh: { host: "1.2.3.4", port: 22, user: "root" },
        projectRoot: "/tmp/myapp",
        email: "a@x.com",
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
        buckets: [{ name: "b", public: false }],
        directus: { adminEmail: "a@x.com" },
        windmill: { workspace: "w", exampleFlows: false },
        resourceProfile: "small" as const,
        providerHint: "generic" as const,
      };

      const env = manager.buildEnvMap(secrets, config);
      expect(env.DATABASE_URL).toBe(
        `postgresql://${encodeURIComponent("myapp")}:${encodeURIComponent(secrets.postgresPassword)}@postgres:5432/${encodeURIComponent("myapp")}`
      );
      expect(env.WINDMILL_DATABASE_URL).toBe(
        `postgresql://${encodeURIComponent("myapp")}:${encodeURIComponent(secrets.postgresPassword)}@postgres:5432/${encodeURIComponent("myapp_windmill")}`
      );
      expect(env.REDIS_URL).toBe(`redis://:${encodeURIComponent(secrets.redisPassword)}@redis:6379`);
      expect(env.REDIS).toBe(env.REDIS_URL);
    });
  });

  describe("loadOrGenerateLocal", () => {
    it("imports secrets from existing .env when secrets.json is missing", () => {
      const dir = mkdtempSync(join(tmpdir(), "ploybundle-secrets-"));
      try {
        writeFileSync(
          join(dir, ".env"),
          [
            "POSTGRES_PASSWORD=pg-secret",
            "REDIS_PASSWORD=redis-secret",
            "DIRECTUS_SECRET=directus-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "DIRECTUS_ADMIN_PASSWORD=admin-pw",
            "PLOYBUNDLE_INTERNAL_TOKEN=internal-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "SEAWEEDFS_ACCESS_KEY=access-key-123456789012",
            "SEAWEEDFS_SECRET_KEY=secret-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "WINDMILL_SECRET=windmill-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "APP_SESSION_SECRET=session-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "NEXTAUTH_SECRET=nextauth-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ].join("\n"),
          "utf8"
        );
        const { secrets, isNew } = manager.loadOrGenerateLocal(dir);
        expect(isNew).toBe(true);
        expect(secrets.postgresPassword).toBe("pg-secret");
        expect(secrets.redisPassword).toBe("redis-secret");
        expect(secrets.directusSecret).toBe(
          "directus-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        manager.persistLocal(dir, secrets);
        const again = manager.loadOrGenerateLocal(dir);
        expect(again.isNew).toBe(false);
        expect(again.secrets.postgresPassword).toBe("pg-secret");
        const stored = JSON.parse(
          readFileSync(join(dir, ".ploybundle-state", "local", "secrets.json"), "utf8")
        );
        expect(stored.postgresPassword).toBe("pg-secret");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
