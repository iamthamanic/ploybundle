import { z } from "zod";
import {
  VALID_APP_ARCHETYPES,
  VALID_CUSTOM_API_FRAMEWORKS,
  VALID_DASHBOARD_AREAS,
  VALID_DASHBOARD_RUN_ACTIONS,
  VALID_PRODUCT_FRONTENDS,
  VALID_PROVIDER_HINTS,
  VALID_REALTIME_CHANNEL_TRANSPORTS,
  VALID_REALTIME_EVENT_ORIGINS,
  VALID_REALTIME_PRESENCE_SCOPES,
  VALID_REALTIME_PUBLISH_ACLS,
  VALID_REALTIME_SUBSCRIBE_ACLS,
  VALID_RESOURCE_PROFILES,
  VALID_TARGETS,
  VALID_APP_RUNTIMES,
  VALID_WORKER_KINDS,
} from "@ploybundle/shared";

const idPattern = /^[a-z][a-z0-9_-]{0,62}$/;
const relativePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+/;

const idSchema = z.string().regex(idPattern, "IDs must be lowercase and start with a letter");

const sshTargetSchema = z.object({
  host: z.string().min(1).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1).optional(),
  privateKeyPath: z.string().optional(),
});

const domainConfigSchema = z.object({
  root: z.string().min(1).optional(),
  app: z.string().optional(),
  admin: z.string().optional(),
  storage: z.string().optional(),
  storageBrowser: z.string().optional(),
  databaseBrowser: z.string().optional(),
  functions: z.string().optional(),
  deploy: z.string().optional(),
  dashboard: z.string().optional(),
  scheme: z.enum(["http", "https"]).optional(),
});

const bucketDefinitionSchema = z.object({
  name: idSchema,
  public: z.boolean().optional(),
});

const dependencyRefSchema = z.string().regex(
  /^(database|cache|auth|storage|jobs|custom-api:[a-z][a-z0-9-]{1,62}|worker:[a-z][a-z0-9-]{1,62})$/,
  "Invalid dependency reference"
);

const customApiSchema = z.object({
  id: idSchema,
  enabled: z.boolean(),
  runtime: z.enum(VALID_APP_RUNTIMES as unknown as [string, ...string[]]),
  framework: z.enum(VALID_CUSTOM_API_FRAMEWORKS as unknown as [string, ...string[]]).optional(),
  path: z.string().regex(relativePathPattern, "Custom API path must be a relative repo path"),
  publicBasePath: z.string().startsWith("/").optional(),
  healthcheck: z.string().startsWith("/").optional(),
  dependsOn: z.array(dependencyRefSchema).optional(),
});

const workerSchema = z.object({
  id: idSchema,
  enabled: z.boolean(),
  runtime: z.enum(VALID_APP_RUNTIMES as unknown as [string, ...string[]]),
  kind: z.enum(VALID_WORKER_KINDS as unknown as [string, ...string[]]),
  path: z.string().regex(relativePathPattern, "Worker path must be a relative repo path"),
  dependsOn: z.array(dependencyRefSchema).optional(),
});

const generatedApiRoutePlanSchema = z.object({
  id: idSchema,
  kind: z.enum(["authz-crud", "realtime-sse", "realtime-websocket"]),
  method: z.enum(["get", "post", "patch", "delete", "ws"]),
  path: z.string().startsWith("/"),
  summary: z.string().min(1),
  table: idSchema.optional(),
  channel: idSchema.optional(),
  accessTarget: z.enum(["directus-role-permissions", "directus-filter-permissions", "custom-api-authz"]).optional(),
  ownership: z.enum(["global", "user", "team"]).optional(),
  primaryKeyField: idSchema.optional(),
  ownerField: idSchema.optional(),
  tenantField: idSchema.optional(),
  notes: z.array(z.string().min(1)).optional(),
});

const generatedWorkerTaskPlanSchema = z.object({
  id: idSchema,
  kind: z.literal("realtime-fanout"),
  source: z.string().min(1),
  channel: idSchema,
  summary: z.string().min(1),
  notes: z.array(z.string().min(1)).optional(),
});

const generatedRealtimePresenceSchema = z.object({
  enabled: z.boolean(),
  scope: z.enum(VALID_REALTIME_PRESENCE_SCOPES as unknown as [string, ...string[]]),
  fields: z.array(idSchema).optional(),
});

