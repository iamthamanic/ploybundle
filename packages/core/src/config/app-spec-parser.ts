import {
  ConfigError,
  ValidationError,
  buildDomainConfig,
  buildLocalDomainConfig,
  DEFAULT_PROVIDER_HINT,
  DEFAULT_RESOURCE_PROFILE,
  DEFAULT_SERVICE_TOGGLE,
  type AppSpecV2,
  type DirectusCollectionTemplate,
  type DirectusFieldTemplate,
  type PresetName,
  type ProductEntity,
  type ProductField,
  type ProjectConfig,
  type ProjectMode,
  type ScaffoldBlueprint,
  type ServiceToggle,
  type WindmillFlowTemplate,
} from "@ploybundle/shared";
import { appSpecSchema } from "./app-spec-schema.js";

export interface AppSpecMaterializeOptions {
  mode?: string;
  projectRoot?: string;
  projectNameOverride?: string;
}

function defaultLocalSshTarget() {
  return {
    host: "127.0.0.1",
    port: 22,
    user: "root",
  } as const;
}

function resolveRequestedMode(spec: AppSpecV2, requested?: string): ProjectMode {
  if (requested === "local" && spec.modes.local.enabled) return "local";
  if (requested === "server" && spec.modes.server.enabled) return "server";
  if (spec.modes.server.enabled) return "server";
  if (spec.modes.local.enabled) return "local";
  throw new ConfigError("App spec has no enabled runtime modes");
}

function resolveLegacyPreset(spec: AppSpecV2): PresetName {
  switch (spec.app.archetype) {
    case "crud":
      return "crud-saas";
    case "content":
    case "catalog":
      return "content-app";
    case "workflow":
      return "workflow-app";
    case "tool":
      return spec.modules.admin?.enabled ? "crud-saas" : "workflow-app";
    case "studio":
    case "agent-platform":
    case "custom":
      return spec.modules.admin?.enabled ? "crud-saas" : "workflow-app";
    default:
      return "learning-app";
  }
}

function directusFieldType(field: ProductField): string {
  switch (field.type) {
    case "text":
      return "text";
    case "number":
      return "integer";
    case "boolean":
      return "boolean";
    case "date":
      return "date";
    case "datetime":
      return "timestamp";
    case "json":
      return "json";
    case "file":
      return "uuid";
    case "enum":
      return "string";
    case "relation":
      return "string";
    default:
      return "string";
  }
}

function directusFieldMeta(field: ProductField): Record<string, unknown> | undefined {
  if (field.type === "enum" && field.values?.length) {
    return {
      interface: "select-dropdown",
      options: {
        choices: field.values.map((value) => ({ text: value, value })),
      },
    };
  }
  return undefined;
}

function buildDirectusFields(entity: ProductEntity): DirectusFieldTemplate[] {
  return entity.fields.map((field) => ({
    field: field.name,
    type: directusFieldType(field),
    meta: directusFieldMeta(field),
    schema: field.required ? { is_nullable: false } : undefined,
  }));
}

function buildGeneratedCollections(spec: AppSpecV2): DirectusCollectionTemplate[] {
  if (!spec.modules.admin?.enabled) return [];
  return (spec.product?.entities ?? [])
    .filter((entity) => entity.admin === "generated")
    .map((entity) => ({
      collection: entity.id,
      fields: buildDirectusFields(entity),
      meta: {
        icon: "box",
        note: `Generated from AppSpec v2 entity ${entity.id}`,
      },
    }));
}

function buildWorkflowContent(name: string, executor: string): string {
  return `export async function main() {
  console.log(${JSON.stringify(`Executing ${name} via ${executor}`)});
  return {
    workflow: ${JSON.stringify(name)},
    executor: ${JSON.stringify(executor)},
    status: "placeholder"
  };
}
`;
}

function buildGeneratedFlows(spec: AppSpecV2): WindmillFlowTemplate[] {
  const flows: WindmillFlowTemplate[] = [];

  for (const schedule of spec.modules.jobs?.schedules ?? []) {
    flows.push({
      name: schedule.id,
      description: `Scheduled job ${schedule.id} generated from AppSpec v2`,
      type: "cron",
      schedule: schedule.cron,
      language: "typescript",
      content: buildWorkflowContent(schedule.id, `job:${schedule.id}`),
    });
  }

  for (const workflow of spec.product?.workflows ?? []) {
    flows.push({
      name: workflow.id,
      description: `Workflow ${workflow.id} generated from AppSpec v2`,
      type: workflow.trigger === "schedule" ? "cron" : "script",
      schedule: workflow.trigger === "schedule" ? workflow.schedule : undefined,
      language: "typescript",
      content: buildWorkflowContent(workflow.id, workflow.executor),
    });
  }

  return flows;
}

