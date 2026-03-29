import type {
  AppSpecV2,
  CustomApiModule,
  GeneratedModulePlan,
  GeneratedRealtimeChannel,
  ProjectConfig,
  WorkerModule,
} from "@ploybundle/shared";

type ProjectConfigWithAppSpec = ProjectConfig & { appSpec?: AppSpecV2 };

function normalizePath(input: string): string {
  return input.replace(/^\.?\//, "").replace(/\/+$/, "");
}

function renderNodePackageJson(name: string, dependencies: Record<string, string> = {}): string {
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        start: "node src/index.js",
      },
      dependencies,
    },
    null,
    2
  );
}

function renderNodeDockerfile(): string {
  return `FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
CMD ["npm", "start"]
`;
}

function renderNodeWorkerPackageJson(name: string): string {
  return renderNodePackageJson(name, {});
}

function findGeneratedModulePlan(
  appSpec: AppSpecV2,
  moduleType: GeneratedModulePlan["moduleType"],
  moduleId: string
): GeneratedModulePlan | undefined {
  return appSpec.generation?.modulePlans?.find((plan) => plan.moduleType === moduleType && plan.moduleId === moduleId);
}

function findReferencedRealtimeChannels(
  appSpec: AppSpecV2,
  ids: Iterable<string | undefined>
): GeneratedRealtimeChannel[] {
  const requested = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id.length > 0) {
      requested.add(id);
    }
  }

  return (appSpec.generation?.realtimeChannels ?? []).filter((channel) => requested.has(channel.id));
}

function renderNodeCustomApiEntry(module: CustomApiModule): string {
  if (module.framework === "express") {
    return `import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: ${JSON.stringify(module.id)} });
});

app.listen(port, "0.0.0.0", () => {
  console.log("custom api ${module.id} listening on", port);
});
`;
  }

  if (module.framework === "none") {
    return `import http from "node:http";

const port = Number(process.env.PORT || 3000);

http
  .createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: ${JSON.stringify(module.id)} }));
  })
  .listen(port, "0.0.0.0", () => {
    console.log("custom api ${module.id} listening on", port);
  });
`;
  }

  return `import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();
const port = Number(process.env.PORT || 3000);

app.get("/health", (c) => c.json({ status: "ok", service: ${JSON.stringify(module.id)} }));

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log("custom api ${module.id} listening on", port);
});
`;
}

function renderNodeWorkerEntry(module: WorkerModule): string {
  return `const intervalMs = Number(process.env.WORKER_HEARTBEAT_MS || 30000);

console.log("worker ${module.id} starting");

setInterval(() => {
  console.log(JSON.stringify({
    worker: ${JSON.stringify(module.id)},
    kind: ${JSON.stringify(module.kind)},
    status: "alive",
    timestamp: new Date().toISOString(),
  }));
}, intervalMs);
`;
}

function renderGeneratedCoreApiIndex(module: CustomApiModule): string {
  return `import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { channelSpecs, moduleNotes, routePlans } from "./plans.js";
import { query } from "./lib/db.js";
import { getServiceContext } from "./lib/auth.js";
import { attachWebSocketServer, configureRealtime } from "./lib/realtime.js";
import { registerAuthzRoutes } from "./routes/authz.js";
import { registerRealtimeRoutes } from "./routes/realtime.js";

const app = new Hono();
const port = Number(process.env.PORT || 3000);

configureRealtime(channelSpecs);

app.get("/health", (c) => c.json({
  status: "ok",
  service: ${JSON.stringify(module.id)},
  generated: true,
  routeCount: routePlans.length,
  channelCount: channelSpecs.length,
}));

app.get("/", (c) => c.json({
  service: ${JSON.stringify(module.id)},
  generated: true,
  moduleNotes,
  channels: channelSpecs.map((channel) => ({
    id: channel.id,
    transport: channel.transport,
    subscribeAcl: channel.subscribeAcl,
    publishAcl: channel.publishAcl,
    presence: channel.presence?.enabled ?? false,
  })),
  routes: routePlans.map((plan) => ({
    id: plan.id,
    method: plan.method,
    path: plan.path,
    kind: plan.kind,
    summary: plan.summary,
  })),
}));

app.get("/internal/db/ping", async (c) => {
  const serviceContext = getServiceContext(c);
  if (!serviceContext) {
    return c.json({ ok: false, message: "Service authentication required." }, 401);
  }
  try {
    const result = await query("select now() as now");
    return c.json({ ok: true, now: result.rows[0]?.now ?? null, service: serviceContext.serviceName });
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

registerAuthzRoutes(app, routePlans);
registerRealtimeRoutes(app, routePlans);

const server = serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log("generated custom api ${module.id} listening on", port);
});

attachWebSocketServer(server, routePlans);
`;
}

function renderGeneratedCoreApiPlans(plan: GeneratedModulePlan, appSpec: AppSpecV2): string {
  const channelSpecs = findReferencedRealtimeChannels(appSpec, (plan.routes ?? []).map((route) => route.channel));
  return `export const moduleNotes = ${JSON.stringify(plan.notes ?? [], null, 2)};

export const routePlans = ${JSON.stringify(plan.routes ?? [], null, 2)};

export const channelSpecs = ${JSON.stringify(channelSpecs, null, 2)};
`;
}

function renderGeneratedCoreApiDbLib(): string {
  return `import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export function quoteIdentifier(value) {
  return \`"\${String(value).replace(/"/g, '""')}"\`;
}

export function resolvePrimaryKey(plan) {
  return plan.primaryKeyField || "id";
}
`;
}

