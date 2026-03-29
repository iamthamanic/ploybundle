import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateSecret, generatePassword, timestampNow } from "@ploybundle/shared";
import { STATE_DIR } from "@ploybundle/shared";
import type {
  GeneratedSecrets,
  SecretsMetadata,
  ProjectConfig,
  SshTarget,
} from "@ploybundle/shared";
import type { SshService } from "../ssh/ssh-service.js";

const SECRETS_REMOTE_PATH = "/opt/ploybundle/.secrets.json";

function localSecretsPath(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR, "local", "secrets.json");
}

/** Minimal .env parser (no multiline values). */
function parseDotEnvFile(content: string): Record<string, string> {
  const m: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    m[key] = val;
  }
  return m;
}

function tryImportSecretsFromEnvFile(envPath: string): GeneratedSecrets | null {
  if (!existsSync(envPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return null;
  }
  const env = parseDotEnvFile(raw);
  const need = (k: string) => {
    const v = env[k]?.trim();
    return v && v.length > 0 ? v : null;
  };
  const postgresPassword = need("POSTGRES_PASSWORD");
  const redisPassword = need("REDIS_PASSWORD");
  const directusSecret = need("DIRECTUS_SECRET");
  const directusAdminPassword = need("DIRECTUS_ADMIN_PASSWORD");
  const internalServiceToken = need("PLOYBUNDLE_INTERNAL_TOKEN");
  const seaweedfsAccessKey = need("SEAWEEDFS_ACCESS_KEY");
  const seaweedfsSecretKey = need("SEAWEEDFS_SECRET_KEY");
  const windmillSecret = need("WINDMILL_SECRET");
  const appSessionSecret = need("APP_SESSION_SECRET");
  const nextauthSecret = need("NEXTAUTH_SECRET");
  if (
    !postgresPassword ||
    !redisPassword ||
    !directusSecret ||
    !directusAdminPassword ||
    !internalServiceToken ||
    !seaweedfsAccessKey ||
    !seaweedfsSecretKey ||
    !windmillSecret ||
    !appSessionSecret ||
    !nextauthSecret
  ) {
    return null;
  }
  return {
    postgresPassword,
    redisPassword,
    directusSecret,
    directusAdminPassword,
    internalServiceToken,
    seaweedfsAccessKey,
    seaweedfsSecretKey,
    windmillSecret,
    appSessionSecret,
    nextauthSecret,
  };
}

function withScheme(scheme: string, host: string): string {
  return `${scheme}://${host}`;
}

/** User/password from generatePassword may contain @ # $ etc.; must be encoded for URL parsers (Windmill, ORMs). */
function postgresJdbcUrl(
  user: string,
  password: string,
  host: string,
  port: string,
  database: string
): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

function redisUrlWithPassword(password: string): string {
  return `redis://:${encodeURIComponent(password)}@redis:6379`;
}

/** Origins and PUBLIC_URL for the official Directus Docker image (reads unprefixed env vars). */
function directusPublicAndCors(config: ProjectConfig): { publicUrl: string; corsOrigin: string } {
  const scheme = config.domain.scheme ?? "https";
  const app = config.domain.app ?? config.domain.root;
  const admin = config.domain.admin ?? `admin.${config.domain.root}`;
  const dashboard = config.domain.dashboard ?? `home.${config.domain.root}`;
  const origins = new Set([
    withScheme(scheme, app),
    withScheme(scheme, admin),
    withScheme(scheme, dashboard),
  ]);
  return {
    publicUrl: withScheme(scheme, admin),
    corsOrigin: [...origins].join(","),
  };
}

export class SecretsManager {
  constructor(private readonly ssh: SshService) {}

  generate(): GeneratedSecrets {
    return {
      postgresPassword: generatePassword(32),
      redisPassword: generatePassword(32),
      directusSecret: generateSecret(64),
      directusAdminPassword: generatePassword(24),
      internalServiceToken: generateSecret(64),
      seaweedfsAccessKey: generateSecret(20),
      seaweedfsSecretKey: generateSecret(40),
      windmillSecret: generateSecret(64),
      appSessionSecret: generateSecret(64),
      nextauthSecret: generateSecret(64),
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

  loadOrGenerateLocal(projectRoot: string): { secrets: GeneratedSecrets; isNew: boolean } {
    const secretsPath = localSecretsPath(projectRoot);
    if (existsSync(secretsPath)) {
      try {
        const raw = readFileSync(secretsPath, "utf8");
        return {
          secrets: JSON.parse(raw) as GeneratedSecrets,
          isNew: false,
        };
      } catch {
        // Fall through to regeneration.
      }
    }

    const envPath = path.join(projectRoot, ".env");
    const fromEnv = tryImportSecretsFromEnvFile(envPath);
    if (fromEnv) {
      return { secrets: fromEnv, isNew: true };
    }

    return {
      secrets: this.generate(),
      isNew: true,
    };
  }

  persistLocal(projectRoot: string, secrets: GeneratedSecrets): void {
    const secretsPath = localSecretsPath(projectRoot);
    mkdirSync(path.dirname(secretsPath), { recursive: true });
    writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), "utf8");
  }

  buildEnvMap(secrets: GeneratedSecrets, config: ProjectConfig): Record<string, string> {
    const { publicUrl, corsOrigin } = directusPublicAndCors(config);
    const redisUrl = redisUrlWithPassword(secrets.redisPassword);
    const scheme = config.domain.scheme ?? (config.mode === "local" ? "http" : "https");
    const appHost = config.domain.app ?? config.domain.root;
    const functionsHost = config.domain.functions ?? `fn.${config.domain.root}`;
    const pgUrl = postgresJdbcUrl(
      config.projectName,
      secrets.postgresPassword,
      "postgres",
      "5432",
      config.projectName
    );
    const windmillDbName = `${config.projectName}_windmill`;
    const windmillPgUrl = config.services.windmill
      ? postgresJdbcUrl(
          config.projectName,
          secrets.postgresPassword,
          "postgres",
          "5432",
          windmillDbName
        )
      : pgUrl;

    return {
      // Postgres
      POSTGRES_USER: config.projectName,
      POSTGRES_PASSWORD: secrets.postgresPassword,
      POSTGRES_DB: config.projectName,
      DATABASE_URL: pgUrl,

      // Redis
      REDIS_PASSWORD: secrets.redisPassword,
      REDIS_URL: redisUrl,

      // Directus (official image: unprefixed DB_*, SECRET, REDIS — DIRECTUS_* alone is not enough)
      SECRET: secrets.directusSecret,
      DB_CLIENT: "pg",
      DB_HOST: "postgres",
      DB_PORT: "5432",
      DB_DATABASE: config.projectName,
      DB_USER: config.projectName,
      DB_PASSWORD: secrets.postgresPassword,
      ADMIN_EMAIL: config.directus.adminEmail,
      ADMIN_PASSWORD: secrets.directusAdminPassword,
      CACHE_ENABLED: "true",
      CACHE_STORE: "redis",
      REDIS: redisUrl,
      PUBLIC_URL: publicUrl,
      CORS_ENABLED: "true",
      CORS_ORIGIN: corsOrigin,
      STORAGE_LOCATIONS: "s3",
      STORAGE_S3_DRIVER: "s3",
      STORAGE_S3_KEY: secrets.seaweedfsAccessKey,
      STORAGE_S3_SECRET: secrets.seaweedfsSecretKey,
      STORAGE_S3_BUCKET: "directus",
      STORAGE_S3_ENDPOINT: "http://seaweedfs:8333",
      STORAGE_S3_REGION: "us-east-1",
      STORAGE_S3_FORCE_PATH_STYLE: "true",

      // Directus (prefixed — kept for scripts / tooling that expect these names)
      DIRECTUS_SECRET: secrets.directusSecret,
      DIRECTUS_ADMIN_EMAIL: config.directus.adminEmail,
      DIRECTUS_ADMIN_PASSWORD: secrets.directusAdminPassword,
      PLOYBUNDLE_INTERNAL_TOKEN: secrets.internalServiceToken,
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

      // Windmill (separate DB so migrations do not collide with Directus on POSTGRES_DB)
      WINDMILL_SECRET: secrets.windmillSecret,
      WINDMILL_DATABASE_URL: windmillPgUrl,

      // App
      APP_SESSION_SECRET: secrets.appSessionSecret,
      /** Hub control-plane session signing (cookie); pair with HUB_ACTION_TOKEN. */
      HUB_SESSION_SECRET: secrets.appSessionSecret,
      /** Hub POST actions + hub-session login; same value as PLOYBUNDLE_INTERNAL_TOKEN for one shared operator secret. */
      HUB_ACTION_TOKEN: secrets.internalServiceToken,
      NEXTAUTH_SECRET: secrets.nextauthSecret,
      NEXTAUTH_URL: `${scheme}://${appHost}`,

      // Project
      PROJECT_NAME: config.projectName,
      DOMAIN: config.domain.root,
      WINDMILL_DOMAIN: functionsHost,
      NODE_ENV: config.mode === "local" ? "development" : "production",

    };
  }
}
