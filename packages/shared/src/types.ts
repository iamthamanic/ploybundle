// Core domain types for the entire ploybundle system

export type PlatformTarget = "lite" | "full";
export type ProjectMode = "local" | "server";

export type PresetName = "learning-app" | "crud-saas" | "content-app" | "workflow-app";

export type ProviderHint = "hetzner" | "hostinger" | "generic";

/** Product web UI scaffold: Next.js (default) or React SPA + Vite + nginx in Docker. */
export type ProductFrontend = "nextjs" | "vite-react";

export type ServiceName =
  | "nextjs"
  | "vite"
  | "postgres"
  | "redis"
  | "directus"
  | "seaweedfs"
  | "windmill"
  | "hub";

export type ResourceProfile = "small" | "medium" | "large";
export type AppArchetype =
  | "crud"
  | "content"
  | "catalog"
  | "tool"
  | "workflow"
  | "studio"
  | "agent-platform"
  | "custom";
export type AppRuntime = "node" | "deno" | "python";
export type AppStarter = "greenfield" | "import";
export type AppSpecVersion = 2;
export type AuthProvider = "directus";
export type AdminProvider = "directus";
export type DatabaseProvider = "postgres";
export type CacheProvider = "redis";
export type StorageProvider = "seaweedfs";
export type JobsProvider = "windmill";
export type DashboardArea = "app" | "auth" | "data" | "storage" | "jobs" | "workers" | "deploy" | "ops";
export type DashboardRunAction = "deploy" | "restart" | "run-job" | "rotate-secret";
export type CustomApiFramework = "hono" | "express" | "fastapi" | "none";
export type WorkerKind = "background" | "long-running" | "specialized";
export type RealtimeChannelTransport = "sse" | "websocket" | "hybrid";
export type RealtimeSubscribeAcl = "public" | "authenticated" | "user" | "team";
export type RealtimePublishAcl = "service" | "authenticated" | "user" | "team";
export type RealtimePresenceScope = "user" | "workspace";
export type RealtimeEventOrigin = "system" | "client" | "worker" | "service";
export type ProductFieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "json"
  | "enum"
  | "relation"
  | "file";
export type EntitySourceOfTruth = "database" | "admin";
export type EntityAdminMode = "generated" | "custom" | "none";
export type EntityApiMode = "generated" | "none" | `custom-api:${string}`;
export type EntityOwnership = "global" | "user" | "team";
export type WorkflowTrigger = "manual" | "api" | "schedule" | "event";
export type WorkflowExecutor = `worker:${string}` | `custom-api:${string}` | `job:${string}`;
export type AppDependencyRef =
  | "database"
  | "cache"
  | "auth"
  | "storage"
  | "jobs"
  | `custom-api:${string}`
  | `worker:${string}`;

export interface SshTarget {
  host: string;
  port: number;
  user: string;
  privateKeyPath?: string;
}

export interface DomainConfig {
  root: string;
  app?: string;
  admin?: string;
  storage?: string;
  /** Browser-friendly storage UI (e.g. SeaweedFS master :9333). Defaults to same host as {@link storage}. */
  storageBrowser?: string;
  /** SQL browser (e.g. Adminer on localhost:8088). Omitted when no DB UI is bundled. */
  databaseBrowser?: string;
  functions?: string;
  deploy?: string;
  dashboard?: string;
  /** When set, URLs use this scheme (e.g. http for local docker port mappings). Default: https. */
  scheme?: "http" | "https";
}

export interface BucketDefinition {
  name: string;
  public: boolean;
}

export interface DirectusOptions {
  adminEmail: string;
  collections?: string[];
}

export interface WindmillOptions {
  workspace: string;
  exampleFlows: boolean;
}

export interface ServiceToggle {
  nextjs: boolean;
  postgres: boolean;
  redis: boolean;
  directus: boolean;
  seaweedfs: boolean;
  windmill: boolean;
  hub: boolean;
  /** Lightweight Postgres UI (Adminer) — dev / reference stacks only; off by default for production. */
  adminer: boolean;
}

export interface ScaffoldBlueprint {
  name: string;
  displayName: string;
  description: string;
  buckets: BucketDefinition[];
  directusCollections: DirectusCollectionTemplate[];
  windmillFlows: WindmillFlowTemplate[];
  envDefaults: Record<string, string>;
  nextjsFeatures: string[];
}

/** Hub sidebar labels (written to hub/config/board.json only; not used for Docker/compose). */
export interface HubPresentationConfig {
  /** Human-readable name next to “Ploybundle” in the hub sidebar. */
  displayName?: string;
  /** Any https?:// URL; shown as repository link in the sidebar. */
  repositoryUrl?: string;
}