function renderGeneratedCoreApiAuthLib(): string {
  return `import { jwtVerify } from "jose";
import { quoteIdentifier } from "./db.js";

const directusSecretValue = process.env.DIRECTUS_SECRET || process.env.SECRET || "";
const directusSecret = new TextEncoder().encode(directusSecretValue);
const internalServiceToken = process.env.PLOYBUNDLE_INTERNAL_TOKEN || "";

function isPrivilegedRole(role) {
  return role === "admin" || role === "owner";
}

function readBearerToken(c) {
  const authHeader = c.req.header("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function readBearerTokenFromHeaderValue(authHeader) {
  if (typeof authHeader !== "string" || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim() || null;
}

function normalizeRole(claims) {
  const directRole = claims.role ?? claims.app_role;
  if (typeof directRole === "string" && directRole.length > 0) return directRole.toLowerCase();
  if (claims.admin_access === true) return "admin";
  if (claims.app_access === true) return "member";
  return "member";
}

function pickWorkspaceId(claims) {
  const candidates = [
    claims.workspace_id,
    claims.tenant_id,
    claims.org_id,
    claims.organization_id,
    claims.account_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function buildAnonymousContext(error) {
  return {
    authenticated: false,
    authType: "anonymous",
    userId: null,
    workspaceId: null,
    role: "anonymous",
    claims: null,
    error,
  };
}

function buildUserContext(payload) {
  return {
    authenticated: true,
    authType: "user",
    userId:
      (typeof payload.sub === "string" && payload.sub) ||
      (typeof payload.id === "string" && payload.id) ||
      (typeof payload.user === "string" && payload.user) ||
      null,
    workspaceId: pickWorkspaceId(payload),
    role: normalizeRole(payload),
    claims: payload,
    error: null,
  };
}

export async function verifyUserToken(token) {
  if (!token) {
    return buildAnonymousContext("Missing bearer token.");
  }

  if (!directusSecretValue) {
    return buildAnonymousContext("DIRECTUS_SECRET is not configured.");
  }

  try {
    const { payload } = await jwtVerify(token, directusSecret, { clockTolerance: 5 });
    return buildUserContext(payload);
  } catch (error) {
    return buildAnonymousContext(error instanceof Error ? error.message : String(error));
  }
}

function parseProtocolToken(headerValue) {
  if (typeof headerValue !== "string") return null;
  for (const entry of headerValue.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.startsWith("bearer.")) {
      return trimmed.slice("bearer.".length);
    }
  }
  return null;
}

export function extractTokenFromNodeRequest(req) {
  const fromAuthorization = readBearerTokenFromHeaderValue(req.headers.authorization);
  if (fromAuthorization) return fromAuthorization;

  const host = typeof req.headers.host === "string" && req.headers.host.length > 0 ? req.headers.host : "localhost";
  const url = new URL(req.url || "/", \`http://\${host}\`);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;

  const protocolHeader = Array.isArray(req.headers["sec-websocket-protocol"])
    ? req.headers["sec-websocket-protocol"].join(",")
    : req.headers["sec-websocket-protocol"];
  return parseProtocolToken(protocolHeader);
}

export async function authenticateWebSocketRequest(req) {
  return verifyUserToken(extractTokenFromNodeRequest(req));
}

export async function getRequestContext(c) {
  return verifyUserToken(readBearerToken(c));
}

export function getServiceContext(c) {
  const headerToken = c.req.header("x-ploybundle-service-token");
  const bearerToken = readBearerToken(c);
  const presented = headerToken || bearerToken;
  if (!internalServiceToken || !presented || presented !== internalServiceToken) {
    return null;
  }

  return {
    authenticated: true,
    authType: "service",
    serviceName: c.req.header("x-ploybundle-service") || "internal-service",
  };
}

export function requireUserContext(context) {
  if (!context.authenticated) {
    return { status: 401, message: context.error || "Authentication required." };
  }
  if (!context.userId) {
    return { status: 401, message: "JWT did not contain a usable user id." };
  }
  return null;
}

export function validateContext(plan, context) {
  const authError = requireUserContext(context);
  if (authError) return authError;
  if (isPrivilegedRole(context.role)) {
    return null;
  }
  if (plan.ownership === "user" && !context.userId) {
    return { status: 401, message: "x-user-id header or userId query param is required for this route." };
  }
  if (plan.ownership === "team" && !context.workspaceId) {
    return { status: 403, message: "JWT must include a workspace or tenant scope for this route." };
  }
  return null;
}

export function buildScopeClause(plan, context, startIndex = 1) {
  if (isPrivilegedRole(context.role)) {
    return { clause: "", values: [] };
  }

  if (plan.ownership === "user" && plan.ownerField && context.userId) {
    return {
      clause: \`\${quoteIdentifier(plan.ownerField)} = $\${startIndex}\`,
      values: [context.userId],
    };
  }

  if (plan.ownership === "team" && plan.tenantField && context.workspaceId) {
    return {
      clause: \`\${quoteIdentifier(plan.tenantField)} = $\${startIndex}\`,
      values: [context.workspaceId],
    };
  }

  return { clause: "", values: [] };
}

export function applyOwnershipDefaults(plan, context, payload) {
  const nextPayload = { ...payload };
  if (plan.ownership === "user" && plan.ownerField && context.userId && nextPayload[plan.ownerField] == null) {
    nextPayload[plan.ownerField] = context.userId;
  }
  if (plan.ownership === "team" && plan.tenantField && context.workspaceId && nextPayload[plan.tenantField] == null) {
    nextPayload[plan.tenantField] = context.workspaceId;
  }
  return nextPayload;
}
`;
}

