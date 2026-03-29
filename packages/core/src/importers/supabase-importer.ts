import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type {
  AppArchetype,
  AppSpecV2,
  ProductEntity,
  ProductField,
  ProductFrontend,
  WorkerModule,
  CustomApiModule,
  GeneratedModulePlan,
  GeneratedRealtimeChannel,
} from "@ploybundle/shared";
import { ConfigError, maskSecret, slugify, timestampNow } from "@ploybundle/shared";

export interface SupabaseImportOptions {
  sourceRoot: string;
  outputPath?: string;
  projectName?: string;
  appName?: string;
  frontend?: ProductFrontend;
  projectRef?: string;
  server?: {
    rootDomain?: string;
    host?: string;
    user?: string;
    target?: "lite" | "full";
  };
}

export interface ImportedFunction {
  name: string;
  sourcePath: string;
  classification: "custom-api" | "worker" | "job-like";
  targetPath: string;
  runtime: "deno";
}

export interface EnvVariableMigrationReport {
  key: string;
  sourcePath: string;
  visibility: "public" | "publishable" | "secret" | "runtime";
  recommendedTarget: "frontend-env" | "platform-secret" | "runtime-env" | "manual-review";
  replacementHint?: string;
  valuePreview: string;
}

export interface EnvMigrationReport {
  variables: EnvVariableMigrationReport[];
  warnings: string[];
}

export interface SecretsMigrationReport {
  keys: string[];
  warnings: string[];
}

export interface RlsPolicyReport {
  name: string;
  table: string;
  command: string;
  roles: string[];
  usingExpression?: string;
  withCheckExpression?: string;
}

export interface RlsTableStrategy {
  table: string;
  accessPatterns: Array<"public" | "authenticated" | "owner-scoped" | "tenant-scoped" | "custom">;
  commands: string[];
  relatedPolicies: string[];
  recommendedTarget: "directus-role-permissions" | "directus-filter-permissions" | "custom-api-authz";
  recommendedOwnership: ProductEntity["ownership"];
  generatedCrudReadiness: "safe" | "review" | "avoid";
  notes: string[];
}

export interface RlsMigrationReport {
  enabledTables: string[];
  policies: RlsPolicyReport[];
  tableStrategies: RlsTableStrategy[];
  warnings: string[];
}

export interface RealtimeCodeReference {
  sourcePath: string;
  pattern: string;
}

export interface RealtimeStrategy {
  scope: string;
  detectedFrom: "sql-publication" | "code-reference";
  usage: "table-subscription" | "channel-broadcast" | "channel-session" | "event-fanout";
  recommendedTarget: "custom-api-sse" | "custom-api-websocket" | "worker-event-pipeline";
  notes: string[];
}

export interface RealtimeMigrationReport {
  publicationTables: string[];
  codeReferences: RealtimeCodeReference[];
  strategies: RealtimeStrategy[];
  warnings: string[];
}

export interface SupabaseMigrationReport {
  generatedAt: string;
  sourceRoot: string;
  env: EnvMigrationReport;
  secrets: SecretsMigrationReport;
  rls: RlsMigrationReport;
  realtime: RealtimeMigrationReport;
  unresolved: string[];
  recommendations: string[];
}

export interface SupabaseImportResult {
  spec: AppSpecV2;
  outputPath: string;
  reportPath: string;
  entities: ProductEntity[];
  functions: ImportedFunction[];
  report: SupabaseMigrationReport;
  warnings: string[];
}

const SYSTEM_TABLES = new Set([
  "_prisma_migrations",
  "schema_migrations",
  "spatial_ref_sys",
]);

const IGNORED_WALK_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".next",
  "coverage",
]);

const ENV_FILE_PATTERN = /^\.env(?:\..+)?$/;
const OWNER_FIELD_HINT_PATTERN = /\b(owner_id|user_id|created_by(?:_id)?|author_id|profile_id)\b/i;
const TENANT_FIELD_HINT_PATTERN = /\b(team_id|org_id|organization_id|workspace_id|tenant_id|account_id|company_id)\b/i;

async function walkFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_WALK_DIRS.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function mapSqlType(sqlType: string): ProductField["type"] {
  const normalized = sqlType.toLowerCase();
  if (normalized.includes("json")) return "json";
  if (normalized.includes("timestamp")) return "datetime";
  if (normalized.includes("date")) return "date";
  if (normalized.includes("bool")) return "boolean";
  if (normalized.includes("int") || normalized.includes("numeric") || normalized.includes("decimal") || normalized.includes("real") || normalized.includes("double")) {
    return "number";
  }
  if (normalized.includes("text")) return "text";
  return "string";
}

