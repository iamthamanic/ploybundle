import { stringify as toYaml } from "yaml";
import type { AppSpecV2, ProjectConfig, ResourceProfile } from "@ploybundle/shared";
import { DOCKER_IMAGES } from "@ploybundle/shared";

interface ComposeService {
  image?: string;
  build?: { context: string; dockerfile: string };
  container_name: string;
  restart: string;
  user?: string;
  environment?: string[];
  env_file?: string[];
  ports?: string[];
  extra_hosts?: string[];
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
  services: Record<string, ComposeService>;
  volumes: Record<string, { driver: string }>;
  networks: Record<string, { driver: string }>;
}

type ProjectConfigWithAppSpec = ProjectConfig & { appSpec?: AppSpecV2 };

const RESOURCE_LIMITS: Record<ResourceProfile, { small: string; medium: string; large: string }> = {
  small: { small: "256m", medium: "512m", large: "1g" },
  medium: { small: "512m", medium: "1g", large: "2g" },
  large: { small: "1g", medium: "2g", large: "4g" },
};

function serviceDependencyTarget(ref: string): string | undefined {
  if (ref === "database") return "postgres";
  if (ref === "cache") return "redis";
  if (ref === "auth") return "directus";
  if (ref === "storage") return "seaweedfs";
  if (ref === "jobs") return "windmill";
  if (ref.startsWith("custom-api:")) return `custom-api-${ref.slice("custom-api:".length)}`;
  if (ref.startsWith("worker:")) return `worker-${ref.slice("worker:".length)}`;
  return undefined;
}

function buildDependsOn(dependencies: string[] | undefined): Record<string, { condition: string }> | undefined {
  if (!dependencies?.length) return undefined;

  const dependsOn: Record<string, { condition: string }> = {};
  for (const dependency of dependencies) {
    const target = serviceDependencyTarget(dependency);
    if (!target) continue;
    dependsOn[target] = { condition: "service_started" };
  }

  return Object.keys(dependsOn).length > 0 ? dependsOn : undefined;
}