function renderGeneratedCoreApiAuthzRoutes(): string {
  return `import { query, quoteIdentifier, resolvePrimaryKey } from "../lib/db.js";
import { applyOwnershipDefaults, buildScopeClause, getRequestContext, validateContext } from "../lib/auth.js";

function jsonError(c, status, message, extra = {}) {
  return c.json({ ok: false, message, ...extra }, status);
}

function getRouteLimit(c) {
  const parsed = Number(c.req.query("limit") || 50);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, 200);
}

async function handleList(c, plan) {
  const context = await getRequestContext(c);
  const contextError = validateContext(plan, context);
  if (contextError) return jsonError(c, contextError.status, contextError.message, { route: plan.id });

  const primaryKey = resolvePrimaryKey(plan);
  const { clause, values } = buildScopeClause(plan, context);
  const limit = getRouteLimit(c);
  const sql = [
    \`select * from \${quoteIdentifier(plan.table)}\`,
    clause ? \`where \${clause}\` : "",
    \`order by \${quoteIdentifier(primaryKey)} desc\`,
    \`limit $\${values.length + 1}\`,
  ].filter(Boolean).join(" ");

  const result = await query(sql, [...values, limit]);
  return c.json({
    ok: true,
    route: plan.id,
    items: result.rows,
    context,
  });
}

async function readJsonBody(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

async function handleCreate(c, plan) {
  const context = await getRequestContext(c);
  const contextError = validateContext(plan, context);
  if (contextError) return jsonError(c, contextError.status, contextError.message, { route: plan.id });

  const body = await readJsonBody(c);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(c, 400, "Request body must be a JSON object.", { route: plan.id });
  }

  const payload = applyOwnershipDefaults(plan, context, body);
  const columns = Object.keys(payload);
  if (columns.length === 0) {
    return jsonError(c, 400, "Request body must contain at least one column.", { route: plan.id });
  }

  const quotedColumns = columns.map((column) => quoteIdentifier(column));
  const placeholders = columns.map((_, index) => \`$\${index + 1}\`);
  const values = columns.map((column) => payload[column]);
  const sql = \`insert into \${quoteIdentifier(plan.table)} (\${quotedColumns.join(", ")}) values (\${placeholders.join(", ")}) returning *\`;
  const result = await query(sql, values);

  return c.json({ ok: true, route: plan.id, item: result.rows[0] ?? null }, 201);
}

async function handleUpdate(c, plan) {
  const context = await getRequestContext(c);
  const contextError = validateContext(plan, context);
  if (contextError) return jsonError(c, contextError.status, contextError.message, { route: plan.id });

  const id = c.req.param("id");
  if (!id) return jsonError(c, 400, "Missing route param :id", { route: plan.id });

  const body = await readJsonBody(c);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(c, 400, "Request body must be a JSON object.", { route: plan.id });
  }

  const payload = applyOwnershipDefaults(plan, context, body);
  const columns = Object.keys(payload);
  if (columns.length === 0) {
    return jsonError(c, 400, "Request body must contain at least one column.", { route: plan.id });
  }

  const assignments = columns.map((column, index) => \`\${quoteIdentifier(column)} = $\${index + 1}\`);
  const values = columns.map((column) => payload[column]);
  const primaryKey = resolvePrimaryKey(plan);
  const scope = buildScopeClause(plan, context, values.length + 2);
  const sql = [
    \`update \${quoteIdentifier(plan.table)} set \${assignments.join(", ")} where \${quoteIdentifier(primaryKey)} = $\${values.length + 1}\`,
    scope.clause ? \`and \${scope.clause}\` : "",
    "returning *",
  ].filter(Boolean).join(" ");
  const result = await query(sql, [...values, id, ...scope.values]);

  if (result.rowCount === 0) {
    return jsonError(c, 404, "No row matched the requested update.", { route: plan.id });
  }

  return c.json({ ok: true, route: plan.id, item: result.rows[0] ?? null });
}

async function handleDelete(c, plan) {
  const context = await getRequestContext(c);
  const contextError = validateContext(plan, context);
  if (contextError) return jsonError(c, contextError.status, contextError.message, { route: plan.id });

  const id = c.req.param("id");
  if (!id) return jsonError(c, 400, "Missing route param :id", { route: plan.id });

  const primaryKey = resolvePrimaryKey(plan);
  const scope = buildScopeClause(plan, context, 2);
  const sql = [
    \`delete from \${quoteIdentifier(plan.table)} where \${quoteIdentifier(primaryKey)} = $1\`,
    scope.clause ? \`and \${scope.clause}\` : "",
    "returning *",
  ].filter(Boolean).join(" ");
  const result = await query(sql, [id, ...scope.values]);

  if (result.rowCount === 0) {
    return jsonError(c, 404, "No row matched the requested delete.", { route: plan.id });
  }

  return c.json({ ok: true, route: plan.id, item: result.rows[0] ?? null });
}

export function registerAuthzRoutes(app, routePlans) {
  for (const plan of routePlans.filter((routePlan) => routePlan.kind === "authz-crud")) {
    if (plan.method === "get") {
      app.get(plan.path, (c) => handleList(c, plan));
      continue;
    }
    if (plan.method === "post") {
      app.post(plan.path, (c) => handleCreate(c, plan));
      continue;
    }
    if (plan.method === "patch") {
      app.patch(plan.path, (c) => handleUpdate(c, plan));
      continue;
    }
    if (plan.method === "delete") {
      app.delete(plan.path, (c) => handleDelete(c, plan));
    }
  }
}
`;
}