function splitColumnLines(body: string): string[] {
  const lines: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      if (current.trim()) lines.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

function parseColumn(line: string): ProductField | null {
  const trimmed = line.replace(/,$/, "").trim();
  if (!trimmed) return null;
  if (/^(constraint|primary key|foreign key|unique|check)\b/i.test(trimmed)) return null;

  const match = trimmed.match(/^"?(?<name>[a-zA-Z_][\w]*)"?\s+(?<type>.+)$/);
  if (!match?.groups?.name || !match.groups.type) return null;

  const fieldName = match.groups.name.toLowerCase();
  const sqlType = match.groups.type;
  const relationMatch = sqlType.match(/references\s+(?:public\.)?"?([a-zA-Z_][\w]*)"?/i);

  if (relationMatch?.[1]) {
    return {
      name: fieldName,
      type: "relation",
      target: relationMatch[1].toLowerCase(),
      required: /\bnot null\b/i.test(sqlType),
      unique: /\bunique\b/i.test(sqlType),
    };
  }

  return {
    name: fieldName,
    type: mapSqlType(sqlType),
    required: /\bnot null\b/i.test(sqlType),
    unique: /\bunique\b/i.test(sqlType),
  };
}

function parseCreateTables(sql: string): ProductEntity[] {
  const entities: ProductEntity[] = [];
  const regex = /create table(?: if not exists)?\s+(?:(?:public|auth)\.)?"?([a-zA-Z_][\w]*)"?\s*\(([\s\S]*?)\);/gi;

  for (const match of sql.matchAll(regex)) {
    const tableName = match[1]?.toLowerCase();
    const body = match[2];
    if (!tableName || !body || SYSTEM_TABLES.has(tableName) || tableName.startsWith("pg_")) continue;
    if (tableName.startsWith("auth.") || tableName.startsWith("storage.")) continue;

    const fields = splitColumnLines(body)
      .map((line) => parseColumn(line))
      .filter((field): field is ProductField => field !== null);

    if (fields.length === 0) continue;

    entities.push({
      id: tableName,
      sourceOfTruth: "database",
      admin: "generated",
      api: "none",
      ownership: "team",
      fields,
    });
  }

  return entities;
}

function classifyFunction(name: string): ImportedFunction["classification"] {
  const normalized = name.toLowerCase();
  if (/(worker|queue|processor|preview|runner)/.test(normalized)) return "worker";
  if (/(cron|schedule|daily|nightly|cleanup|aggregate|sync)/.test(normalized)) return "job-like";
  return "custom-api";
}

async function detectStorageUsage(sourceRoot: string): Promise<boolean> {
  const supabaseDir = path.join(sourceRoot, "supabase");
  if (!existsSync(supabaseDir)) return false;

  for (const candidate of [path.join(supabaseDir, "migrations"), path.join(supabaseDir, "functions")]) {
    for (const fullPath of await walkFiles(candidate)) {
      const content = await readFile(fullPath, "utf8");
      if (content.includes("storage.from(") || content.includes("storage.")) {
        return true;
      }
    }
  }

  return false;
}

async function listFunctionDirectories(functionsRoot: string): Promise<string[]> {
  if (!existsSync(functionsRoot)) return [];
  const entries = await readdir(functionsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function detectFunctionEntrypoint(functionRoot: string): Promise<string> {
  const candidates = ["index.ts", "main.ts", "mod.ts"];
  for (const candidate of candidates) {
    if (existsSync(path.join(functionRoot, candidate))) {
      return candidate;
    }
  }

  return "index.ts";
}

async function ensureDenoWrapper(functionRoot: string): Promise<void> {
  await mkdir(functionRoot, { recursive: true });
  const entrypoint = await detectFunctionEntrypoint(functionRoot);
  const files: Record<string, string> = {
    "deno.json": JSON.stringify({ tasks: { start: `deno run --allow-net --allow-env ${entrypoint}` } }, null, 2) + "\n",
    "Dockerfile": `FROM denoland/deno:alpine-2.1.4
WORKDIR /app
COPY . .
CMD ["deno", "run", "--allow-net", "--allow-env", "${entrypoint}"]
`,
    ".dockerignore": ".git\n",
  };

  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(functionRoot, name);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, "utf8");
    }
  }
}

