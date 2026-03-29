import type {
  ServiceName,
  PlatformTarget,
  PresetName,
  ResourceProfile,
  ProviderHint,
  ProjectMode,
  ProductFrontend,
  AppArchetype,
  AppRuntime,
  DashboardArea,
  DashboardRunAction,
  CustomApiFramework,
  WorkerKind,
  RealtimeChannelTransport,
  RealtimeSubscribeAcl,
  RealtimePublishAcl,
  RealtimePresenceScope,
  RealtimeEventOrigin,
} from "./types.js";

export const PLOYBUNDLE_VERSION = "0.1.0";

export const VALID_TARGETS: readonly PlatformTarget[] = ["lite", "full"] as const;
export const VALID_MODES: readonly ProjectMode[] = ["local", "server"] as const;

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

export const VALID_PRODUCT_FRONTENDS: readonly ProductFrontend[] = ["nextjs", "vite-react"] as const;
export const VALID_APP_ARCHETYPES: readonly AppArchetype[] = [
  "crud",
  "content",
  "catalog",
  "tool",
  "workflow",
  "studio",
  "agent-platform",
  "custom",
] as const;
export const VALID_APP_RUNTIMES: readonly AppRuntime[] = ["node", "deno", "python"] as const;
export const VALID_DASHBOARD_AREAS: readonly DashboardArea[] = [
  "app",
  "auth",
  "data",
  "storage",
  "jobs",
  "workers",
  "deploy",
  "ops",
] as const;
export const VALID_DASHBOARD_RUN_ACTIONS: readonly DashboardRunAction[] = [
  "deploy",
  "restart",
  "run-job",
  "rotate-secret",
] as const;
export const VALID_CUSTOM_API_FRAMEWORKS: readonly CustomApiFramework[] = [
  "hono",
  "express",
  "fastapi",
  "none",
] as const;
export const VALID_WORKER_KINDS: readonly WorkerKind[] = [
  "background",
  "long-running",
  "specialized",
] as const;
export const VALID_REALTIME_CHANNEL_TRANSPORTS: readonly RealtimeChannelTransport[] = [
  "sse",
  "websocket",
  "hybrid",
] as const;
export const VALID_REALTIME_SUBSCRIBE_ACLS: readonly RealtimeSubscribeAcl[] = [
  "public",
  "authenticated",
  "user",
  "team",
] as const;
export const VALID_REALTIME_PUBLISH_ACLS: readonly RealtimePublishAcl[] = [
  "service",
  "authenticated",
  "user",
  "team",
] as const;
export const VALID_REALTIME_PRESENCE_SCOPES: readonly RealtimePresenceScope[] = [
  "user",
  "workspace",
] as const;
export const VALID_REALTIME_EVENT_ORIGINS: readonly RealtimeEventOrigin[] = [
  "system",
  "client",
  "worker",
  "service",
] as const;

export const DEFAULT_PRODUCT_FRONTEND: ProductFrontend = "nextjs";

export const ALL_SERVICES: readonly ServiceName[] = [
  "nextjs",
  "vite",
  "postgres",
  "redis",
  "directus",
  "seaweedfs",
  "windmill",
  "hub",
] as const;

export const DEFAULT_SERVICE_TOGGLE = {
  nextjs: true,
  postgres: true,
  redis: true,
  directus: true,
  seaweedfs: true,
  windmill: true,
  hub: true,
  adminer: false,
} as const;

export const DEFAULT_SSH_PORT = 22;

export const DEFAULT_RESOURCE_PROFILE: ResourceProfile = "small";
export const DEFAULT_MODE: ProjectMode = "server";

export const DEFAULT_PROVIDER_HINT: ProviderHint = "generic";

export const DEFAULT_WINDMILL_WORKSPACE = "ploybundle";

// Default ports for services
export const SERVICE_PORTS: Record<ServiceName, number> = {
  nextjs: 3000,
  vite: 3000,
  postgres: 5432,
  redis: 6379,
  directus: 8055,
  seaweedfs: 8333,
  windmill: 8000,
  hub: 7575,
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
  /** Pinned release — `:main` is volatile and often breaks local healthchecks. */
  windmill: "ghcr.io/windmill-labs/windmill:1.659",
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