function renderGeneratedCoreApiRealtimeLib(): string {
  return `import { WebSocketServer } from "ws";
import { authenticateWebSocketRequest } from "./auth.js";

const encoder = new TextEncoder();
const channelSpecs = new Map();
const channels = new Map();

function normalizeChannelSpec(spec) {
  return {
    ...spec,
    events: spec.events ?? [],
    notes: spec.notes ?? [],
    presence: spec.presence?.enabled
      ? {
          enabled: true,
          scope: spec.presence.scope || "user",
          fields: spec.presence.fields ?? [],
        }
      : undefined,
  };
}

export function configureRealtime(specs = []) {
  channelSpecs.clear();
  channels.clear();
  for (const spec of specs) {
    channelSpecs.set(spec.id, normalizeChannelSpec(spec));
  }
}

export function getChannelSpec(scope) {
  return channelSpecs.get(scope) || null;
}

function ensureChannel(scope) {
  const spec = getChannelSpec(scope);
  if (!spec) {
    return null;
  }
  if (!channels.has(scope)) {
    channels.set(scope, {
      spec,
      sseSubscribers: new Set(),
      wsSubscribers: new Set(),
      presenceMembers: new Map(),
      history: [],
    });
  }
  return channels.get(scope);
}

function toSseChunk(event) {
  return encoder.encode([
    \`event: \${event.type || "message"}\`,
    \`data: \${JSON.stringify(event)}\`,
    "",
  ].join("\\n"));
}

function sendWebSocketEvent(socket, event) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(event));
  }
}

function resolveEventType(spec, requestedType) {
  const allowed = new Set(spec.events.map((event) => event.type));
  if (requestedType && allowed.has(requestedType)) {
    return requestedType;
  }
  if (allowed.has("message")) {
    return "message";
  }
  return spec.events[0]?.type || "message";
}

function buildEvent(spec, scope, payload, meta = {}) {
  const type = resolveEventType(spec, meta.type);
  const eventSpec = spec.events.find((entry) => entry.type === type);
  return {
    type,
    scope,
    payload,
    meta: {
      ...meta,
      origin: eventSpec?.origin || meta.origin || "system",
    },
    timestamp: new Date().toISOString(),
  };
}

function recordAndBroadcast(channel, event) {
  channel.history.push(event);
  if (channel.history.length > 50) {
    channel.history.shift();
  }

  for (const subscriber of channel.sseSubscribers) {
    subscriber(event);
  }
  for (const socket of channel.wsSubscribers) {
    sendWebSocketEvent(socket, event);
  }
}

export function publish(scope, payload, meta = {}) {
  const channel = ensureChannel(scope);
  if (!channel) {
    throw new Error(\`Unknown realtime channel: \${scope}\`);
  }
  const event = buildEvent(channel.spec, scope, payload, meta);
  recordAndBroadcast(channel, event);
  return event;
}

export function getHistory(scope) {
  const channel = ensureChannel(scope);
  return channel ? [...channel.history] : [];
}

export function validateChannelAccess(spec, actor, action) {
  if (!spec) {
    return { status: 404, message: "Unknown realtime channel." };
  }

  const acl = action === "publish" ? spec.publishAcl : spec.subscribeAcl;
  if (acl === "public") {
    return null;
  }
  if (acl === "service") {
    return actor?.authType === "service"
      ? null
      : { status: 401, message: "Service authentication required for this channel." };
  }
  if (!actor?.authenticated) {
    return { status: 401, message: "Authentication required for this channel." };
  }
  if (acl === "user" && !actor.userId) {
    return { status: 403, message: "This channel requires a user-scoped identity." };
  }
  if (acl === "team" && !actor.workspaceId) {
    return { status: 403, message: "This channel requires a workspace-scoped identity." };
  }
  return null;
}

function buildPresenceMember(context, transport) {
  return {
    connectionId: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12),
    userId: context?.userId || null,
    workspaceId: context?.workspaceId || null,
    role: context?.role || "anonymous",
    transport,
    connectedAt: new Date().toISOString(),
  };
}

function addPresenceMember(channel, scope, context, transport) {
  if (!channel.spec.presence?.enabled || !context?.authenticated) {
    return null;
  }

  const member = buildPresenceMember(context, transport);
  channel.presenceMembers.set(member.connectionId, member);
  recordAndBroadcast(
    channel,
    buildEvent(channel.spec, scope, { member }, {
      type: "presence_join",
      transport,
      userId: context.userId || null,
      workspaceId: context.workspaceId || null,
    })
  );
  return member.connectionId;
}

function removePresenceMember(channel, scope, memberId, context, transport) {
  if (!memberId || !channel.spec.presence?.enabled) {
    return;
  }

  const member = channel.presenceMembers.get(memberId);
  if (!member) {
    return;
  }

  channel.presenceMembers.delete(memberId);
  recordAndBroadcast(
    channel,
    buildEvent(channel.spec, scope, { member }, {
      type: "presence_leave",
      transport,
      userId: context?.userId || null,
      workspaceId: context?.workspaceId || null,
    })
  );
}

function emitPresenceSnapshot(channel, scope, send) {
  if (!channel.spec.presence?.enabled) {
    return;
  }
  send(
    buildEvent(channel.spec, scope, {
      members: [...channel.presenceMembers.values()],
    }, {
      type: "presence_snapshot",
      transport: "internal",
    })
  );
}

export function subscribe(scope, context, extra = {}) {
  const channel = ensureChannel(scope);
  if (!channel) {
    return new Response(JSON.stringify({ ok: false, scope, message: "Unknown realtime channel." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  let heartbeatId;
  let subscriber;
  let presenceId;

  const stream = new ReadableStream({
    start(controller) {
      subscriber = (event) => {
        controller.enqueue(toSseChunk(event));
      };

      channel.sseSubscribers.add(subscriber);
      presenceId = addPresenceMember(channel, scope, context, "sse");
      for (const event of channel.history.slice(-10)) {
        subscriber(event);
      }
      subscriber({
        type: "connected",
        scope,
        payload: { connected: true },
        meta: extra,
        timestamp: new Date().toISOString(),
      });
      emitPresenceSnapshot(channel, scope, subscriber);

      heartbeatId = setInterval(() => {
        subscriber({
          type: "heartbeat",
          scope,
          payload: { ok: true },
          meta: extra,
          timestamp: new Date().toISOString(),
        });
      }, 15000);
    },
    cancel() {
      clearInterval(heartbeatId);
      channel.sseSubscribers.delete(subscriber);
      removePresenceMember(channel, scope, presenceId, context, "sse");
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function destroySocket(socket, statusLine = "HTTP/1.1 401 Unauthorized") {
  if (socket.destroyed) return;
  socket.write(\`\${statusLine}\\r\\nConnection: close\\r\\n\\r\\n\`);
  socket.destroy();
}

export function attachWebSocketServer(server, routePlans) {
  const websocketPlans = routePlans.filter((plan) => plan.kind === "realtime-websocket");
  if (websocketPlans.length === 0) return null;

  const wsServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const host = typeof req.headers.host === "string" && req.headers.host.length > 0 ? req.headers.host : "localhost";
    const url = new URL(req.url || "/", \`http://\${host}\`);
    const plan = websocketPlans.find((candidate) => candidate.path === url.pathname);
    if (!plan) {
      destroySocket(socket, "HTTP/1.1 404 Not Found");
      return;
    }

    const context = await authenticateWebSocketRequest(req);
    const scope = plan.channel || plan.id;
    const channel = ensureChannel(scope);
    const accessError = validateChannelAccess(channel?.spec, context, "subscribe");
    if (accessError) {
      destroySocket(socket, accessError.status === 401 ? "HTTP/1.1 401 Unauthorized" : "HTTP/1.1 403 Forbidden");
      return;
    }

    wsServer.handleUpgrade(req, socket, head, (ws) => {
      if (!channel) {
        destroySocket(socket, "HTTP/1.1 404 Not Found");
        return;
      }
      channel.wsSubscribers.add(ws);
      const presenceId = addPresenceMember(channel, scope, context, "websocket");

      for (const event of channel.history.slice(-10)) {
        sendWebSocketEvent(ws, event);
      }
      sendWebSocketEvent(ws, {
        type: "connected",
        scope,
        payload: {
          connected: true,
          route: plan.id,
        },
        meta: {
          transport: "websocket",
          userId: context.userId,
          workspaceId: context.workspaceId,
        },
        timestamp: new Date().toISOString(),
      });
      emitPresenceSnapshot(channel, scope, (event) => sendWebSocketEvent(ws, event));

      ws.on("message", (raw) => {
        try {
          const message = JSON.parse(String(raw));
          if (message?.type === "ping") {
            sendWebSocketEvent(ws, {
              type: "pong",
              scope,
              payload: { ok: true },
              meta: { route: plan.id },
              timestamp: new Date().toISOString(),
            });
          } else if (message?.type === "publish") {
            const publishError = validateChannelAccess(channel.spec, context, "publish");
            if (publishError) {
              sendWebSocketEvent(ws, {
                type: "error",
                scope,
                payload: { message: publishError.message },
                meta: { route: plan.id },
                timestamp: new Date().toISOString(),
              });
              return;
            }

            const event = publish(scope, message.payload ?? null, {
              type: typeof message.eventType === "string" ? message.eventType : "message",
              origin: "client",
              route: plan.id,
              userId: context.userId || null,
              workspaceId: context.workspaceId || null,
            });
            sendWebSocketEvent(ws, {
              type: "published",
              scope,
              payload: { accepted: true, eventType: event.type },
              meta: { route: plan.id },
              timestamp: new Date().toISOString(),
            });
          } else {
            sendWebSocketEvent(ws, {
              type: "info",
              scope,
              payload: {
                accepted: false,
                reason: "Server-side publish is disabled for client websocket messages in the generated stub.",
              },
              meta: { route: plan.id },
              timestamp: new Date().toISOString(),
            });
          }
        } catch {
          sendWebSocketEvent(ws, {
            type: "error",
            scope,
            payload: { message: "WebSocket messages must be valid JSON." },
            meta: { route: plan.id },
            timestamp: new Date().toISOString(),
          });
        }
      });

      ws.on("close", () => {
        channel.wsSubscribers.delete(ws);
        removePresenceMember(channel, scope, presenceId, context, "websocket");
      });
      ws.on("error", () => {
        channel.wsSubscribers.delete(ws);
        removePresenceMember(channel, scope, presenceId, context, "websocket");
      });
    });
  });

  return wsServer;
}
`;
}