async function readMigrationSql(migrationsRoot: string): Promise<string> {
  if (!existsSync(migrationsRoot)) return "";
  const entries = (await readdir(migrationsRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const contents = await Promise.all(entries.map((entry) => readFile(path.join(migrationsRoot, entry), "utf8")));
  return contents.join("\n\n");
}

function chooseArchetype(entities: ProductEntity[], functions: ImportedFunction[]): AppArchetype {
  const workerCount = functions.filter((entry) => entry.classification === "worker").length;
  if (workerCount > 0) return "studio";
  if (functions.length > 0) return "tool";
  if (entities.length > 0) return "crud";
  return "custom";
}

function normalizeModulePath(input: string): string {
  return input.replace(/^\.?\//, "").replace(/\/+$/, "");
}

function ensureUniqueModuleId(preferred: string, existingIds: Set<string>): string {
  if (!existingIds.has(preferred)) {
    existingIds.add(preferred);
    return preferred;
  }

  let suffix = 2;
  while (existingIds.has(`${preferred}-${suffix}`)) {
    suffix += 1;
  }
  const resolved = `${preferred}-${suffix}`;
  existingIds.add(resolved);
  return resolved;
}

function ensureUniqueModulePath(preferred: string, existingPaths: Set<string>, fallbackId: string): string {
  const normalized = normalizeModulePath(preferred);
  if (!existingPaths.has(normalized)) {
    existingPaths.add(normalized);
    return normalized;
  }

  const resolved = normalizeModulePath(`${path.dirname(normalized)}/${fallbackId}`);
  existingPaths.add(resolved);
  return resolved;
}

function findPrimaryKeyField(entity?: ProductEntity): string | undefined {
  if (!entity) return "id";
  return entity.fields.find((field) => field.name === "id")?.name ?? entity.fields[0]?.name;
}

function findOwnershipField(entity: ProductEntity | undefined, pattern: RegExp): string | undefined {
  return entity?.fields.find((field) => pattern.test(field.name))?.name;
}

function buildRealtimeChannelId(scope: string): string {
  return slugify(scope);
}

function resolveRealtimeTransport(strategy: RealtimeStrategy): GeneratedRealtimeChannel["transport"] {
  if (strategy.recommendedTarget === "custom-api-sse") return "sse";
  if (strategy.recommendedTarget === "custom-api-websocket") return "websocket";
  return "hybrid";
}

function resolveRealtimeSubscribeAcl(entity: ProductEntity | undefined): GeneratedRealtimeChannel["subscribeAcl"] {
  if (entity?.ownership === "team") return "team";
  if (entity?.ownership === "user") return "user";
  return "authenticated";
}

function resolveRealtimePresence(strategy: RealtimeStrategy, entity: ProductEntity | undefined): GeneratedRealtimeChannel["presence"] | undefined {
  if (strategy.usage !== "channel-session" && strategy.recommendedTarget !== "custom-api-websocket") {
    return undefined;
  }

  const scope: NonNullable<GeneratedRealtimeChannel["presence"]>["scope"] =
    entity?.ownership === "team" ? "workspace" : "user";
  const baseFields = scope === "workspace" ? ["user_id", "workspace_id", "transport"] : ["user_id", "transport"];
  return {
    enabled: true,
    scope,
    fields: baseFields,
  };
}

function buildRealtimeEvents(strategy: RealtimeStrategy, channel: GeneratedRealtimeChannel): GeneratedRealtimeChannel["events"] {
  const events: GeneratedRealtimeChannel["events"] = [
    {
      type: "message",
      origin: "service",
      schema: "json",
      description: `Primary realtime payload for ${channel.source}.`,
    },
    {
      type: "connected",
      origin: "system",
      schema: "json",
      description: "Connection lifecycle event emitted when a client subscribes.",
    },
    {
      type: "heartbeat",
      origin: "system",
      schema: "json",
      description: "Keepalive event for idle subscribers.",
    },
  ];

  if (channel.transport === "websocket" || channel.transport === "hybrid") {
    events.push({
      type: "pong",
      origin: "system",
      schema: "json",
      description: "Heartbeat acknowledgement for websocket clients.",
    });
  }

  if (channel.presence?.enabled) {
    events.push(
      {
        type: "presence_join",
        origin: "system",
        schema: "json",
        description: "Presence join event for active channel members.",
      },
      {
        type: "presence_leave",
        origin: "system",
        schema: "json",
        description: "Presence leave event for active channel members.",
      },
      {
        type: "presence_snapshot",
        origin: "system",
        schema: "json",
        description: "Current presence state sent after connecting to a presence-enabled channel.",
      }
    );
  }

  if (strategy.recommendedTarget === "worker-event-pipeline") {
    events.push({
      type: "fanout",
      origin: "worker",
      schema: "json",
      description: "Background worker fanout event derived from imported realtime flows.",
    });
  }

  return events;
}

function mergeRealtimeTransport(
  left: GeneratedRealtimeChannel["transport"],
  right: GeneratedRealtimeChannel["transport"]
): GeneratedRealtimeChannel["transport"] {
  return left === right ? left : "hybrid";
}

function rankSubscribeAcl(value: GeneratedRealtimeChannel["subscribeAcl"]): number {
  switch (value) {
    case "team":
      return 4;
    case "user":
      return 3;
    case "authenticated":
      return 2;
    case "public":
      return 1;
  }
  return 0;
}

function rankPublishAcl(value: GeneratedRealtimeChannel["publishAcl"]): number {
  switch (value) {
    case "service":
      return 4;
    case "team":
      return 3;
    case "user":
      return 2;
    case "authenticated":
      return 1;
  }
  return 0;
}

function buildRealtimeChannel(
  strategy: RealtimeStrategy,
  entity?: ProductEntity
): GeneratedRealtimeChannel {
  const transport = resolveRealtimeTransport(strategy);
  const channel: GeneratedRealtimeChannel = {
    id: buildRealtimeChannelId(strategy.scope),
    source: strategy.scope,
    transport,
    subscribeAcl: resolveRealtimeSubscribeAcl(entity),
    publishAcl: "service",
    ownership: entity?.ownership,
    ownerField: entity?.ownership === "user" ? findOwnershipField(entity, OWNER_FIELD_HINT_PATTERN) : undefined,
    tenantField: entity?.ownership === "team" ? findOwnershipField(entity, TENANT_FIELD_HINT_PATTERN) : undefined,
    presence: resolveRealtimePresence(strategy, entity),
    events: [],
    notes: strategy.notes,
  };
  channel.events = buildRealtimeEvents(strategy, channel);
  return channel;
}

function mergeRealtimeChannels(
  existing: GeneratedRealtimeChannel,
  next: GeneratedRealtimeChannel
): GeneratedRealtimeChannel {
  const events = [...existing.events];
  for (const event of next.events) {
    if (!events.some((entry) => entry.type === event.type)) {
      events.push(event);
    }
  }

  const mergedPresence: GeneratedRealtimeChannel["presence"] =
    existing.presence?.enabled || next.presence?.enabled
      ? {
          enabled: true,
          scope: existing.presence?.scope === "workspace" || next.presence?.scope === "workspace" ? "workspace" : "user",
          fields: [...new Set([...(existing.presence?.fields ?? []), ...(next.presence?.fields ?? [])])],
        }
      : undefined;

  return {
    ...existing,
    source: existing.source === next.source ? existing.source : `${existing.source}, ${next.source}`,
    transport: mergeRealtimeTransport(existing.transport, next.transport),
    subscribeAcl: rankSubscribeAcl(existing.subscribeAcl) >= rankSubscribeAcl(next.subscribeAcl) ? existing.subscribeAcl : next.subscribeAcl,
    publishAcl: rankPublishAcl(existing.publishAcl) >= rankPublishAcl(next.publishAcl) ? existing.publishAcl : next.publishAcl,
    ownership: existing.ownership ?? next.ownership,
    ownerField: existing.ownerField ?? next.ownerField,
    tenantField: existing.tenantField ?? next.tenantField,
    presence: mergedPresence,
    events,
    notes: [...new Set([...(existing.notes ?? []), ...(next.notes ?? [])])],
  };
}

function buildAuthzRoutePlans(strategy: RlsTableStrategy, entity?: ProductEntity): NonNullable<GeneratedModulePlan["routes"]> {
  const primaryKeyField = findPrimaryKeyField(entity);
  const ownerField = strategy.recommendedOwnership === "user" ? findOwnershipField(entity, OWNER_FIELD_HINT_PATTERN) : undefined;
  const tenantField = strategy.recommendedOwnership === "team" ? findOwnershipField(entity, TENANT_FIELD_HINT_PATTERN) : undefined;
  const routes: NonNullable<GeneratedModulePlan["routes"]> = [
    {
      id: `${strategy.table}-list`,
      kind: "authz-crud",
      method: "get",
      path: `/internal/${strategy.table}`,
      summary: `List ${strategy.table} with migrated authorization checks`,
      table: strategy.table,
      accessTarget: strategy.recommendedTarget,
      ownership: strategy.recommendedOwnership,
      primaryKeyField,
      ownerField,
      tenantField,
      notes: strategy.notes,
    },
  ];

  if (strategy.commands.includes("insert") || strategy.commands.includes("all")) {
    routes.push({
      id: `${strategy.table}-create`,
      kind: "authz-crud",
      method: "post",
      path: `/internal/${strategy.table}`,
      summary: `Create ${strategy.table} with migrated authorization checks`,
      table: strategy.table,
      accessTarget: strategy.recommendedTarget,
      ownership: strategy.recommendedOwnership,
      primaryKeyField,
      ownerField,
      tenantField,
      notes: strategy.notes,
    });
  }

  if (strategy.commands.includes("update") || strategy.commands.includes("all")) {
    routes.push({
      id: `${strategy.table}-update`,
      kind: "authz-crud",
      method: "patch",
      path: `/internal/${strategy.table}/:id`,
      summary: `Update ${strategy.table} with migrated authorization checks`,
      table: strategy.table,
      accessTarget: strategy.recommendedTarget,
      ownership: strategy.recommendedOwnership,
      primaryKeyField,
      ownerField,
      tenantField,
      notes: strategy.notes,
    });
  }

  if (strategy.commands.includes("delete") || strategy.commands.includes("all")) {
    routes.push({
      id: `${strategy.table}-delete`,
      kind: "authz-crud",
      method: "delete",
      path: `/internal/${strategy.table}/:id`,
      summary: `Delete ${strategy.table} with migrated authorization checks`,
      table: strategy.table,
      accessTarget: strategy.recommendedTarget,
      ownership: strategy.recommendedOwnership,
      primaryKeyField,
      ownerField,
      tenantField,
      notes: strategy.notes,
    });
  }

  return routes;
}

function buildRealtimeRoutePlan(strategy: RealtimeStrategy): NonNullable<GeneratedModulePlan["routes"]>[number] {
  const scopeId = buildRealtimeChannelId(strategy.scope);
  const routeBase = `/realtime/${scopeId}` as `/${string}`;
  return {
    id: `${scopeId}-${strategy.recommendedTarget === "custom-api-sse" ? "stream" : "ws"}`,
    kind: strategy.recommendedTarget === "custom-api-sse" ? "realtime-sse" : "realtime-websocket",
    method: strategy.recommendedTarget === "custom-api-sse" ? "get" : "ws",
    path: (strategy.recommendedTarget === "custom-api-sse" ? `${routeBase}/stream` : `${routeBase}/ws`) as `/${string}`,
    summary: `Realtime delivery stub for ${strategy.scope}`,
    channel: scopeId,
    notes: strategy.notes,
  };
}

function buildRealtimeWorkerTaskPlan(strategy: RealtimeStrategy): NonNullable<GeneratedModulePlan["tasks"]>[number] {
  const scopeId = buildRealtimeChannelId(strategy.scope);
  return {
    id: `${scopeId}-fanout`,
    kind: "realtime-fanout",
    source: strategy.scope,
    channel: scopeId,
    summary: `Fan out realtime events for ${strategy.scope}`,
    notes: strategy.notes,
  };
}

function deriveStrategyModules(params: {
  customApis: CustomApiModule[];
  workers: WorkerModule[];
  storageEnabled: boolean;
  entities: ProductEntity[];
  rls: RlsMigrationReport;
  realtime: RealtimeMigrationReport;
}): {
  customApis: CustomApiModule[];
  workers: WorkerModule[];
  scaffoldCustomApiIds: string[];
  scaffoldWorkerIds: string[];
  realtimeChannels: GeneratedRealtimeChannel[];
  modulePlans: GeneratedModulePlan[];
  warnings: string[];
} {
  const customApis = [...params.customApis];
  const workers = [...params.workers];
  const scaffoldCustomApiIds: string[] = [];
  const scaffoldWorkerIds: string[] = [];
  const realtimeChannels = new Map<string, GeneratedRealtimeChannel>();
  const modulePlans: GeneratedModulePlan[] = [];
  const warnings: string[] = [];
  const customApiIds = new Set(customApis.map((module) => module.id));
  const workerIds = new Set(workers.map((module) => module.id));
  const customApiPaths = new Set(customApis.map((module) => normalizeModulePath(module.path)));
  const workerPaths = new Set(workers.map((module) => normalizeModulePath(module.path)));
  const entitiesById = new Map(params.entities.map((entity) => [entity.id, entity]));

  for (const strategy of params.realtime.strategies) {
    const channel = buildRealtimeChannel(strategy, entitiesById.get(strategy.scope));
    const existing = realtimeChannels.get(channel.id);
    realtimeChannels.set(channel.id, existing ? mergeRealtimeChannels(existing, channel) : channel);
  }

  const needsCoreApi =
    params.rls.tableStrategies.some((strategy) => strategy.recommendedTarget === "custom-api-authz") ||
    realtimeChannels.size > 0;

  const hasCoreApi = customApis.some((module) =>
    module.id === "core" || normalizeModulePath(module.path) === "services/api" || /core|gateway/i.test(module.id)
  );

  if (needsCoreApi && !hasCoreApi) {
    const id = ensureUniqueModuleId("core", customApiIds);
    const modulePath = ensureUniqueModulePath("services/api", customApiPaths, id);
    customApis.push({
      id,
      enabled: true,
      runtime: "node",
      framework: "hono",
      path: modulePath,
      publicBasePath: "/api",
      healthcheck: "/health",
      dependsOn: ["database", "auth", ...(params.storageEnabled ? ["storage" as const] : [])],
    });
    scaffoldCustomApiIds.push(id);
    modulePlans.push({
      moduleType: "custom-api",
      moduleId: id,
      template: "supabase-core-api",
      routes: [
        ...params.rls.tableStrategies
          .filter((strategy) => strategy.recommendedTarget === "custom-api-authz")
          .flatMap((strategy) => buildAuthzRoutePlans(strategy, entitiesById.get(strategy.table))),
        ...params.realtime.strategies
          .filter((strategy) => strategy.recommendedTarget === "custom-api-sse" || strategy.recommendedTarget === "custom-api-websocket")
          .map((strategy) => buildRealtimeRoutePlan(strategy)),
      ],
      notes: [
        "Generated from Supabase import strategies.",
        "Replace TODO authorization and streaming logic before production cutover.",
      ],
    });
    warnings.push(`Added generated custom API module "${id}" at ${modulePath} for imported authz/realtime behavior.`);
  }

  const needsRealtimeWorker = params.realtime.strategies.some((strategy) => strategy.recommendedTarget === "worker-event-pipeline");
  const hasRealtimeWorker = workers.some((module) =>
    /realtime|event|broadcast|fanout/i.test(module.id) || /realtime|event|broadcast|fanout/i.test(normalizeModulePath(module.path))
  );

  if (needsRealtimeWorker && !hasRealtimeWorker) {
    const id = ensureUniqueModuleId("realtime-events", workerIds);
    const modulePath = ensureUniqueModulePath("workers/realtime-events", workerPaths, id);
    workers.push({
      id,
      enabled: true,
      runtime: "node",
      kind: "background",
      path: modulePath,
      dependsOn: ["database", "auth", ...(params.storageEnabled ? ["storage" as const] : [])],
    });
    scaffoldWorkerIds.push(id);
    modulePlans.push({
      moduleType: "worker",
      moduleId: id,
      template: "supabase-realtime-worker",
      tasks: params.realtime.strategies
        .filter((strategy) => strategy.recommendedTarget === "worker-event-pipeline")
        .map((strategy) => buildRealtimeWorkerTaskPlan(strategy)),
      notes: [
        "Generated from Supabase realtime migration analysis.",
        "Wire this worker into your actual queue/event source before production use.",
      ],
    });
    warnings.push(`Added generated worker module "${id}" at ${modulePath} for imported realtime fanout behavior.`);
  }

  return {
    customApis,
    workers,
    scaffoldCustomApiIds,
    scaffoldWorkerIds,
    realtimeChannels: [...realtimeChannels.values()],
    modulePlans,
    warnings,
  };
}

function classifyEnvVariable(key: string): Omit<EnvVariableMigrationReport, "key" | "sourcePath" | "valuePreview"> {
  const normalized = key.toUpperCase();
  if (
    normalized.startsWith("NEXT_PUBLIC_") ||
    normalized.startsWith("VITE_") ||
    normalized.startsWith("PUBLIC_")
  ) {
    return {
      visibility: normalized.includes("ANON_KEY") || normalized.includes("PUBLISHABLE_KEY") ? "publishable" : "public",
      recommendedTarget: "frontend-env",
      replacementHint: normalized.includes("SUPABASE")
        ? "Replace Supabase browser config with Ploybundle app/auth/admin URLs or your custom API base URL."
        : undefined,
    };
  }

  if (normalized.includes("ANON_KEY") || normalized.includes("PUBLISHABLE_KEY")) {
    return {
      visibility: "publishable",
      recommendedTarget: "frontend-env",
      replacementHint: "Publishable keys can stay public, but Supabase-specific ones need replacement during migration.",
    };
  }

  if (
    normalized.includes("SERVICE_ROLE") ||
    normalized.includes("SECRET") ||
    normalized.includes("TOKEN") ||
    normalized.includes("PASSWORD") ||
    normalized.includes("PRIVATE_KEY") ||
    normalized.endsWith("_KEY")
  ) {
    return {
      visibility: "secret",
      recommendedTarget: "platform-secret",
      replacementHint: normalized.includes("SUPABASE")
        ? "Store this as a platform secret and rotate it after migrating away from Supabase."
        : undefined,
    };
  }

  return {
    visibility: "runtime",
    recommendedTarget: "runtime-env",
    replacementHint: normalized.includes("SUPABASE_URL")
      ? "Replace Supabase URLs with the corresponding Ploybundle service URLs."
      : undefined,
  };
}

function previewEnvValue(key: string, rawValue: string): string {
  const trimmed = rawValue.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return "";
  const upperKey = key.toUpperCase();
  if (/URL|HOST|DOMAIN/.test(upperKey)) {
    return trimmed;
  }
  return maskSecret(trimmed, 6);
}

async function analyzeEnvAndSecrets(sourceRoot: string): Promise<{
  env: EnvMigrationReport;
  secrets: SecretsMigrationReport;
}> {
  const files = (await walkFiles(sourceRoot)).filter((filePath) => ENV_FILE_PATTERN.test(path.basename(filePath)));
  const variables: EnvVariableMigrationReport[] = [];
  const warnings = new Set<string>();
  const secretKeys = new Set<string>();

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1);
      const classified = classifyEnvVariable(key);
      variables.push({
        key,
        sourcePath: path.relative(sourceRoot, filePath),
        valuePreview: previewEnvValue(key, value),
        ...classified,
      });

      if (classified.visibility === "secret") {
        secretKeys.add(key);
      }
      if (key.toUpperCase().includes("SUPABASE")) {
        warnings.add(`Env var "${key}" is Supabase-specific and needs manual replacement or removal.`);
      }
    }
  }

  if (secretKeys.has("SUPABASE_SERVICE_ROLE_KEY")) {
    warnings.add("SUPABASE_SERVICE_ROLE_KEY was found. Rotate it after completing migration.");
  }

  return {
    env: {
      variables,
      warnings: [...warnings],
    },
    secrets: {
      keys: [...secretKeys].sort(),
      warnings: [...warnings].filter((warning) => warning.includes("rotate") || warning.includes("secret")),
    },
  };
}

