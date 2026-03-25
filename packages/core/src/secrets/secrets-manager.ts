import { generateSecret, generatePassword, timestampNow } from "@ploybundle/shared";
import type { GeneratedSecrets, SecretsMetadata, ProjectConfig, SshTarget } from "@ploybundle/shared";
import type { SshService } from "../ssh/ssh-service.js";

const SECRETS_REMOTE_PATH = "/opt/ploybundle/.secrets.json";

export class SecretsManager {
  constructor(private readonly ssh: SshService) {}

  generate(): GeneratedSecrets {
    return {
      postgresPassword: generatePassword(32),
      redisPassword: generatePassword(32),
      directusSecret: generateSecret(64),
      directusAdminPassword: generatePassword(24),
      seaweedfsAccessKey: generateSecret(20),
      seaweedfsSecretKey: generateSecret(40),
      windmillSecret: generateSecret(64),
      appSessionSecret: generateSecret(64),
      nextauthSecret: generateSecret(64),
      homarrEncryptionKey: generateSecret(64),
    };
  }

  metadata(): SecretsMetadata {
    return {
      generated: true,
      generatedAt: timestampNow(),
    };
  }

  async loadOrGenerate(
    target: SshTarget,
    _config: ProjectConfig
  ): Promise<{ secrets: GeneratedSecrets; isNew: boolean }> {
    // Try to load existing secrets from the remote host
    const exists = await this.ssh.fileExists(target, SECRETS_REMOTE_PATH);

    if (exists) {
      try {
        const raw = await this.ssh.readFile(target, SECRETS_REMOTE_PATH);
        const secrets = JSON.parse(raw) as GeneratedSecrets;
        return { secrets, isNew: false };
      } catch {
        // If reading fails, generate new secrets
      }
    }

    const secrets = this.generate();
    return { secrets, isNew: true };
  }

  async persist(target: SshTarget, secrets: GeneratedSecrets): Promise<void> {
    const content = JSON.stringify(secrets, null, 2);
    await this.ssh.exec(target, `mkdir -p /opt/ploybundle && chmod 700 /opt/ploybundle`);
    await this.ssh.uploadContent(target, content, SECRETS_REMOTE_PATH);
    await this.ssh.exec(target, `chmod 600 ${SECRETS_REMOTE_PATH}`);
  }

  buildEnvMap(secrets: GeneratedSecrets, config: ProjectConfig): Record<string, string> {
    return {
      // Postgres
      POSTGRES_USER: config.projectName,
      POSTGRES_PASSWORD: secrets.postgresPassword,
      POSTGRES_DB: config.projectName,
      DATABASE_URL: `postgresql://${config.projectName}:${secrets.postgresPassword}@postgres:5432/${config.projectName}`,

      // Redis
      REDIS_PASSWORD: secrets.redisPassword,
      REDIS_URL: `redis://:${secrets.redisPassword}@redis:6379`,

      // Directus
      DIRECTUS_SECRET: secrets.directusSecret,
      DIRECTUS_ADMIN_EMAIL: config.directus.adminEmail,
      DIRECTUS_ADMIN_PASSWORD: secrets.directusAdminPassword,
      DIRECTUS_DB_CLIENT: "pg",
      DIRECTUS_DB_HOST: "postgres",
      DIRECTUS_DB_PORT: "5432",
      DIRECTUS_DB_DATABASE: config.projectName,
      DIRECTUS_DB_USER: config.projectName,
      DIRECTUS_DB_PASSWORD: secrets.postgresPassword,

      // SeaweedFS
      SEAWEEDFS_ACCESS_KEY: secrets.seaweedfsAccessKey,
      SEAWEEDFS_SECRET_KEY: secrets.seaweedfsSecretKey,
      SEAWEEDFS_ENDPOINT: `http://seaweedfs:8333`,
      DIRECTUS_STORAGE_LOCATIONS: "s3",
      DIRECTUS_STORAGE_S3_DRIVER: "s3",
      DIRECTUS_STORAGE_S3_KEY: secrets.seaweedfsAccessKey,
      DIRECTUS_STORAGE_S3_SECRET: secrets.seaweedfsSecretKey,
      DIRECTUS_STORAGE_S3_BUCKET: "directus",
      DIRECTUS_STORAGE_S3_ENDPOINT: `http://seaweedfs:8333`,
      DIRECTUS_STORAGE_S3_REGION: "us-east-1",
      DIRECTUS_STORAGE_S3_FORCE_PATH_STYLE: "true",

      // Windmill
      WINDMILL_SECRET: secrets.windmillSecret,
      WINDMILL_DATABASE_URL: `postgresql://${config.projectName}:${secrets.postgresPassword}@postgres:5432/${config.projectName}`,

      // App
      APP_SESSION_SECRET: secrets.appSessionSecret,
      NEXTAUTH_SECRET: secrets.nextauthSecret,
      NEXTAUTH_URL: `https://${config.domain.app ?? config.domain.root}`,

      // Project
      PROJECT_NAME: config.projectName,
      NODE_ENV: "production",

      // Homarr v1 (compose uses SECRET_ENCRYPTION_KEY)
      ...(config.services.homarr ? { HOMARR_ENCRYPTION_KEY: secrets.homarrEncryptionKey } : {}),
    };
  }
}