function renderGeneratedCoreApiRealtimeRoutes(): string {
  return `import { getServiceContext, getRequestContext } from "../lib/auth.js";
import { getChannelSpec, getHistory, publish, subscribe, validateChannelAccess } from "../lib/realtime.js";

async function readJsonBody(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function registerRealtimeRoutes(app, routePlans) {
  for (const plan of routePlans.filter((routePlan) => routePlan.kind === "realtime-sse")) {
    app.get(plan.path, async (c) => {
      const channelId = plan.channel || plan.id;
      const channelSpec = getChannelSpec(channelId);
      const context = await getRequestContext(c);
      const accessError = validateChannelAccess(channelSpec, context, "subscribe");
      if (accessError) {
        return c.json({ ok: false, message: accessError.message, route: plan.id, channel: channelId }, accessError.status);
      }
      return subscribe(channelId, context, {
        route: plan.id,
        transport: "sse",
        summary: plan.summary,
        userId: context.userId,
        workspaceId: context.workspaceId,
      });
    });
  }

  for (const plan of routePlans.filter((routePlan) => routePlan.kind === "realtime-websocket")) {
    app.get(plan.path, async (c) => {
      const channelId = plan.channel || plan.id;
      const channelSpec = getChannelSpec(channelId);
      const context = await getRequestContext(c);
      const accessError = validateChannelAccess(channelSpec, context, "subscribe");
      if (accessError) {
        return c.json({ ok: false, message: accessError.message, route: plan.id, channel: channelId }, accessError.status);
      }
      return c.json({
        ok: false,
        route: plan.id,
        channel: channelId,
        message: "Upgrade this endpoint with WebSocket. Pass the Directus JWT as ?token=<jwt> or sec-websocket-protocol=bearer.<jwt>.",
      }, 426);
    });
  }

  app.get("/internal/realtime/scopes/:scope/history", async (c) => {
    const scope = c.req.param("scope");
    const channelSpec = getChannelSpec(scope);
    if (!channelSpec) {
      return c.json({ ok: false, scope, message: "Unknown realtime channel." }, 404);
    }
    const serviceContext = getServiceContext(c);
    if (!serviceContext) {
      const context = await getRequestContext(c);
      const accessError = validateChannelAccess(channelSpec, context, "subscribe");
      if (accessError) {
        return c.json({ ok: false, scope, message: accessError.message }, accessError.status);
      }
    }
    return c.json({
      ok: true,
      scope,
      channel: channelSpec,
      events: getHistory(scope),
    });
  });

  app.post("/internal/realtime/publish/:scope", async (c) => {
    const scope = c.req.param("scope");
    const channelSpec = getChannelSpec(scope);
    const serviceContext = getServiceContext(c);
    const userContext = serviceContext ? null : await getRequestContext(c);
    const actor = serviceContext ?? userContext;
    const accessError = validateChannelAccess(channelSpec, actor, "publish");
    if (accessError) {
      return c.json({ ok: false, scope, message: accessError.message }, accessError.status);
    }

    const body = await readJsonBody(c);
    if (body == null) {
      return c.json({ ok: false, message: "Request body must be valid JSON." }, 400);
    }

    const payload = typeof body === "object" && body && "payload" in body ? body.payload : body;
    const eventType =
      typeof body?.eventType === "string"
        ? body.eventType
        : typeof body?.type === "string"
          ? body.type
          : "message";
    const meta = typeof body?.meta === "object" && body.meta !== null ? body.meta : {};

    const event = publish(scope, payload, {
      ...meta,
      type: eventType,
      route: "internal-publish",
      source: serviceContext?.serviceName || userContext?.userId || "unknown-publisher",
    });
    return c.json({
      ok: true,
      scope,
      event,
      service: serviceContext?.serviceName || null,
      userId: userContext?.userId || null,
    });
  });
}
`;
}