function extractParenthesizedExpression(input: string, token: string): string | undefined {
  const startToken = `${token}(`;
  const start = input.toLowerCase().indexOf(startToken.toLowerCase());
  if (start === -1) return undefined;

  let cursor = start + startToken.length;
  let depth = 1;
  let expression = "";
  while (cursor < input.length) {
    const char = input[cursor]!;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) break;
    expression += char;
    cursor += 1;
  }

  return expression.trim() || undefined;
}

function normalizeSqlExpression(expression?: string): string {
  return (expression ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isAlwaysTrueExpression(expression?: string): boolean {
  const normalized = normalizeSqlExpression(expression).replace(/[()]/g, "").trim();
  return normalized === "" || normalized === "true";
}

function classifyRlsPolicyPattern(policy: RlsPolicyReport): RlsTableStrategy["accessPatterns"][number] {
  const roles = new Set(policy.roles.map((role) => role.toLowerCase()));
  const usingExpression = normalizeSqlExpression(policy.usingExpression);
  const withCheckExpression = normalizeSqlExpression(policy.withCheckExpression);
  const expression = `${usingExpression} ${withCheckExpression}`.trim();

  if (!expression || (isAlwaysTrueExpression(policy.usingExpression) && isAlwaysTrueExpression(policy.withCheckExpression))) {
    if (roles.has("authenticated")) return "authenticated";
    return "public";
  }

  if (/auth\.uid\s*\(\)|uid\s*\(\)/i.test(expression)) {
    if (TENANT_FIELD_HINT_PATTERN.test(expression) || /auth\.jwt|current_setting|workspace|tenant|organization|org_id/i.test(expression)) {
      return "tenant-scoped";
    }
    if (OWNER_FIELD_HINT_PATTERN.test(expression) || /\bauth\.uid\s*\(\)\s*=\s*id\b|\bid\s*=\s*auth\.uid\s*\(\)/i.test(expression)) {
      return "owner-scoped";
    }
  }

  if (TENANT_FIELD_HINT_PATTERN.test(expression) || /auth\.jwt|current_setting|workspace|tenant|organization|org_id/i.test(expression)) {
    return "tenant-scoped";
  }

  return "custom";
}

function buildRlsTableStrategies(enabledTables: Set<string>, policies: RlsPolicyReport[]): RlsTableStrategy[] {
  const tables = new Set<string>([...enabledTables, ...policies.map((policy) => policy.table)]);
  const strategies: RlsTableStrategy[] = [];

  for (const table of [...tables].sort()) {
    const tablePolicies = policies.filter((policy) => policy.table === table);
    const accessPatterns = [...new Set(tablePolicies.map((policy) => classifyRlsPolicyPattern(policy)))];
    const commands = [...new Set(tablePolicies.map((policy) => policy.command))];

    let recommendedTarget: RlsTableStrategy["recommendedTarget"] = "directus-role-permissions";
    let recommendedOwnership: ProductEntity["ownership"] = "global";
    let generatedCrudReadiness: RlsTableStrategy["generatedCrudReadiness"] = "safe";
    const notes: string[] = [];

    if (accessPatterns.includes("custom") || accessPatterns.includes("tenant-scoped")) {
      recommendedTarget = "custom-api-authz";
      recommendedOwnership = accessPatterns.includes("tenant-scoped") ? "team" : "global";
      generatedCrudReadiness = "avoid";
      notes.push("This table uses SQL-level authorization that should move into an explicit custom API authorization layer.");
    } else if (accessPatterns.includes("owner-scoped")) {
      recommendedTarget = "directus-filter-permissions";
      recommendedOwnership = "user";
      generatedCrudReadiness = "review";
      notes.push("Validate that the ownership field can be mapped to a Directus user before relying on generated CRUD.");
    } else if (accessPatterns.includes("authenticated")) {
      notes.push("This looks like role-based access and can usually be recreated with Directus roles and generated CRUD.");
    } else {
      notes.push("This table appears public-facing; review whether generated read access is acceptable before exposing it.");
    }

    if (commands.some((command) => command === "insert" || command === "update" || command === "delete" || command === "all")) {
      notes.push("Write access was detected, so generated admin/API exposure should be reviewed before enabling mutations.");
      if (generatedCrudReadiness === "safe") generatedCrudReadiness = "review";
    }

    strategies.push({
      table,
      accessPatterns,
      commands,
      relatedPolicies: tablePolicies.map((policy) => policy.name),
      recommendedTarget,
      recommendedOwnership,
      generatedCrudReadiness,
      notes,
    });
  }

  return strategies;
}

function analyzeRls(sql: string): RlsMigrationReport {
  const enabledTables = new Set<string>();
  const policies: RlsPolicyReport[] = [];
  const warnings = new Set<string>();

  for (const match of sql.matchAll(/alter table(?: if exists)?\s+(?:(?:public|auth)\.)?"?([a-zA-Z_][\w]*)"?\s+enable row level security/gi)) {
    if (match[1]) enabledTables.add(match[1].toLowerCase());
  }

  for (const match of sql.matchAll(/create policy\s+"?([^"\n]+?)"?\s+on\s+(?:(?:public|auth)\.)?"?([a-zA-Z_][\w]*)"?([\s\S]*?);/gi)) {
    const [, rawName, rawTable, rawTail] = match;
    const tail = rawTail ?? "";
    const rolesMatch = tail.match(/\bto\s+([a-zA-Z0-9_",\s]+)/i);
    policies.push({
      name: rawName.trim(),
      table: rawTable.toLowerCase(),
      command: tail.match(/\bfor\s+(all|select|insert|update|delete)\b/i)?.[1]?.toLowerCase() ?? "all",
      roles: rolesMatch
        ? rolesMatch[1]
            .split(",")
            .map((role) => role.replace(/"/g, "").trim().toLowerCase())
            .filter(Boolean)
        : ["public"],
      usingExpression: extractParenthesizedExpression(tail, "using "),
      withCheckExpression: extractParenthesizedExpression(tail, "with check "),
    });
  }

  if (enabledTables.size > 0) {
    warnings.add("RLS policies were detected. Directus/Auth replacement will require manual permission mapping.");
  }

  return {
    enabledTables: [...enabledTables].sort(),
    policies,
    tableStrategies: buildRlsTableStrategies(enabledTables, policies),
    warnings: [...warnings],
  };
}

function buildRealtimeStrategies(publicationTables: Set<string>, codeReferences: RealtimeCodeReference[], hasWorkerishFunctions: boolean): RealtimeStrategy[] {
  const strategies: RealtimeStrategy[] = [];

  for (const table of [...publicationTables].sort()) {
    strategies.push({
      scope: table,
      detectedFrom: "sql-publication",
      usage: hasWorkerishFunctions ? "event-fanout" : "table-subscription",
      recommendedTarget: hasWorkerishFunctions ? "worker-event-pipeline" : "custom-api-sse",
      notes: hasWorkerishFunctions
        ? [
            "Background jobs/workers exist in this project, so emit domain events there and fan them out through a custom API stream.",
          ]
        : [
            "Database table subscriptions usually map best to a custom API SSE stream in Ploybundle.",
          ],
    });
  }

  for (const reference of codeReferences) {
    let usage: RealtimeStrategy["usage"] = "channel-session";
    let recommendedTarget: RealtimeStrategy["recommendedTarget"] = "custom-api-websocket";
    const notes: string[] = [];

    if (reference.pattern === "postgres_changes" || reference.pattern === "supabase_realtime") {
      usage = "table-subscription";
      recommendedTarget = "custom-api-sse";
      notes.push("Row-level live updates are usually simpler to migrate to SSE than to a bidirectional websocket.");
    } else if (reference.pattern === "broadcast_changes") {
      usage = "channel-broadcast";
      recommendedTarget = "custom-api-websocket";
      notes.push("Broadcast-style collaboration flows generally need websocket semantics.");
    } else {
      usage = "channel-session";
      recommendedTarget = "custom-api-websocket";
      notes.push("Generic channel usage often implies presence or ad-hoc events, which fit websocket delivery.");
    }

    strategies.push({
      scope: reference.sourcePath,
      detectedFrom: "code-reference",
      usage,
      recommendedTarget,
      notes,
    });
  }

  return strategies;
}

async function analyzeRealtime(sourceRoot: string, sql: string, hasWorkerishFunctions: boolean): Promise<RealtimeMigrationReport> {
  const publicationTables = new Set<string>();
  const codeReferences: RealtimeCodeReference[] = [];
  const warnings = new Set<string>();

  for (const match of sql.matchAll(/alter publication\s+supabase_realtime\s+add table\s+([^;]+);/gi)) {
    const tables = match[1]
      ?.split(",")
      .map((table) => table.replace(/["\s]/g, "").replace(/^public\./i, "").toLowerCase())
      .filter(Boolean) ?? [];
    for (const table of tables) publicationTables.add(table);
  }

  const candidateFiles = (await walkFiles(sourceRoot)).filter((filePath) =>
    /\.(ts|tsx|js|jsx|md)$/.test(filePath)
  );
  const patterns: Array<[RegExp, string]> = [
    [/supabase\.channel\s*\(/i, "supabase.channel"],
    [/postgres_changes/i, "postgres_changes"],
    [/broadcast_changes/i, "broadcast_changes"],
    [/supabase_realtime/i, "supabase_realtime"],
  ];

  for (const filePath of candidateFiles) {
    const content = await readFile(filePath, "utf8");
    for (const [pattern, label] of patterns) {
      if (pattern.test(content)) {
        codeReferences.push({
          sourcePath: path.relative(sourceRoot, filePath),
          pattern: label,
        });
      }
    }
  }

  if (publicationTables.size > 0 || codeReferences.length > 0) {
    warnings.add("Supabase Realtime usage was detected. Ploybundle has no automatic 1:1 replacement yet.");
  }

  return {
    publicationTables: [...publicationTables].sort(),
    codeReferences,
    strategies: buildRealtimeStrategies(publicationTables, codeReferences, hasWorkerishFunctions),
    warnings: [...warnings],
  };
}

function buildMigrationReport(params: {
  sourceRoot: string;
  env: EnvMigrationReport;
  secrets: SecretsMigrationReport;
  rls: RlsMigrationReport;
  realtime: RealtimeMigrationReport;
  hasCustomApi: boolean;
  hasWorker: boolean;
  warnings: string[];
}): SupabaseMigrationReport {
  const unresolved = new Set<string>();
  const recommendations = new Set<string>();

  if (params.secrets.keys.length > 0) {
    recommendations.add("Move secret env vars into platform-managed secrets before first deploy.");
  }
  if (params.rls.enabledTables.length > 0) {
    unresolved.add("RLS policies need manual migration into Directus roles, custom API authorization, or database policy equivalents.");
    recommendations.add("Review every RLS-enabled table before exposing generated CRUD or admin access.");
  }
  if (params.realtime.publicationTables.length > 0 || params.realtime.codeReferences.length > 0) {
    unresolved.add("Realtime behavior needs redesign on Ploybundle because Supabase Realtime is not migrated automatically.");
    recommendations.add("Choose a replacement path for realtime features before cutover.");
  }
  for (const warning of params.warnings) {
    if (warning.includes("schedule-driven")) {
      unresolved.add("Scheduled Edge Functions need manual mapping to Windmill schedules or workers.");
    }
  }
  if (params.rls.tableStrategies.some((strategy) => strategy.recommendedTarget === "custom-api-authz") && !params.hasCustomApi) {
    recommendations.add("Add a core custom API service to enforce imported authorization rules that do not fit generated CRUD.");
  }
  if (params.realtime.strategies.some((strategy) => strategy.recommendedTarget === "custom-api-sse" || strategy.recommendedTarget === "custom-api-websocket") && !params.hasCustomApi) {
    recommendations.add("Add a custom API service dedicated to realtime delivery before replacing Supabase subscriptions.");
  }
  if (params.realtime.strategies.some((strategy) => strategy.recommendedTarget === "worker-event-pipeline") && !params.hasWorker) {
    recommendations.add("Add a worker service for background event fanout before migrating realtime flows.");
  }

  return {
    generatedAt: timestampNow(),
    sourceRoot: params.sourceRoot,
    env: params.env,
    secrets: params.secrets,
    rls: params.rls,
    realtime: params.realtime,
    unresolved: [...unresolved],
    recommendations: [...recommendations],
  };
}

export async function importSupabaseProject(options: SupabaseImportOptions): Promise<SupabaseImportResult> {
  const sourceRoot = path.resolve(options.sourceRoot);
  const supabaseRoot = existsSync(path.join(sourceRoot, "supabase"))
    ? path.join(sourceRoot, "supabase")
    : sourceRoot;

  if (!existsSync(supabaseRoot)) {
    throw new ConfigError(`Supabase source path not found: ${sourceRoot}`);
  }

  const migrationsRoot = path.join(supabaseRoot, "migrations");
  const functionsRoot = path.join(supabaseRoot, "functions");
  const sql = await readMigrationSql(migrationsRoot);
  const entities = parseCreateTables(sql);
  const functionNames = await listFunctionDirectories(functionsRoot);
  const importedFunctions: ImportedFunction[] = [];
  const warnings: string[] = [];
  const { env, secrets } = await analyzeEnvAndSecrets(sourceRoot);
  const rls = analyzeRls(sql);

  for (const functionName of functionNames) {
    const classification = classifyFunction(functionName);
    const functionRoot = path.join(functionsRoot, functionName);
    await ensureDenoWrapper(functionRoot);

    importedFunctions.push({
      name: functionName,
      sourcePath: functionRoot,
      classification,
      targetPath: path.relative(sourceRoot, functionRoot),
      runtime: "deno",
    });

    if (classification === "job-like") {
      warnings.push(`Function "${functionName}" looks schedule-driven. Trigger metadata could not be recovered and needs manual review.`);
    }
  }

  const hasWorkerishFunctions = importedFunctions.some((fn) => fn.classification === "worker" || fn.classification === "job-like");
  const realtime = await analyzeRealtime(sourceRoot, sql, hasWorkerishFunctions);

  const storageEnabled = await detectStorageUsage(sourceRoot);
  const appId = slugify(options.projectName ?? path.basename(sourceRoot));
  const customApis: CustomApiModule[] = importedFunctions
    .filter((fn) => fn.classification !== "worker")
    .map((fn) => ({
      id: fn.name,
      enabled: true,
      runtime: "deno",
      framework: "none",
      path: fn.targetPath,
      healthcheck: "/",
      dependsOn: ["database", ...(storageEnabled ? ["storage" as const] : [])],
    }));
  const workers: WorkerModule[] = importedFunctions
    .filter((fn) => fn.classification === "worker")
    .map((fn) => ({
      id: fn.name,
      enabled: true,
      runtime: "deno",
      kind: "specialized",
      path: fn.targetPath,
      dependsOn: ["database", ...(storageEnabled ? ["storage" as const] : [])],
    }));
  const derivedModules = deriveStrategyModules({
    customApis,
    workers,
    storageEnabled,
    entities,
    rls,
    realtime,
  });

  const serverEnabled = Boolean(options.server?.rootDomain && options.server.host);
  const archetype = chooseArchetype(entities, importedFunctions);
  const serverMode = serverEnabled
    ? {
        enabled: true as const,
        target: options.server?.target ?? "lite",
        ssh: {
          host: options.server!.host!,
          user: options.server?.user ?? "root",
          port: 22,
        },
        domain: {
          root: options.server!.rootDomain!,
        },
      }
    : { enabled: false as const };

  const spec: AppSpecV2 = {
    version: 2,
    app: {
      id: appId,
      name: options.appName ?? appId,
      archetype,
      frontend: options.frontend ?? "nextjs",
      starter: "import",
      resourceProfile: "medium",
      description: `Imported from Supabase project at ${sourceRoot}`,
    },
    modes: {
      local: { enabled: true },
      server: serverMode,
    },
    modules: {
      database: { enabled: true, provider: "postgres" },
      cache: { enabled: true, provider: "redis" },
      auth: { enabled: true, provider: "directus" },
      admin: { enabled: true, provider: "directus", mode: "generated" },
      storage: storageEnabled
        ? {
            enabled: true,
            provider: "seaweedfs",
            buckets: [{ name: "assets", public: false }],
          }
        : undefined,
      jobs: importedFunctions.some((fn) => fn.classification === "job-like")
        ? { enabled: true, provider: "windmill", schedules: [] }
        : undefined,
      customApis: derivedModules.customApis,
      workers: derivedModules.workers,
      hub: { enabled: true, editableSpec: true },
    },
    product: {
      roles: ["owner", "admin", "member", "viewer"],
      entities,
    },
    generation: {
      scaffoldWeb: true,
      scaffoldAdmin: true,
      scaffoldCustomApis: false,
      scaffoldCustomApiIds: derivedModules.scaffoldCustomApiIds,
      scaffoldWorkers: false,
      scaffoldWorkerIds: derivedModules.scaffoldWorkerIds,
      realtimeChannels: derivedModules.realtimeChannels,
      modulePlans: derivedModules.modulePlans,
      createTests: true,
    },
    dashboard: {
      editSpec: true,
      showAreas: ["app", "auth", "data", "storage", "jobs", "workers", "deploy"],
      allowRunActions: ["deploy", "restart", "run-job"],
    },
    import: {
      source: "supabase",
      mode: "full-migration",
      projectRef: options.projectRef,
      migrate: {
        auth: true,
        database: true,
        storage: storageEnabled,
        functions: "classify",
        env: true,
        secrets: "map",
      },
      unresolved: {
        rls: "report",
        realtime: "report",
      },
    },
  };

  if (entities.length === 0) {
    warnings.push("No tables were recovered from supabase/migrations. Product entities will need manual definition.");
  }
  warnings.push(...derivedModules.warnings);

  const outputPath = path.resolve(options.outputPath ?? path.join(sourceRoot, "ploybundle.yaml"));
  const reportPath = path.resolve(path.join(path.dirname(outputPath), "ploybundle.import-report.json"));
  const report = buildMigrationReport({
    sourceRoot,
    env,
    secrets,
    rls,
    realtime,
    hasCustomApi: derivedModules.customApis.length > 0,
    hasWorker: derivedModules.workers.length > 0,
    warnings,
  });
  await writeFile(outputPath, stringifyYaml(spec, { lineWidth: 120 }), "utf8");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  return {
    spec,
    outputPath,
    reportPath,
    entities,
    functions: importedFunctions,
    report,
    warnings,
  };
}
