import { randomBytes } from "node:crypto";
import type { AppSpecV2, DomainConfig, ProjectUrls, ProjectConfig, ServiceToggle } from "./types.js";
import { DEFAULT_SUBDOMAINS } from "./constants.js";

type ProjectConfigWithAppSpec = ProjectConfig & { appSpec?: AppSpecV2 };

export function generateSecret(length: number = 32): string {
  return randomBytes(length).toString("hex").slice(0, length);
}

export function generatePassword(length: number = 24): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i]! % chars.length];
  }
  return password;
}

/** Whether this compose-exposed service is enabled for the current project (nextjs vs vite are mutually exclusive). */
export function isStackServiceEnabled(config: ProjectConfig, service: string): boolean {
  if (service === "vite") {
    return Boolean(config.services.nextjs && config.frontend === "vite-react");
  }
  if (service === "nextjs") {
    return Boolean(config.services.nextjs && config.frontend !== "vite-react");
  }
  if (service.startsWith("custom-api-")) {
    const appSpec = (config as ProjectConfigWithAppSpec).appSpec;
    const moduleId = service.slice("custom-api-".length);
    return Boolean(appSpec?.modules.customApis?.some((api) => api.id === moduleId && api.enabled));
  }
  if (service.startsWith("worker-")) {
    const appSpec = (config as ProjectConfigWithAppSpec).appSpec;
    const moduleId = service.slice("worker-".length);
    return Boolean(appSpec?.modules.workers?.some((worker) => worker.id === moduleId && worker.enabled));
  }
  return Boolean(config.services[service as keyof ServiceToggle]);
}

export function listStackServices(config: ProjectConfig): string[] {
  const services: string[] = ["nextjs", "vite", "postgres", "redis", "directus", "seaweedfs", "windmill", "hub"];
  const appSpec = (config as ProjectConfigWithAppSpec).appSpec;

  for (const api of appSpec?.modules.customApis ?? []) {
    if (api.enabled) services.push(`custom-api-${api.id}`);
  }

  for (const worker of appSpec?.modules.workers ?? []) {
    if (worker.enabled) services.push(`worker-${worker.id}`);
  }

  return services;
}

export function buildDomainConfig(rootDomain: string, overrides?: Partial<DomainConfig>): DomainConfig {
  return {
    root: rootDomain,
    app: overrides?.app ?? rootDomain,
    admin: overrides?.admin ?? `${DEFAULT_SUBDOMAINS.admin}.${rootDomain}`,
    storage: overrides?.storage ?? `${DEFAULT_SUBDOMAINS.storage}.${rootDomain}`,
    storageBrowser: overrides?.storageBrowser,
    databaseBrowser: overrides?.databaseBrowser,
    functions: overrides?.functions ?? `${DEFAULT_SUBDOMAINS.functions}.${rootDomain}`,
    deploy: overrides?.deploy ?? `${DEFAULT_SUBDOMAINS.deploy}.${rootDomain}`,
    dashboard: overrides?.dashboard ?? `${DEFAULT_SUBDOMAINS.dashboard}.${rootDomain}`,
    scheme: overrides?.scheme,
  };
}

/**
 * Local dev URLs use numeric loopback so browsers don’t resolve `localhost` to IPv6 (::1) while
 * Docker publishes ports on IPv4 only (common macOS symptom: “connection refused” to localhost).
 */
export function buildLocalDomainConfig(overrides?: Partial<DomainConfig>): DomainConfig {
  return {
    root: overrides?.root ?? "127.0.0.1",
    app: overrides?.app ?? "127.0.0.1:3001",
    admin: overrides?.admin ?? "127.0.0.1:8055",
    storage: overrides?.storage ?? "127.0.0.1:8333",
    storageBrowser: overrides?.storageBrowser ?? "127.0.0.1:9333",
    databaseBrowser: overrides?.databaseBrowser ?? "127.0.0.1:8088",
    functions: overrides?.functions ?? "127.0.0.1:8000",
    /** CapRover default UI is often :3000; Coolify often :8000 — override in ploybundle.yaml when needed. */
    deploy: overrides?.deploy ?? "127.0.0.1:3000",
    dashboard: overrides?.dashboard ?? "127.0.0.1:7580",
    scheme: overrides?.scheme ?? "http",
  };
}

export function buildProjectUrls(domain: DomainConfig): ProjectUrls {
  const s = domain.scheme ?? "https";
  const origin = (host: string) => `${s}://${host}`;
  const storageHost = domain.storage ?? `storage.${domain.root}`;
  const storageBrowserHost = domain.storageBrowser ?? storageHost;
  const urls: ProjectUrls = {
    app: origin(domain.app ?? domain.root),
    admin: origin(domain.admin ?? `admin.${domain.root}`),
    storage: origin(storageHost),
    storageBrowser: origin(storageBrowserHost),
    functions: origin(domain.functions ?? `fn.${domain.root}`),
    deploy: origin(domain.deploy ?? `deploy.${domain.root}`),
    dashboard: origin(domain.dashboard ?? `home.${domain.root}`),
  };
  if (domain.databaseBrowser) {
    urls.databaseBrowser = origin(domain.databaseBrowser);
  }
  return urls;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseSshTarget(target: string): { user: string; host: string; port: number } {
  // Format: user@host or user@host:port
  const portMatch = target.match(/:(\d+)$/);
  const port = portMatch ? parseInt(portMatch[1]!, 10) : 22;
  const withoutPort = portMatch ? target.slice(0, -portMatch[0].length) : target;

  const parts = withoutPort.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid SSH target format: ${target}. Expected user@host or user@host:port`);
  }

  return { user: parts[0], host: parts[1], port };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function maskSecret(secret: string, visibleChars: number = 4): string {
  if (secret.length <= visibleChars) return "****";
  return secret.slice(0, visibleChars) + "****";
}

export function envLine(key: string, value: string): string {
  // Compose interpolates `$VAR` inside .env and compose YAML; `$$` becomes a literal `$`.
  const escapedDollar = value.replace(/\$/g, "$$$$");
  if (
    escapedDollar.includes(" ") ||
    escapedDollar.includes('"') ||
    escapedDollar.includes("'")
  ) {
    return `${key}="${escapedDollar.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${escapedDollar}`;
}

export function buildEnvFile(entries: Record<string, string>): string {
  return Object.entries(entries)
    .map(([key, value]) => envLine(key, value))
    .join("\n") + "\n";
}

export function indent(text: string, spaces: number = 2): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? prefix + line : line))
    .join("\n");
}

export function timestampNow(): string {
  return new Date().toISOString();
}