function renderGeneratedRealtimeWorkerIndex(module: WorkerModule): string {
  return `import { channelSpecs, moduleNotes, taskPlans } from "./plans.js";
import { runPlannedTask, describeTasks } from "./handlers.js";

const intervalMs = Number(process.env.WORKER_HEARTBEAT_MS || 30000);

console.log("generated worker ${module.id} starting");
console.log(JSON.stringify({
  worker: ${JSON.stringify(module.id)},
  generated: true,
  tasks: describeTasks(taskPlans, channelSpecs),
  notes: moduleNotes,
}));

for (const task of taskPlans) {
  void runPlannedTask(task, channelSpecs);
}

setInterval(() => {
  console.log(JSON.stringify({
    worker: ${JSON.stringify(module.id)},
    status: "alive",
    timestamp: new Date().toISOString(),
    taskCount: taskPlans.length,
  }));
  for (const task of taskPlans) {
    void runPlannedTask(task, channelSpecs);
  }
}, intervalMs);
`;
}

function renderGeneratedRealtimeWorkerPlans(plan: GeneratedModulePlan, appSpec: AppSpecV2): string {
  const channelSpecs = findReferencedRealtimeChannels(appSpec, (plan.tasks ?? []).map((task) => task.channel));
  return `export const moduleNotes = ${JSON.stringify(plan.notes ?? [], null, 2)};

export const taskPlans = ${JSON.stringify(plan.tasks ?? [], null, 2)};

export const channelSpecs = ${JSON.stringify(channelSpecs, null, 2)};
`;
}

