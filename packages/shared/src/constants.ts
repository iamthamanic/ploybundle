import type { ServiceName, PlatformTarget, PresetName, ResourceProfile, ProviderHint } from "./types.js";

export const PLOYBUNDLE_VERSION = "0.1.0";

export const VALID_TARGETS: readonly PlatformTarget[] = ["lite", "full"] as const;

export const VALID_PRESETS: readonly PresetName[] = [
  "learning-app",
  "crud-saas",
  "content-app",
  "workflow-app",
] as const;

export const VALID_RESOURCE_PROFILES: readonly ResourceProfile[] = [
  "small",
  "medium",
  "large",
] as const;

export const VALID_PROVIDER_HINTS: readonly ProviderHint[] = [
  "hetzner",
  "hostinger",
  "generic",
] as const;

export const ALL_SERVICES: readonly ServiceName[] = [
  "nextjs",
  "postgres",
  "redis",
  "directus",
  "seaweedfs",
  "windmill",
  "homepage",
] as const;

export const DEFAULT_SERVICE_TOGGLE = {
  nextjs: true,
  postgres: true,
  redis: true,
  directus: true,
  seaweedfs: true,
  windmill: true,
  homepage: true,
} as const;

export const DEFAULT_SSH_PORT = 22;

export const DEFAULT_RESOURCE_PROFILE: ResourceProfile = "small";

export const DEFAULT_PROVIDER_HINT: ProviderHint = "generic";

export const DEFAULT_WINDMILL_WORKSPACE = "ploybundle";

// Default ports for services
export const SERVICE_PORTS: Record<ServiceName, number> = {
  nextjs: 3000,
  postgres: 5432,
  redis: 6379,
  directus: 8055,
  seaweedfs: 8333,
  windmill: 8000,
  homepage: 3001,
};

// Required system ports
export const REQUIRED_PORTS = [22, 80, 443];

// Minimum host requirements
export const MIN_DISK_GB = 10;
export const MIN_RAM_MB = 2048;

// Docker image defaults
export const DOCKER_IMAGES = {
  nextjs: "node:20-alpine",
  postgres: "postgres:16-alpine",
  redis: "redis:7-alpine",
  directus: "directus/directus:11",
  seaweedfs: "chrislusf/seaweedfs:latest",
  windmill: "ghcr.io/windmill-labs/windmill:main",
  homepage: "ghcr.io/gethomepage/homepage:latest",
} as const;

// Subdomain conventions
export const DEFAULT_SUBDOMAINS = {
  app: "",
  admin: "admin",
  storage: "storage",
  functions: "fn",
  deploy: "deploy",
  dashboard: "home",
} as const;

// Platform-specific constants
export const CAPROVER_PORT = 3000;
export const COOLIFY_PORT = 8000;

export const CONFIG_FILENAME = "ploybundle.yaml";
export const ENV_EXAMPLE_FILENAME = ".env.example";
export const STATE_DIR = ".ploybundle-state";
