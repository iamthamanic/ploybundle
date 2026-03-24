import { stringify as toYaml } from "yaml";
import type { ProjectConfig, ResourceProfile } from "@ploybundle/shared";
import { DOCKER_IMAGES } from "@ploybundle/shared";

interface ComposeService {
  image: string;
  container_name: string;
  restart: string;
  environment?: string[];
  env_file?: string[];
  ports?: string[];
  volumes?: string[];
  depends_on?: Record<string, { condition: string }>;
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period: string;
  };
  command?: string | string[];
  deploy?: { resources: { limits: { memory: string; cpus: string } } };
}

interface ComposeFile {
  version: string;
  services: Record<string, ComposeService>;
  volumes: Record<string, { driver: string }>;
  networks: Record<string, { driver: string }>;
}

const RESOURCE_LIMITS: Record<ResourceProfile, { small: string; medium: string; large: string }> = {
  small: { small: "256m", medium: "512m", large: "1g" },
  medium: { small: "512m", medium: "1g", large: "2g" },
  large: { small: "1g", medium: "2g", large: "4g" },
};

export function renderComposeFile(config: ProjectConfig): string {
  const prefix = config.projectName;
  const limits = RESOURCE_LIMITS[config.resourceProfile];

  const compose: ComposeFile = {
    version: "3.8",
    services: {},
    volumes: {},
    networks: {
      ploybundle: { driver: "bridge" },
    },
  };

  // Postgres
  if (config.services.postgres) {
    compose.services.postgres = {
      image: DOCKER_IMAGES.postgres,
      container_name: `${prefix}-postgres`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: [
        "POSTGRES_USER=${POSTGRES_USER}",
        "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}",
        "POSTGRES_DB=${POSTGRES_DB}",
      ],
      volumes: ["postgres_data:/var/lib/postgresql/data"],
      healthcheck: {
        test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"],
        interval: "10s",
        timeout: "5s",
        retries: 5,
        start_period: "30s",
      },
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
    compose.volumes.postgres_data = { driver: "local" };
  }

  // Redis
  if (config.services.redis) {
    compose.services.redis = {
      image: DOCKER_IMAGES.redis,
      container_name: `${prefix}-redis`,
      restart: "unless-stopped",
      env_file: [".env"],
      command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"],
      volumes: ["redis_data:/data"],
      healthcheck: {
        test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"],
        interval: "10s",
        timeout: "5s",
        retries: 5,
        start_period: "10s",
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.5" } } },
    };
    compose.volumes.redis_data = { driver: "local" };
  }

  // SeaweedFS
  if (config.services.seaweedfs) {
    compose.services.seaweedfs = {
      image: DOCKER_IMAGES.seaweedfs,
      container_name: `${prefix}-seaweedfs`,
      restart: "unless-stopped",
      command: [
        "server",
        "-s3",
        "-s3.config=/etc/seaweedfs/s3.json",
        "-master.dir=/data/master",
        "-volume.dir=/data/volume",
        "-filer",
      ],
      ports: ["8333:8333", "9333:9333"],
      volumes: [
        "seaweedfs_data:/data",
        "./seaweedfs/s3.json:/etc/seaweedfs/s3.json:ro",
      ],
      healthcheck: {
        test: ["CMD", "wget", "--spider", "-q", "http://localhost:9333/cluster/status"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "30s",
      },
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
    compose.volumes.seaweedfs_data = { driver: "local" };
  }

  // Directus
  if (config.services.directus) {
    const directusDeps: Record<string, { condition: string }> = {};
    if (config.services.postgres) directusDeps.postgres = { condition: "service_healthy" };
    if (config.services.redis) directusDeps.redis = { condition: "service_healthy" };

    compose.services.directus = {
      image: DOCKER_IMAGES.directus,
      container_name: `${prefix}-directus`,
      restart: "unless-stopped",
      env_file: [".env"],
      ports: ["8055:8055"],
      volumes: ["directus_uploads:/directus/uploads", "directus_extensions:/directus/extensions"],
      depends_on: directusDeps,
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://localhost:8055/server/health || exit 1"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "45s",
      },
      deploy: { resources: { limits: { memory: limits.large, cpus: "1.0" } } },
    };
    compose.volumes.directus_uploads = { driver: "local" };
    compose.volumes.directus_extensions = { driver: "local" };
  }

  // Windmill
  if (config.services.windmill) {
    const windmillDeps: Record<string, { condition: string }> = {};
    if (config.services.postgres) windmillDeps.postgres = { condition: "service_healthy" };

    compose.services.windmill = {
      image: DOCKER_IMAGES.windmill,
      container_name: `${prefix}-windmill`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: [
        "DATABASE_URL=${WINDMILL_DATABASE_URL}",
        "BASE_URL=https://${WINDMILL_DOMAIN:-fn.${DOMAIN}}",
      ],
      ports: ["8000:8000"],
      depends_on: windmillDeps,
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://localhost:8000/api/version || exit 1"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "45s",
      },
      deploy: { resources: { limits: { memory: limits.large, cpus: "1.5" } } },
    };

    // Windmill worker
    compose.services["windmill-worker"] = {
      image: DOCKER_IMAGES.windmill,
      container_name: `${prefix}-windmill-worker`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: [
        "DATABASE_URL=${WINDMILL_DATABASE_URL}",
        "MODE=worker",
        "WORKER_GROUP=default",
      ],
      depends_on: {
        windmill: { condition: "service_healthy" },
      },
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
  }

  // Next.js App
  if (config.services.nextjs) {
    const nextDeps: Record<string, { condition: string }> = {};
    if (config.services.postgres) nextDeps.postgres = { condition: "service_healthy" };
    if (config.services.redis) nextDeps.redis = { condition: "service_healthy" };

    compose.services.nextjs = {
      image: DOCKER_IMAGES.nextjs,
      container_name: `${prefix}-nextjs`,
      restart: "unless-stopped",
      env_file: [".env"],
      ports: ["3000:3000"],
      volumes: ["./app:/app"],
      command: ["sh", "-c", "cd /app && npm install --production && npm start"],
      depends_on: nextDeps,
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://localhost:3000/api/health || exit 1"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "60s",
      },
      deploy: { resources: { limits: { memory: limits.large, cpus: "1.0" } } },
    };
  }

  // Homarr
  if (config.services.homarr) {
    compose.services.homarr = {
      image: DOCKER_IMAGES.homarr,
      container_name: `${prefix}-homarr`,
      restart: "unless-stopped",
      ports: ["3001:3000"],
      volumes: [
        "./homarr:/appdata",
      ],
      environment: ["TZ=UTC"],
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://localhost:3000 || exit 1"],
        interval: "15s",
        timeout: "5s",
        retries: 3,
        start_period: "15s",
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.25" } } },
    };
  }

  // Add network to all services
  for (const service of Object.values(compose.services)) {
    (service as ComposeService & { networks: string[] }).networks = ["ploybundle"];
  }

  return toYaml(compose, { lineWidth: 120 });
}