function renderGeneratedRealtimeWorkerHandlers(): string {
  return `function resolvePublishBaseUrl() {
  return (
    process.env.REALTIME_PUBLISH_BASE_URL ||
    process.env.CORE_API_BASE_URL ||
    "http://custom-api-core:3000"
  ).replace(/\\/$/, "");
}

function buildPublishUrl(task) {
  return \`\${resolvePublishBaseUrl()}/internal/realtime/publish/\${encodeURIComponent(task.channel)}\`;
}

function buildHeaders() {
  const token = process.env.PLOYBUNDLE_INTERNAL_TOKEN || "";
  const serviceName = process.env.SERVICE_ID || "generated-worker";
  return {
    "content-type": "application/json",
    authorization: \`Bearer \${token}\`,
    "x-ploybundle-service": serviceName,
  };
}

function buildChannelMap(channelSpecs = []) {
  return new Map(channelSpecs.map((channel) => [channel.id, channel]));
}

function resolveEventType(task, channelMap) {
  const channel = channelMap.get(task.channel);
  if (!channel) return "message";
  if (channel.events.some((event) => event.type === "fanout")) {
    return "fanout";
  }
  if (channel.events.some((event) => event.type === "message")) {
    return "message";
  }
  return channel.events[0]?.type || "message";
}

export function describeTasks(taskPlans, channelSpecs = []) {
  const channelMap = buildChannelMap(channelSpecs);
  return taskPlans.map((task) => ({
    id: task.id,
    kind: task.kind,
    source: task.source,
    channel: task.channel,
    summary: task.summary,
    transport: channelMap.get(task.channel)?.transport || null,
    publishAcl: channelMap.get(task.channel)?.publishAcl || null,
  }));
}

function logResult(status, task, extra = {}) {
  console.log(JSON.stringify({
    status,
    task: task.id,
    kind: task.kind,
    source: task.source,
    channel: task.channel,
    notes: task.notes ?? [],
    ...extra,
  }));
}

export async function runPlannedTask(task, channelSpecs = []) {
  const channelMap = buildChannelMap(channelSpecs);
  const eventType = resolveEventType(task, channelMap);
  const channel = channelMap.get(task.channel);
  const payload = {
    eventType,
    payload: {
      taskId: task.id,
      source: task.source,
      summary: task.summary,
      timestamp: new Date().toISOString(),
      localDev: true,
    },
    meta: {
      origin: "worker",
      channelTransport: channel?.transport || null,
      sourceTask: task.id,
    },
  };

  try {
    const response = await fetch(buildPublishUrl(task), {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logResult("publish-error", task, {
        httpStatus: response.status,
        message: "Realtime publish endpoint returned a non-success status.",
      });
      return;
    }

    const result = await response.json().catch(() => null);
    logResult("published", task, {
      publishUrl: buildPublishUrl(task),
      eventType,
      transport: channel?.transport || null,
      result,
    });
  } catch (error) {
    logResult("publish-error", task, {
      publishUrl: buildPublishUrl(task),
      eventType,
      transport: channel?.transport || null,
      message: error instanceof Error ? error.message : String(error),
      nextSteps: [
        "Ensure the generated core API is reachable from this worker.",
        "Replace this HTTP publish step with your real queue or event bus.",
      ],
    });
  }
}
`;
}

function renderDenoCustomApiEntry(module: CustomApiModule): string {
  return `const port = Number(Deno.env.get("PORT") || "3000");

Deno.serve({ port, hostname: "0.0.0.0" }, () =>
  new Response(JSON.stringify({ status: "ok", service: ${JSON.stringify(module.id)} }), {
    headers: { "content-type": "application/json" },
  })
);
`;
}

function renderDenoWorkerEntry(module: WorkerModule): string {
  return `const intervalMs = Number(Deno.env.get("WORKER_HEARTBEAT_MS") || "30000");

console.log("worker ${module.id} starting");

while (true) {
  console.log(JSON.stringify({
    worker: ${JSON.stringify(module.id)},
    kind: ${JSON.stringify(module.kind)},
    status: "alive",
    timestamp: new Date().toISOString(),
  }));
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
`;
}

function renderDenoJson(entrypoint: string): string {
  return JSON.stringify(
    {
      tasks: {
        start: `deno run --allow-net --allow-env ${entrypoint}`,
      },
    },
    null,
    2
  );
}

function renderDenoDockerfile(entrypoint: string): string {
  return `FROM denoland/deno:alpine-2.1.4
WORKDIR /app
COPY . .
CMD ["deno", "run", "--allow-net", "--allow-env", "${entrypoint}"]
`;
}

function renderPythonFastApiEntry(module: CustomApiModule): string {
  return `from fastapi import FastAPI
import uvicorn
import os

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok", "service": ${JSON.stringify(module.id)}}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
`;
}

function renderPythonWorkerEntry(module: WorkerModule): string {
  return `import json
import os
import time
from datetime import datetime, timezone

interval_ms = int(os.getenv("WORKER_HEARTBEAT_MS", "30000"))

print("worker ${module.id} starting")

while True:
    print(json.dumps({
        "worker": ${JSON.stringify(module.id)},
        "kind": ${JSON.stringify(module.kind)},
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }))
    time.sleep(interval_ms / 1000)
`;
}

function renderPythonDockerfile(entrypoint: string): string {
  return `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "${entrypoint}"]
`;
}

function renderPythonRequirements(customApi: boolean): string {
  return customApi ? "fastapi==0.115.0\nuvicorn==0.30.6\n" : "";
}

function renderModuleFiles(basePath: string, files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([relativeName, content]) => [`${basePath}/${relativeName}`, content])
  );
}