const generatedRealtimeEventSchema = z.object({
  type: idSchema,
  origin: z.enum(VALID_REALTIME_EVENT_ORIGINS as unknown as [string, ...string[]]),
  schema: z.literal("json"),
  description: z.string().min(1).optional(),
});

const generatedRealtimeChannelSchema = z.object({
  id: idSchema,
  source: z.string().min(1),
  transport: z.enum(VALID_REALTIME_CHANNEL_TRANSPORTS as unknown as [string, ...string[]]),
  subscribeAcl: z.enum(VALID_REALTIME_SUBSCRIBE_ACLS as unknown as [string, ...string[]]),
  publishAcl: z.enum(VALID_REALTIME_PUBLISH_ACLS as unknown as [string, ...string[]]),
  ownership: z.enum(["global", "user", "team"]).optional(),
  ownerField: idSchema.optional(),
  tenantField: idSchema.optional(),
  presence: generatedRealtimePresenceSchema.optional(),
  events: z.array(generatedRealtimeEventSchema).min(1),
  notes: z.array(z.string().min(1)).optional(),
});

const generatedModulePlanSchema = z.object({
  moduleType: z.enum(["custom-api", "worker"]),
  moduleId: idSchema,
  template: z.enum(["supabase-core-api", "supabase-realtime-worker"]),
  routes: z.array(generatedApiRoutePlanSchema).optional(),
  tasks: z.array(generatedWorkerTaskPlanSchema).optional(),
  notes: z.array(z.string().min(1)).optional(),
});

const productFieldSchema = z.object({
  name: idSchema,
  type: z.enum([
    "string",
    "text",
    "number",
    "boolean",
    "date",
    "datetime",
    "json",
    "enum",
    "relation",
    "file",
  ]),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  values: z.array(idSchema).optional(),
  target: idSchema.optional(),
  multiple: z.boolean().optional(),
});

const productEntitySchema = z.object({
  id: idSchema,
  sourceOfTruth: z.enum(["database", "admin"]),
  admin: z.enum(["generated", "custom", "none"]),
  api: z.string().regex(/^(generated|none|custom-api:[a-z][a-z0-9-]{1,62})$/, "Invalid entity api mode"),
  ownership: z.enum(["global", "user", "team"]),
  fields: z.array(productFieldSchema),
});

const workflowSchema = z.object({
  id: idSchema,
  trigger: z.enum(["manual", "api", "schedule", "event"]),
  executor: z.string().regex(
    /^(worker:[a-z][a-z0-9-]{1,62}|custom-api:[a-z][a-z0-9-]{1,62}|job:[a-z][a-z0-9-]{1,62})$/,
    "Invalid workflow executor"
  ),
  schedule: z.string().optional(),
});

const appSpecModeSchema = z.object({
  enabled: z.boolean(),
  domain: domainConfigSchema.optional(),
});

const appSpecServerModeSchema = appSpecModeSchema.extend({
  target: z.enum(VALID_TARGETS as unknown as [string, ...string[]]).optional(),
  ssh: sshTargetSchema.optional(),
});

function validateUniqueIds(values: Array<{ id: string }> | undefined, path: (string | number)[], ctx: z.RefinementCtx): void {
  if (!values) return;
  const seen = new Set<string>();
  for (let index = 0; index < values.length; index++) {
    const value = values[index]!;
    if (seen.has(value.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index, "id"],
        message: `Duplicate id: ${value.id}`,
      });
    }
    seen.add(value.id);
  }
}

