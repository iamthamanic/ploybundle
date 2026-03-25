// Core domain types for the entire ploybundle system

export type PlatformTarget = "lite" | "full";

export type PresetName = "learning-app" | "crud-saas" | "content-app" | "workflow-app";

export type ProviderHint = "hetzner" | "hostinger" | "generic";

export type ServiceName =
  | "nextjs"
  | "postgres"
  | "redis"
  | "directus"
  | "seaweedfs"
  | "windmill"
  | "homarr";

export type ResourceProfile = "small" | "medium" | "large";

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
  functions?: string;
  deploy?: string;
  dashboard?: string;
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
  homarr: boolean;
}

export interface ProjectConfig {
  projectName: string;
  target: PlatformTarget;
  preset: PresetName;
  domain: DomainConfig;
  ssh: SshTarget;
  email: string;
  services: ServiceToggle;
  buckets: BucketDefinition[];
  directus: DirectusOptions;
  windmill: WindmillOptions;
  resourceProfile: ResourceProfile;
  providerHint: ProviderHint;
}

export interface GeneratedSecrets {
  postgresPassword: string;
  redisPassword: string;
  directusSecret: string;
  directusAdminPassword: string;
  seaweedfsAccessKey: string;
  seaweedfsSecretKey: string;
  windmillSecret: string;
  appSessionSecret: string;
  nextauthSecret: string;
  homarrEncryptionKey: string;
}

export interface SecretsMetadata {
  generated: boolean;
  generatedAt: string;
  rotatedAt?: string;
}

export interface ServiceHealth {
  service: ServiceName;
  healthy: boolean;
  url?: string;
  message?: string;
}

export interface ProjectStatus {
  projectName: string;
  target: PlatformTarget;
  preset: PresetName;
  services: ServiceHealth[];
  urls: ProjectUrls;
  configSummary: Record<string, string>;
}

export interface ProjectUrls {
  app: string;
  admin: string;
  storage: string;
  functions: string;
  deploy: string;
  dashboard: string;
}

export interface ProjectSummary {
  projectName: string;
  target: PlatformTarget;
  preset: PresetName;
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
  readonly target: PlatformTarget;

  validateHost(ssh: SshTarget): Promise<HostDiagnosis>;
  installPlatform(ssh: SshTarget, config: ProjectConfig): Promise<PhaseResult>;
  platformHealth(ssh: SshTarget): Promise<ServiceHealth>;
  deployStack(ssh: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult>;
  updateStack(ssh: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult>;
  destroyStack(ssh: SshTarget, config: ProjectConfig): Promise<PhaseResult>;
  fetchLogs(ssh: SshTarget, config: ProjectConfig, service?: ServiceName): Promise<string>;
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
  homarrConfig: string;
  metadata: Record<string, unknown>;
}

// Preset definition type
export interface PresetDefinition {
  name: PresetName;
  displayName: string;
  description: string;
  services: ServiceToggle;
  buckets: BucketDefinition[];
  directusCollections: DirectusCollectionTemplate[];
  windmillFlows: WindmillFlowTemplate[];
  homarrBoard: HomarrBoardConfig;
  envDefaults: Record<string, string>;
  nextjsFeatures: string[];
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

export interface HomarrBoardConfig {
  title: string;
  subtitle: string;
  theme: HomarrThemeConfig;
  sections: HomarrSectionConfig[];
  apps: HomarrAppConfig[];
  widgets: HomarrWidgetConfig[];
}

export interface HomarrThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  opacity: number;
  itemRadius: "xs" | "sm" | "md" | "lg" | "xl";
  customCss?: string;
  logoImageUrl?: string;
  faviconImageUrl?: string;
  backgroundImageUrl?: string;
}

export interface HomarrSectionConfig {
  kind: "category" | "empty";
  title: string;
  collapsed?: boolean;
}

export interface HomarrAppConfig {
  name: string;
  description: string;
  iconUrl: string;
  href: string;
  pingUrl?: string;
  section: string;
}

export interface HomarrWidgetConfig {
  kind: "iframe" | "app" | "bookmarks" | "clock" | "weather" | "systemResources" | "systemDisks" | "notebook" | "healthMonitoring" | "coolify";
  section: string;
  title?: string;
  config: Record<string, unknown>;
  grid?: { x: number; y: number; width: number; height: number };
}

/** @deprecated Use HomarrBoardConfig */
export type HomepageLayoutConfig = HomarrBoardConfig;