export interface ProjectConfig {
  projectName: string;
  mode: ProjectMode;
  target?: PlatformTarget;
  preset: PresetName;
  template?: ScaffoldBlueprint;
  appSpec?: AppSpecV2;
  /** When `services.nextjs` is true, which product app scaffold and compose service to generate. */
  frontend: ProductFrontend;
  domain: DomainConfig;
  ssh: SshTarget;
  projectRoot: string;
  email: string;
  services: ServiceToggle;
  buckets: BucketDefinition[];
  directus: DirectusOptions;
  windmill: WindmillOptions;
  resourceProfile: ResourceProfile;
  providerHint: ProviderHint;
  /** Optional; merged into generated hub board.json. */
  hubPresentation?: HubPresentationConfig;
}

export interface GeneratedSecrets {
  postgresPassword: string;
  redisPassword: string;
  directusSecret: string;
  directusAdminPassword: string;
  internalServiceToken: string;
  seaweedfsAccessKey: string;
  seaweedfsSecretKey: string;
  windmillSecret: string;
  appSessionSecret: string;
  nextauthSecret: string;
}

export interface SecretsMetadata {
  generated: boolean;
  generatedAt: string;
  rotatedAt?: string;
}

export interface ServiceHealth {
  service: string;
  healthy: boolean;
  url?: string;
  message?: string;
}

export interface ProjectStatus {
  projectName: string;
  mode: ProjectMode;
  target?: PlatformTarget;
  preset: string;
  services: ServiceHealth[];
  urls: ProjectUrls;
  configSummary: Record<string, string>;
}

export interface ProjectUrls {
  app: string;
  admin: string;
  storage: string;
  storageBrowser: string;
  functions: string;
  deploy: string;
  dashboard: string;
  /** Present when {@link ServiceToggle.adminer} / bundled SQL UI is enabled. */
  databaseBrowser?: string;
}

export interface ProjectSummary {
  projectName: string;
  mode: ProjectMode;
  target?: PlatformTarget;
  preset: string;
  urls: ProjectUrls;
  services: ServiceHealth[];
  troubleshootingHint: string;
}

export interface HostDiagnosis {
  os: string;
  osVersion: string;
  isUbuntu2404: boolean;
  hasRoot: boolean;
  dockerInstalled: boolean;
  dockerVersion?: string;
  availableDiskGb: number;
  availableRamMb: number;
  openPorts: number[];
  portConflicts: number[];
}

export type OutputMode = "human" | "json" | "quiet";

export interface CliContext {
  outputMode: OutputMode;
  noColor: boolean;
  verbose: boolean;
}

export type DeployPhase =
  | "validate"
  | "connect"
  | "inspect"
  | "install-platform"
  | "render"
  | "deploy"
  | "seed"
  | "verify";

export interface PhaseResult {
  phase: DeployPhase;
  success: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

export interface DeployResult {
  success: boolean;
  phases: PhaseResult[];
  summary?: ProjectSummary;
}

// Platform adapter interface — the contract all adapters implement
export interface PlatformAdapter {
  readonly name: string;
  readonly target?: PlatformTarget;