export const appSpecSchema = z.object({
  version: z.literal(2),
  app: z.object({
    id: idSchema,
    name: z.string().min(1),
    archetype: z.enum(VALID_APP_ARCHETYPES as unknown as [string, ...string[]]),
    frontend: z.enum(VALID_PRODUCT_FRONTENDS as unknown as [string, ...string[]]),
    starter: z.enum(["greenfield", "import"]).optional(),
    resourceProfile: z.enum(VALID_RESOURCE_PROFILES as unknown as [string, ...string[]]).optional(),
    providerHint: z.enum(VALID_PROVIDER_HINTS as unknown as [string, ...string[]]).optional(),
    description: z.string().optional(),
    sourceRepo: z.string().url().optional(),
  }),
  modes: z.object({
    local: appSpecModeSchema,
    server: appSpecServerModeSchema,
  }),
  modules: z.object({
    database: z.object({
      enabled: z.boolean(),
      provider: z.literal("postgres"),
      extensions: z.array(z.literal("pgvector")).optional(),
    }),
    cache: z.object({
      enabled: z.boolean(),
      provider: z.literal("redis"),
    }).optional(),
    auth: z.object({
      enabled: z.boolean(),
      provider: z.literal("directus"),
      features: z.object({
        emailPassword: z.boolean().optional(),
        oauth: z.array(z.enum(["github", "google"])).optional(),
        invitations: z.boolean().optional(),
        apiTokens: z.boolean().optional(),
      }).optional(),
    }).optional(),
    admin: z.object({
      enabled: z.boolean(),
      provider: z.literal("directus"),
      mode: z.enum(["generated", "linked"]).optional(),
    }).optional(),
    storage: z.object({
      enabled: z.boolean(),
      provider: z.literal("seaweedfs"),
      buckets: z.array(bucketDefinitionSchema).optional(),
    }).optional(),
    jobs: z.object({
      enabled: z.boolean(),
      provider: z.literal("windmill"),
      schedules: z.array(z.object({
        id: idSchema,
        cron: z.string().min(1),
      })).optional(),
    }).optional(),
    customApis: z.array(customApiSchema).optional(),
    workers: z.array(workerSchema).optional(),
    hub: z.object({
      enabled: z.boolean(),
      editableSpec: z.boolean().optional(),
    }).optional(),
    observability: z.object({
      enabled: z.boolean(),
    }).optional(),
  }),
  product: z.object({
    roles: z.array(idSchema).optional(),
    tenancy: z.object({
      enabled: z.boolean(),
      model: z.enum(["single", "workspace", "org"]),
    }).optional(),
    entities: z.array(productEntitySchema).optional(),
    workflows: z.array(workflowSchema).optional(),
  }).optional(),
  generation: z.object({
    scaffoldWeb: z.boolean().optional(),
    scaffoldAdmin: z.boolean().optional(),
    scaffoldCustomApis: z.boolean().optional(),
    scaffoldCustomApiIds: z.array(idSchema).optional(),
    scaffoldWorkers: z.boolean().optional(),
    scaffoldWorkerIds: z.array(idSchema).optional(),
    realtimeChannels: z.array(generatedRealtimeChannelSchema).optional(),
    modulePlans: z.array(generatedModulePlanSchema).optional(),
    createTests: z.boolean().optional(),
  }).optional(),
  dashboard: z.object({
    editSpec: z.boolean(),
    showAreas: z.array(z.enum(VALID_DASHBOARD_AREAS as unknown as [string, ...string[]])).optional(),
    allowRunActions: z.array(z.enum(VALID_DASHBOARD_RUN_ACTIONS as unknown as [string, ...string[]])).optional(),
  }).optional(),
  import: z.object({
    source: z.literal("supabase"),
    mode: z.enum(["scaffold-only", "partial-migration", "full-migration"]),
    projectRef: z.string().optional(),
    migrate: z.object({
      auth: z.boolean().optional(),
      database: z.boolean().optional(),
      storage: z.boolean().optional(),
      functions: z.literal("classify").optional(),
      env: z.boolean().optional(),
      secrets: z.literal("map").optional(),
    }).optional(),
    unresolved: z.object({
      rls: z.literal("report").optional(),
      realtime: z.literal("report").optional(),
    }).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (!value.modes.local.enabled && !value.modes.server.enabled) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["modes"],
      message: "At least one runtime mode must be enabled",
    });
  }

  if (value.modes.server.enabled) {
    if (!value.modes.server.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modes", "server", "target"],
        message: "Server mode requires a target",
      });
    }
    if (!value.modes.server.domain?.root) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modes", "server", "domain", "root"],
        message: "Server mode requires a root domain",
      });
    }
    if (!value.modes.server.ssh?.host || !value.modes.server.ssh?.user) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modes", "server", "ssh"],
        message: "Server mode requires SSH host and user",
      });
    }
  }

  if (value.app.starter === "import" && !value.import) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["import"],
      message: "Import starter requires an import block",
    });
  }

  validateUniqueIds(value.modules.customApis, ["modules", "customApis"], ctx);
  validateUniqueIds(value.modules.workers, ["modules", "workers"], ctx);
  validateUniqueIds(value.product?.entities, ["product", "entities"], ctx);
  validateUniqueIds(value.product?.workflows, ["product", "workflows"], ctx);
  validateUniqueIds(value.modules.jobs?.schedules, ["modules", "jobs", "schedules"], ctx);
  validateUniqueIds(value.generation?.realtimeChannels, ["generation", "realtimeChannels"], ctx);

  if (value.product?.entities?.length && !value.modules.database.enabled) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["modules", "database", "enabled"],
      message: "Product entities require the database module",
    });
  }

  if (value.modules.auth?.enabled && (!value.product?.roles || value.product.roles.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["product", "roles"],
      message: "Auth-enabled apps must define at least one role",
    });
  }

  const adminEnabled = Boolean(value.modules.admin?.enabled && value.modules.admin.provider === "directus");
  const entityIds = new Set(value.product?.entities?.map((entity) => entity.id) ?? []);
  const customApiIds = new Set(value.modules.customApis?.map((api) => api.id) ?? []);
  const workerIds = new Set(value.modules.workers?.map((worker) => worker.id) ?? []);
  const scheduleIds = new Set(value.modules.jobs?.schedules?.map((schedule) => schedule.id) ?? []);
  const scaffoldCustomApiIds = value.generation?.scaffoldCustomApiIds ?? [];
  const scaffoldWorkerIds = value.generation?.scaffoldWorkerIds ?? [];
  const realtimeChannels = value.generation?.realtimeChannels ?? [];
  const realtimeChannelIds = new Set(realtimeChannels.map((channel) => channel.id));
  const modulePlans = value.generation?.modulePlans ?? [];

  for (const [entityIndex, entity] of (value.product?.entities ?? []).entries()) {
    if ((entity.admin === "generated" || entity.api === "generated") && !adminEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product", "entities", entityIndex, "admin"],
        message: "Generated admin or API entities require Directus admin mode",
      });
    }

    for (const [fieldIndex, field] of entity.fields.entries()) {
      if (field.type === "enum" && (!field.values || new Set(field.values).size !== field.values.length || field.values.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["product", "entities", entityIndex, "fields", fieldIndex, "values"],
          message: "Enum fields require unique values",
        });
      }

      if (field.type === "relation" && (!field.target || !entityIds.has(field.target))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["product", "entities", entityIndex, "fields", fieldIndex, "target"],
          message: "Relation fields require a valid target entity",
        });
      }
    }
  }

  const validDependencies = new Set<string>([
    "database",
    "cache",
    "auth",
    "storage",
    "jobs",
    ...[...customApiIds].map((id) => `custom-api:${id}`),
    ...[...workerIds].map((id) => `worker:${id}`),
  ]);

  for (const [apiIndex, api] of (value.modules.customApis ?? []).entries()) {
    const dependencies = api.dependsOn ?? [];
    if (new Set(dependencies).size !== dependencies.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modules", "customApis", apiIndex, "dependsOn"],
        message: "Custom API dependencies must be unique",
      });
    }
    for (const dependency of dependencies) {
      if (!validDependencies.has(dependency)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["modules", "customApis", apiIndex, "dependsOn"],
          message: `Unknown dependency: ${dependency}`,
        });
      }
    }
  }

  for (const [workerIndex, worker] of (value.modules.workers ?? []).entries()) {
    const dependencies = worker.dependsOn ?? [];
    if (new Set(dependencies).size !== dependencies.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modules", "workers", workerIndex, "dependsOn"],
        message: "Worker dependencies must be unique",
      });
    }
    for (const dependency of dependencies) {
      if (!validDependencies.has(dependency)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["modules", "workers", workerIndex, "dependsOn"],
          message: `Unknown dependency: ${dependency}`,
        });
      }
    }
  }

  for (const [workflowIndex, workflow] of (value.product?.workflows ?? []).entries()) {
    if (workflow.trigger === "schedule" && !workflow.schedule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product", "workflows", workflowIndex, "schedule"],
        message: "Scheduled workflows require a schedule",
      });
    }

    if (workflow.executor.startsWith("custom-api:") && !customApiIds.has(workflow.executor.slice("custom-api:".length))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product", "workflows", workflowIndex, "executor"],
        message: `Unknown custom API executor: ${workflow.executor}`,
      });
    }
    if (workflow.executor.startsWith("worker:") && !workerIds.has(workflow.executor.slice("worker:".length))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product", "workflows", workflowIndex, "executor"],
        message: `Unknown worker executor: ${workflow.executor}`,
      });
    }
    if (workflow.executor.startsWith("job:") && !scheduleIds.has(workflow.executor.slice("job:".length))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["product", "workflows", workflowIndex, "executor"],
        message: `Unknown job executor: ${workflow.executor}`,
      });
    }
  }

  if (new Set(scaffoldCustomApiIds).size !== scaffoldCustomApiIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["generation", "scaffoldCustomApiIds"],
      message: "scaffoldCustomApiIds must be unique",
    });
  }
  for (const moduleId of scaffoldCustomApiIds) {
    if (!customApiIds.has(moduleId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "scaffoldCustomApiIds"],
        message: `Unknown custom API module id: ${moduleId}`,
      });
    }
  }

  if (new Set(scaffoldWorkerIds).size !== scaffoldWorkerIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["generation", "scaffoldWorkerIds"],
      message: "scaffoldWorkerIds must be unique",
    });
  }
  for (const moduleId of scaffoldWorkerIds) {
    if (!workerIds.has(moduleId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "scaffoldWorkerIds"],
        message: `Unknown worker module id: ${moduleId}`,
      });
    }
  }

  for (const [channelIndex, channel] of realtimeChannels.entries()) {
    const eventTypes = channel.events.map((event) => event.type);
    if (new Set(eventTypes).size !== eventTypes.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "realtimeChannels", channelIndex, "events"],
        message: "Realtime channel event types must be unique",
      });
    }
    if (channel.ownership === "user" && !channel.ownerField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "realtimeChannels", channelIndex, "ownerField"],
        message: "User-owned realtime channels require an ownerField",
      });
    }
    if (channel.ownership === "team" && !channel.tenantField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "realtimeChannels", channelIndex, "tenantField"],
        message: "Team-owned realtime channels require a tenantField",
      });
    }
  }

  const seenModulePlans = new Set<string>();
  for (const [index, plan] of modulePlans.entries()) {
    const key = `${plan.moduleType}:${plan.moduleId}`;
    if (seenModulePlans.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "moduleId"],
        message: `Duplicate generated module plan: ${key}`,
      });
    }
    seenModulePlans.add(key);

    if (plan.moduleType === "custom-api" && !customApiIds.has(plan.moduleId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "moduleId"],
        message: `Generated module plan references unknown custom API: ${plan.moduleId}`,
      });
    }
    if (plan.moduleType === "worker" && !workerIds.has(plan.moduleId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "moduleId"],
        message: `Generated module plan references unknown worker: ${plan.moduleId}`,
      });
    }
    if (plan.moduleType === "custom-api" && plan.template === "supabase-realtime-worker") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "template"],
        message: "Worker template cannot target a custom API module",
      });
    }
    if (plan.moduleType === "worker" && plan.template === "supabase-core-api") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "template"],
        message: "Custom API template cannot target a worker module",
      });
    }
    if (plan.moduleType === "custom-api" && (!plan.routes || plan.routes.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "routes"],
        message: "Custom API module plans require at least one route",
      });
    }
    if (plan.moduleType === "worker" && (!plan.tasks || plan.tasks.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generation", "modulePlans", index, "tasks"],
        message: "Worker module plans require at least one task",
      });
    }

    for (const [routeIndex, route] of (plan.routes ?? []).entries()) {
      if ((route.kind === "realtime-sse" || route.kind === "realtime-websocket") && !route.channel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["generation", "modulePlans", index, "routes", routeIndex, "channel"],
          message: "Realtime routes must reference a realtime channel",
        });
      }
      if (route.channel && !realtimeChannelIds.has(route.channel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["generation", "modulePlans", index, "routes", routeIndex, "channel"],
          message: `Realtime route references unknown channel: ${route.channel}`,
        });
      }
      const channel = route.channel ? realtimeChannels.find((entry) => entry.id === route.channel) : undefined;
      if (route.kind === "realtime-sse" && channel && channel.transport !== "sse" && channel.transport !== "hybrid") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["generation", "modulePlans", index, "routes", routeIndex, "channel"],
          message: `Realtime channel ${route.channel} does not support SSE transport`,
        });
      }
      if (
        route.kind === "realtime-websocket" &&
        channel &&
        channel.transport !== "websocket" &&
        channel.transport !== "hybrid"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["generation", "modulePlans", index, "routes", routeIndex, "channel"],
          message: `Realtime channel ${route.channel} does not support WebSocket transport`,
        });
      }
    }

    for (const [taskIndex, task] of (plan.tasks ?? []).entries()) {
      if (!realtimeChannelIds.has(task.channel)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["generation", "modulePlans", index, "tasks", taskIndex, "channel"],
          message: `Realtime worker task references unknown channel: ${task.channel}`,
        });
      }
    }
  }
});

export type AppSpecInput = z.input<typeof appSpecSchema>;
export type AppSpecParsed = z.output<typeof appSpecSchema>;