function buildNextjsFeatures(spec: AppSpecV2): string[] {
  const features: string[] = [`archetype-${spec.app.archetype}`];

  if (spec.modules.auth?.enabled) features.push("directus-auth");
  if (spec.modules.database.enabled) features.push("postgres-data");
  if (spec.modules.storage?.enabled) features.push("seaweedfs-storage");
  if (spec.modules.jobs?.enabled) features.push("windmill-jobs");
  if ((spec.modules.customApis ?? []).length > 0) features.push("custom-api");
  if ((spec.modules.workers ?? []).length > 0) features.push("workers");
  if (spec.product?.tenancy?.enabled) features.push(`${spec.product.tenancy.model}-tenancy`);

  return features;
}

function buildScaffoldBlueprint(spec: AppSpecV2): ScaffoldBlueprint {
  const buckets =
    spec.modules.storage?.enabled
      ? spec.modules.storage.buckets ?? [{ name: "assets", public: false }]
      : [];

  return {
    name: spec.app.id,
    displayName: spec.app.name,
    description: spec.app.description ?? `${spec.app.archetype} app generated from AppSpec v2`,
    buckets,
    directusCollections: buildGeneratedCollections(spec),
    windmillFlows: buildGeneratedFlows(spec),
    envDefaults: {
      PLOYBUNDLE_APP_SPEC_VERSION: "2",
      PLOYBUNDLE_APP_ARCHETYPE: spec.app.archetype,
      PLOYBUNDLE_BLUEPRINT_ID: spec.app.id,
    },
    nextjsFeatures: buildNextjsFeatures(spec),
  };
}

function deriveServiceToggle(spec: AppSpecV2): ServiceToggle {
  const directusEnabled = Boolean(spec.modules.auth?.enabled || spec.modules.admin?.enabled);
  const redisEnabled = Boolean(spec.modules.cache?.enabled || directusEnabled || spec.modules.jobs?.enabled);

  return {
    ...DEFAULT_SERVICE_TOGGLE,
    nextjs: true,
    postgres: spec.modules.database.enabled,
    redis: redisEnabled,
    directus: directusEnabled,
    seaweedfs: Boolean(spec.modules.storage?.enabled),
    windmill: Boolean(spec.modules.jobs?.enabled),
    hub: spec.modules.hub?.enabled ?? true,
    adminer: false,
  };
}

function deriveEmail(spec: AppSpecV2, mode: ProjectMode, domainRoot: string): string {
  if (mode === "local") {
    return `admin@${spec.app.id}.local`;
  }
  return `admin@${domainRoot}`;
}

export function isAppSpecV2Candidate(input: Record<string, unknown>): boolean {
  return input.version === 2 && typeof input.app === "object" && input.app !== null && typeof input.modules === "object" && input.modules !== null;
}

export function parseAndValidateAppSpec(input: Record<string, unknown>): AppSpecV2 {
  const result = appSpecSchema.safeParse(input);

  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join(".")] = issue.message;
    }
    throw new ValidationError(
      "Invalid app spec",
      fields,
      `Check your ploybundle.yaml. Issues: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(", ")}`
    );
  }

  return result.data as AppSpecV2;
}

export function materializeProjectConfigFromAppSpec(
  spec: AppSpecV2,
  options: AppSpecMaterializeOptions = {}
): ProjectConfig {
  if (options.projectNameOverride && options.projectNameOverride !== spec.app.id) {
    throw new ValidationError(
      "Project name does not match app spec",
      { projectName: `Expected ${spec.app.id} but received ${options.projectNameOverride}` },
      "Use the app.id from the spec or rename the spec before deploying."
    );
  }

  const mode = resolveRequestedMode(spec, options.mode);
  const projectRoot = options.projectRoot ?? process.cwd();
  const domain =
    mode === "local"
      ? buildLocalDomainConfig(spec.modes.local.domain)
      : buildDomainConfig(spec.modes.server.domain?.root ?? "", spec.modes.server.domain);
  const email = deriveEmail(spec, mode, domain.root);
  const services = deriveServiceToggle(spec);
  const template = buildScaffoldBlueprint(spec);
  const preset = resolveLegacyPreset(spec);

  const config: ProjectConfig = {
    projectName: spec.app.id,
    mode,
    target: mode === "server" ? spec.modes.server.target : undefined,
    preset,
    template,
    frontend: spec.app.frontend,
    domain,
    ssh: mode === "local" ? { ...defaultLocalSshTarget() } : {
      host: spec.modes.server.ssh?.host ?? "",
      port: spec.modes.server.ssh?.port ?? 22,
      user: spec.modes.server.ssh?.user ?? "root",
      privateKeyPath: spec.modes.server.ssh?.privateKeyPath,
    },
    projectRoot,
    email,
    services,
    buckets: template.buckets,
    directus: {
      adminEmail: email,
      collections: template.directusCollections.map((collection) => collection.collection),
    },
    windmill: {
      workspace: spec.app.id,
      exampleFlows: template.windmillFlows.length > 0,
    },
    resourceProfile: spec.app.resourceProfile ?? DEFAULT_RESOURCE_PROFILE,
    providerHint: spec.app.providerHint ?? DEFAULT_PROVIDER_HINT,
  };

  (config as ProjectConfig & { appSpec?: AppSpecV2 }).appSpec = spec;
  return config;
}