function renderCustomApiFiles(module: CustomApiModule, appSpec: AppSpecV2, plan?: GeneratedModulePlan): Record<string, string> {
  const basePath = normalizePath(module.path);

  if (plan?.template === "supabase-core-api" && module.runtime === "node") {
    return renderModuleFiles(basePath, {
      "package.json": renderNodePackageJson(`${module.id}-api`, { hono: "^4.6.3", "@hono/node-server": "^1.13.7", jose: "^5.9.6", pg: "^8.12.0", ws: "^8.18.0" }),
      "src/index.js": renderGeneratedCoreApiIndex(module),
      "src/plans.js": renderGeneratedCoreApiPlans(plan, appSpec),
      "src/lib/db.js": renderGeneratedCoreApiDbLib(),
      "src/lib/auth.js": renderGeneratedCoreApiAuthLib(),
      "src/lib/realtime.js": renderGeneratedCoreApiRealtimeLib(),
      "src/routes/authz.js": renderGeneratedCoreApiAuthzRoutes(),
      "src/routes/realtime.js": renderGeneratedCoreApiRealtimeRoutes(),
      "Dockerfile": renderNodeDockerfile(),
      ".dockerignore": "node_modules\nnpm-debug.log*\n",
    });
  }

  if (module.runtime === "python") {
    return renderModuleFiles(basePath, {
      "main.py": renderPythonFastApiEntry(module),
      "requirements.txt": renderPythonRequirements(true),
      "Dockerfile": renderPythonDockerfile("main.py"),
      ".dockerignore": "venv\n__pycache__\n",
    });
  }

  if (module.runtime === "deno") {
    return renderModuleFiles(basePath, {
      "main.ts": renderDenoCustomApiEntry(module),
      "deno.json": renderDenoJson("main.ts"),
      "Dockerfile": renderDenoDockerfile("main.ts"),
      ".dockerignore": ".git\n",
    });
  }

  const frameworkDependencies: Record<string, string> =
    module.framework === "express"
      ? { express: "^4.21.0" }
      : module.framework === "none"
        ? {}
        : { hono: "^4.6.3", "@hono/node-server": "^1.13.7" };

  return renderModuleFiles(basePath, {
    "package.json": renderNodePackageJson(`${module.id}-api`, frameworkDependencies),
    "src/index.js": renderNodeCustomApiEntry(module),
    "Dockerfile": renderNodeDockerfile(),
    ".dockerignore": "node_modules\nnpm-debug.log*\n",
  });
}

function renderWorkerFiles(module: WorkerModule, appSpec: AppSpecV2, plan?: GeneratedModulePlan): Record<string, string> {
  const basePath = normalizePath(module.path);

  if (plan?.template === "supabase-realtime-worker" && module.runtime === "node") {
    return renderModuleFiles(basePath, {
      "package.json": renderNodeWorkerPackageJson(`${module.id}-worker`),
      "src/index.js": renderGeneratedRealtimeWorkerIndex(module),
      "src/plans.js": renderGeneratedRealtimeWorkerPlans(plan, appSpec),
      "src/handlers.js": renderGeneratedRealtimeWorkerHandlers(),
      "Dockerfile": renderNodeDockerfile(),
      ".dockerignore": "node_modules\nnpm-debug.log*\n",
    });
  }

  if (module.runtime === "python") {
    return renderModuleFiles(basePath, {
      "main.py": renderPythonWorkerEntry(module),
      "requirements.txt": renderPythonRequirements(false),
      "Dockerfile": renderPythonDockerfile("main.py"),
      ".dockerignore": "venv\n__pycache__\n",
    });
  }

  if (module.runtime === "deno") {
    return renderModuleFiles(basePath, {
      "main.ts": renderDenoWorkerEntry(module),
      "deno.json": renderDenoJson("main.ts"),
      "Dockerfile": renderDenoDockerfile("main.ts"),
      ".dockerignore": ".git\n",
    });
  }

  return renderModuleFiles(basePath, {
    "package.json": renderNodeWorkerPackageJson(`${module.id}-worker`),
    "src/index.js": renderNodeWorkerEntry(module),
    "Dockerfile": renderNodeDockerfile(),
    ".dockerignore": "node_modules\nnpm-debug.log*\n",
  });
}

export function renderSpecModuleFiles(config: ProjectConfig): Record<string, string> {
  const appSpec = (config as ProjectConfigWithAppSpec).appSpec;
  if (!appSpec) return {};

  const files: Record<string, string> = {};
  const scaffoldCustomApis = appSpec.generation?.scaffoldCustomApis ?? true;
  const scaffoldCustomApiIds = new Set(appSpec.generation?.scaffoldCustomApiIds ?? []);
  const scaffoldWorkers = appSpec.generation?.scaffoldWorkers ?? true;
  const scaffoldWorkerIds = new Set(appSpec.generation?.scaffoldWorkerIds ?? []);

  for (const module of appSpec.modules.customApis ?? []) {
    if (!module.enabled) continue;
    if (scaffoldCustomApis || scaffoldCustomApiIds.has(module.id)) {
      Object.assign(files, renderCustomApiFiles(module, appSpec, findGeneratedModulePlan(appSpec, "custom-api", module.id)));
    }
  }

  for (const module of appSpec.modules.workers ?? []) {
    if (!module.enabled) continue;
    if (scaffoldWorkers || scaffoldWorkerIds.has(module.id)) {
      Object.assign(files, renderWorkerFiles(module, appSpec, findGeneratedModulePlan(appSpec, "worker", module.id)));
    }
  }

  return files;
}