export function renderComposeFile(config: ProjectConfig): string {
  const prefix = config.projectName;
  const limits = RESOURCE_LIMITS[config.resourceProfile];
  const isLocal = config.mode === "local";
  const scheme = config.domain.scheme ?? (isLocal ? "http" : "https");
  const functionsHost = config.domain.functions ?? `fn.${config.domain.root}`;
  const functionsBaseUrl = `${scheme}://${functionsHost}`;

  const compose: ComposeFile = {
    services: {},
    volumes: {},
    networks: {
      ploybundle: { driver: "bridge" },
    },
  };

  // Postgres
  if (config.services.postgres) {
    const postgresVolumes = ["postgres_data:/var/lib/postgresql/data"];
    if (config.services.windmill) {
      postgresVolumes.push(
        "./scripts/docker-entrypoint-initdb.d:/docker-entrypoint-initdb.d:ro"
      );
    }
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
      volumes: postgresVolumes,
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

  // Adminer (Postgres browser UI — reference / dev stacks)
  if (config.services.adminer && config.services.postgres) {
    compose.services.adminer = {
      image: "adminer:latest",
      container_name: `${prefix}-adminer`,
      restart: "unless-stopped",
      environment: ["ADMINER_DEFAULT_SERVER=postgres", "ADMINER_DESIGN=pepa-linha"],
      ports: ["8088:8080"],
      depends_on: { postgres: { condition: "service_healthy" } },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.25" } } },
    };
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
      // `latest` SeaweedFS often breaks old `-master.dir` combos; single `-dir` matches upstream quickstart.
      command: ["server", "-dir=/data", "-filer", "-s3", "-s3.config=/etc/seaweedfs/s3.json"],
      ports: ["8333:8333", "9333:9333"],
      volumes: [
        "seaweedfs_data:/data",
        "./seaweedfs/s3.json:/etc/seaweedfs/s3.json:ro",
      ],
      // Master /cluster/healthz is the documented liveness probe (200 when raft/leader ok).
      // /cluster/status is heavier JSON; all-in-one `server` needs a generous start_period for volume+filer+s3.
      healthcheck: {
        test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1:9333/cluster/healthz || exit 1"],
        interval: "15s",
        timeout: "10s",
        retries: 8,
        start_period: "120s",
      },
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
    compose.volumes.seaweedfs_data = { driver: "local" };

    // One-shot bootstrap: create S3 buckets once SeaweedFS is reachable.
    compose.services["seaweedfs-bootstrap"] = {
      image: "alpine:3.20",
      container_name: `${prefix}-seaweedfs-bootstrap`,
      restart: "no",
      env_file: [".env"],
      volumes: ["./scripts:/scripts:ro"],
      command: [
        "sh",
        "-c",
        "apk add --no-cache aws-cli wget >/dev/null && sh /scripts/init-buckets.sh",
      ],
      depends_on: {
        seaweedfs: { condition: "service_started" },
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.25" } } },
    };
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
      volumes: [
        "directus_uploads:/directus/uploads",
        "directus_extensions:/directus/extensions",
        "./scripts:/scripts:ro",
      ],
      depends_on: directusDeps,
      healthcheck: {
        test: [
          "CMD-SHELL",
          "wget --spider -q http://127.0.0.1:8055/server/health || exit 1",
        ],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "45s",
      },
      deploy: { resources: { limits: { memory: limits.large, cpus: "1.0" } } },
    };
    compose.volumes.directus_uploads = { driver: "local" };
    compose.volumes.directus_extensions = { driver: "local" };

    // One-shot bootstrap: creates preset collections/fields after Directus is healthy.
    compose.services["directus-bootstrap"] = {
      image: "alpine:3.20",
      container_name: `${prefix}-directus-bootstrap`,
      restart: "no",
      env_file: [".env"],
      volumes: ["./scripts:/scripts:ro"],
      command: [
        "sh",
        "-c",
        "apk add --no-cache curl jq >/dev/null && sh /scripts/bootstrap-directus.sh && sh /scripts/setup-directus-roles.sh",
      ],
      depends_on: {
        directus: { condition: "service_healthy" },
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.25" } } },
    };
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
        `BASE_URL=${functionsBaseUrl}`,
        "SUPERADMIN_SECRET=${WINDMILL_SECRET}",
      ],
      ports: ["8000:8000"],
      depends_on: windmillDeps,
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:8000/api/version || exit 1"],
        interval: "10s",
        timeout: "10s",
        retries: 8,
        start_period: "120s",
      },
      deploy: { resources: { limits: { memory: "2g", cpus: "1.5" } } },
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

    // One-shot bootstrap: workspace + scripts + schedules.
    compose.services["windmill-bootstrap"] = {
      image: "alpine:3.20",
      container_name: `${prefix}-windmill-bootstrap`,
      restart: "no",
      env_file: [".env"],
      volumes: ["./scripts:/scripts:ro"],
      command: [
        "sh",
        "-c",
        "apk add --no-cache curl >/dev/null && sh /scripts/bootstrap-windmill.sh",
      ],
      depends_on: {
        windmill: { condition: "service_started" },
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.25" } } },
    };
  }

  // Product app: Next.js (bind-mount + dev in local mode) or Vite SPA (image build + nginx :3000)
  if (config.services.nextjs) {
    const appDeps: Record<string, { condition: string }> = {};
    if (config.services.postgres) appDeps.postgres = { condition: "service_healthy" };
    if (config.services.redis) appDeps.redis = { condition: "service_healthy" };

    if (config.frontend === "vite-react") {
      compose.services.vite = {
        build: { context: "./vite-app", dockerfile: "Dockerfile" },
        container_name: `${prefix}-vite`,
        restart: "unless-stopped",
        ports: [isLocal ? "3001:3000" : "3000:3000"],
        depends_on: appDeps,
        healthcheck: {
          test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:3000/api/health || exit 1"],
          interval: "15s",
          timeout: "5s",
          retries: 5,
          start_period: "120s",
        },
        deploy: { resources: { limits: { memory: limits.large, cpus: "1.0" } } },
      };
    } else {
      compose.services.nextjs = {
        image: DOCKER_IMAGES.nextjs,
        container_name: `${prefix}-nextjs`,
        restart: "unless-stopped",
        env_file: [".env"],
        ports: [isLocal ? "3001:3000" : "3000:3000"],
        volumes: ["./app:/app"],
        command: [
          "sh",
          "-c",
          isLocal
            ? "cd /app && npm install && npm run dev -- --hostname 0.0.0.0 --port 3000"
            : "cd /app && npm install --production && npm start",
        ],
        depends_on: appDeps,
        healthcheck: {
          test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:3000/api/health || exit 1"],
          interval: "15s",
          timeout: "5s",
          retries: 8,
          start_period: isLocal ? "180s" : "60s",
        },
        deploy: { resources: { limits: { memory: limits.large, cpus: "1.0" } } },
      };
    }
  }

  const appSpec = (config as ProjectConfigWithAppSpec).appSpec;
  const customApis = appSpec?.modules.customApis ?? [];
  for (const [index, module] of customApis.entries()) {
    if (!module.enabled) continue;

    compose.services[`custom-api-${module.id}`] = {
      build: { context: `./${module.path.replace(/^\.?\//, "")}`, dockerfile: "Dockerfile" },
      container_name: `${prefix}-custom-api-${module.id}`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: [
        "PORT=3000",
        `SERVICE_ID=${module.id}`,
        "PLOYBUNDLE_ROLE=custom-api",
      ],
      ports: [`${4100 + index}:3000`],
      depends_on: buildDependsOn(module.dependsOn),
      healthcheck: {
        test: ["CMD-SHELL", `wget --spider -q http://127.0.0.1:3000${module.healthcheck ?? "/health"} || exit 1`],
        interval: "15s",
        timeout: "5s",
        retries: 5,
        start_period: "45s",
      },
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
  }

  const workers = appSpec?.modules.workers ?? [];
  for (const module of workers) {
    if (!module.enabled) continue;

    compose.services[`worker-${module.id}`] = {
      build: { context: `./${module.path.replace(/^\.?\//, "")}`, dockerfile: "Dockerfile" },
      container_name: `${prefix}-worker-${module.id}`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: [
        `SERVICE_ID=${module.id}`,
        "PLOYBUNDLE_ROLE=worker",
      ],
      depends_on: buildDependsOn(module.dependsOn),
      deploy: { resources: { limits: { memory: limits.medium, cpus: "1.0" } } },
    };
  }

  // Ploybundle Hub (generated Next.js dashboard)
  if (config.services.hub) {
    const hubDepends: Record<string, { condition: string }> = {};
    if (config.services.postgres) hubDepends.postgres = { condition: "service_healthy" };
    if (config.services.directus) hubDepends.directus = { condition: "service_healthy" };

    const hubEnv: string[] = [
      // Hub code checks ADMIN_* first; map from the same vars Directus uses (compose interpolates from .env).
      "ADMIN_EMAIL=${DIRECTUS_ADMIN_EMAIL}",
      "ADMIN_PASSWORD=${DIRECTUS_ADMIN_PASSWORD}",
      "HUB_ACTION_TOKEN=${HUB_ACTION_TOKEN}",
      "HUB_SESSION_SECRET=${HUB_SESSION_SECRET}",
    ];
    if (isLocal) {
      hubEnv.push(
        "HUB_LOGS_ENABLED=1",
        "HUB_SHOW_ENV_KEY_NAMES=1",
        "HUB_ALLOW_UNAUTHENTICATED_ACTIONS=1"
      );
    }

    const hubService: ComposeService = {
      build: { context: "./hub", dockerfile: "Dockerfile" },
      container_name: `${prefix}-hub`,
      restart: "unless-stopped",
      env_file: [".env"],
      environment: hubEnv,
      ports: [isLocal ? "7580:3000" : "7575:3000"],
      ...(Object.keys(hubDepends).length > 0 ? { depends_on: hubDepends } : {}),
      healthcheck: {
        test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:3000 || exit 1"],
        interval: "15s",
        timeout: "5s",
        retries: 8,
        start_period: isLocal ? "180s" : "90s",
      },
      deploy: { resources: { limits: { memory: limits.small, cpus: "0.5" } } },
    };
    if (isLocal) {
      hubService.user = "0:0";
      hubService.volumes = ["/var/run/docker.sock:/var/run/docker.sock"];
      /** Lets the hub probe host-only UIs (CapRover :3000, Coolify :8000) from inside the container. */
      hubService.extra_hosts = ["host.docker.internal:host-gateway"];
    }
    compose.services.hub = hubService;
  }

  // Add network to all services
  for (const service of Object.values(compose.services)) {
    (service as ComposeService & { networks: string[] }).networks = ["ploybundle"];
  }

  return toYaml(compose, { lineWidth: 120 });
}