  validateHost(ssh: SshTarget): Promise<HostDiagnosis>;
  installPlatform(ssh: SshTarget, config: ProjectConfig): Promise<PhaseResult>;
  platformHealth(ssh: SshTarget): Promise<ServiceHealth>;
  deployStack(ssh: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult>;
  updateStack(ssh: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult>;
  destroyStack(ssh: SshTarget, config: ProjectConfig): Promise<PhaseResult>;
  fetchLogs(ssh: SshTarget, config: ProjectConfig, service?: string): Promise<string>;
  openUrls(config: ProjectConfig): ProjectUrls;
  setEnvironmentVariables(
    ssh: SshTarget,
    config: ProjectConfig,
    env: Record<string, string>
  ): Promise<void>;
  status(ssh: SshTarget, config: ProjectConfig): Promise<ProjectStatus>;
}

export interface StackArtifacts {
  composeFile: string;
  envFiles: Record<string, string>;
  configs: Record<string, string>;
  hubConfig: string;
  metadata: Record<string, unknown>;
}

// Preset definition type
export interface PresetDefinition extends ScaffoldBlueprint {
  name: PresetName;
  services: ServiceToggle;
  hubBoard: HubBoardConfig;
}

export interface AppAuthFeatures {
  emailPassword?: boolean;
  oauth?: ("github" | "google")[];
  invitations?: boolean;
  apiTokens?: boolean;
}

export interface AppAuthModule {
  enabled: boolean;
  provider: AuthProvider;
  features?: AppAuthFeatures;
}

export interface AppDatabaseModule {
  enabled: boolean;
  provider: DatabaseProvider;
  extensions?: ("pgvector")[];
}

export interface AppCacheModule {
  enabled: boolean;
  provider: CacheProvider;
}

export interface AppAdminModule {
  enabled: boolean;
  provider: AdminProvider;
  mode?: "generated" | "linked";
}

export interface AppStorageModule {
  enabled: boolean;
  provider: StorageProvider;
  buckets?: BucketDefinition[];
}

export interface AppJobsSchedule {
  id: string;
  cron: string;
}

export interface AppJobsModule {
  enabled: boolean;
  provider: JobsProvider;
  schedules?: AppJobsSchedule[];
}

export interface CustomApiModule {
  id: string;
  enabled: boolean;
  runtime: AppRuntime;
  framework?: CustomApiFramework;
  path: string;
  publicBasePath?: `/${string}`;
  healthcheck?: `/${string}`;
  dependsOn?: AppDependencyRef[];
}

export interface WorkerModule {
  id: string;
  enabled: boolean;
  runtime: AppRuntime;
  kind: WorkerKind;
  path: string;
  dependsOn?: AppDependencyRef[];
}

export interface HubModule {
  enabled: boolean;
  editableSpec?: boolean;
}

export interface ObservabilityModule {
  enabled: boolean;
}

export interface AppModules {
  database: AppDatabaseModule;
  cache?: AppCacheModule;
  auth?: AppAuthModule;
  admin?: AppAdminModule;
  storage?: AppStorageModule;
  jobs?: AppJobsModule;
  customApis?: CustomApiModule[];
  workers?: WorkerModule[];
  hub?: HubModule;
  observability?: ObservabilityModule;
}

export interface ProductField {
  name: string;
  type: ProductFieldType;
  required?: boolean;
  unique?: boolean;
  values?: string[];
  target?: string;
  multiple?: boolean;
}

export interface ProductEntity {
  id: string;
  sourceOfTruth: EntitySourceOfTruth;
  admin: EntityAdminMode;
  api: EntityApiMode;
  ownership: EntityOwnership;
  fields: ProductField[];
}

export interface ProductWorkflow {
  id: string;
  trigger: WorkflowTrigger;
  executor: WorkflowExecutor;
  schedule?: string;
}

export interface ProductTenancy {
  enabled: boolean;
  model: "single" | "workspace" | "org";
}

export interface ProductDefinition {
  roles?: string[];
  tenancy?: ProductTenancy;
  entities?: ProductEntity[];
  workflows?: ProductWorkflow[];
}

export interface AppGeneration {
  scaffoldWeb?: boolean;
  scaffoldAdmin?: boolean;
  scaffoldCustomApis?: boolean;
  scaffoldCustomApiIds?: string[];
  scaffoldWorkers?: boolean;
  scaffoldWorkerIds?: string[];
  realtimeChannels?: GeneratedRealtimeChannel[];
  modulePlans?: GeneratedModulePlan[];
  createTests?: boolean;
}

export interface GeneratedRealtimePresencePlan {
  enabled: boolean;
  scope: RealtimePresenceScope;
  fields?: string[];
}

export interface GeneratedRealtimeEventPlan {
  type: string;
  origin: RealtimeEventOrigin;
  schema: "json";
  description?: string;
}

export interface GeneratedRealtimeChannel {
  id: string;
  source: string;
  transport: RealtimeChannelTransport;
  subscribeAcl: RealtimeSubscribeAcl;
  publishAcl: RealtimePublishAcl;
  ownership?: EntityOwnership;
  ownerField?: string;
  tenantField?: string;
  presence?: GeneratedRealtimePresencePlan;
  events: GeneratedRealtimeEventPlan[];
  notes?: string[];
}

export interface GeneratedApiRoutePlan {
  id: string;
  kind: "authz-crud" | "realtime-sse" | "realtime-websocket";
  method: "get" | "post" | "patch" | "delete" | "ws";
  path: `/${string}`;
  summary: string;
  table?: string;
  channel?: string;
  accessTarget?: "directus-role-permissions" | "directus-filter-permissions" | "custom-api-authz";
  ownership?: EntityOwnership;
  primaryKeyField?: string;
  ownerField?: string;
  tenantField?: string;
  notes?: string[];
}

export interface GeneratedWorkerTaskPlan {
  id: string;
  kind: "realtime-fanout";
  source: string;
  channel: string;
  summary: string;
  notes?: string[];
}

export interface GeneratedModulePlan {
  moduleType: "custom-api" | "worker";
  moduleId: string;
  template: "supabase-core-api" | "supabase-realtime-worker";
  routes?: GeneratedApiRoutePlan[];
  tasks?: GeneratedWorkerTaskPlan[];
  notes?: string[];
}

export interface DashboardDefinition {
  editSpec: boolean;
  showAreas?: DashboardArea[];
  allowRunActions?: DashboardRunAction[];
}

export interface ImportDefinition {
  source: "supabase";
  mode: "scaffold-only" | "partial-migration" | "full-migration";
  projectRef?: string;
  migrate?: {
    auth?: boolean;
    database?: boolean;
    storage?: boolean;
    functions?: "classify";
    env?: boolean;
    secrets?: "map";
  };
  unresolved?: {
    rls?: "report";
    realtime?: "report";
  };
}

export interface AppIdentity {
  id: string;
  name: string;
  archetype: AppArchetype;
  frontend: ProductFrontend;
  starter?: AppStarter;
  resourceProfile?: ResourceProfile;
  providerHint?: ProviderHint;
  description?: string;
  sourceRepo?: string;
}

export interface AppSpecMode {
  enabled: boolean;
  domain?: DomainConfig;
}

export interface AppSpecServerMode extends AppSpecMode {
  target?: PlatformTarget;
  ssh?: SshTarget;
}

export interface AppSpecV2 {
  version: AppSpecVersion;
  app: AppIdentity;
  modes: {
    local: AppSpecMode;
    server: AppSpecServerMode;
  };
  modules: AppModules;
  product?: ProductDefinition;
  generation?: AppGeneration;
  dashboard?: DashboardDefinition;
  import?: ImportDefinition;
}

export interface DirectusCollectionTemplate {
  collection: string;
  fields: DirectusFieldTemplate[];
  meta?: Record<string, unknown>;
}

export interface DirectusFieldTemplate {
  field: string;
  type: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

export interface WindmillFlowTemplate {
  name: string;
  description: string;
  type: "script" | "flow" | "cron";
  schedule?: string;
  language: "typescript" | "python";
  content: string;
}

/** Ploybundle Hub dashboard model (category-first links + optional embeds). */
export interface HubBoardConfig {
  title: string;
  subtitle: string;
  theme: HubThemeConfig;
  sections: HubSectionConfig[];
  apps: HubAppConfig[];
  widgets: HubWidgetConfig[];
  /** Sidebar display name (falls back to formatted project slug if empty). */
  displayName?: string;
  /** Sidebar repository link target. */
  repositoryUrl?: string;
  /** Optional multi-project registry (Phase 6); hub /projects lists these entries. */
  projectsRegistry?: HubProjectRegistryEntry[];
}

/** Entry for optional multi-hub / multi-environment navigation. */
export interface HubProjectRegistryEntry {
  id: string;
  label: string;
  hubUrl: string;
  note?: string;
}

export interface HubThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  opacity: number;
  itemRadius: "xs" | "sm" | "md" | "lg" | "xl";
  customCss?: string;
  logoImageUrl?: string;
  faviconImageUrl?: string;
  backgroundImageUrl?: string;
}

export interface HubSectionConfig {
  /** `overview` is the project home; other kinds are task areas in the hub shell. */
  kind: "category" | "empty" | "overview";
  /** Stable route slug (e.g. `users-access`). Must match `[categoryId]` except `overview` → `/`. */
  id: string;
  title: string;
  /** Shown under the nav label: responsible systems (e.g. "Directus + Postgres"). */
  serviceBadge?: string;
  /** Short line for overview cards. */
  summary?: string;
  collapsed?: boolean;
}

export interface HubAppConfig {
  name: string;
  description: string;
  iconUrl: string;
  href: string;
  pingUrl?: string;
  section: string;
  /** When true, ServiceCard shows an Advanced badge (provider escape hatch). Omit/false for primary product links. */
  providerConsole?: boolean;
}

export interface HubWidgetConfig {
  kind:
    | "iframe"
    /** Large CTA when tools block iframe embedding (Directus, Windmill, …). Use config.href + optional blurb. */
    | "open_link"
    | "app"
    | "bookmarks"
    | "clock"
    | "weather"
    | "systemResources"
    | "systemDisks"
    | "notebook"
    | "healthMonitoring"
    | "coolify";
  section: string;
  title?: string;
  config: Record<string, unknown>;
  grid?: { x: number; y: number; width: number; height: number };
}

/** @deprecated Use HubBoardConfig */
export type HomarrBoardConfig = HubBoardConfig;
/** @deprecated Use HubBoardConfig */
export type HomepageLayoutConfig = HubBoardConfig;
