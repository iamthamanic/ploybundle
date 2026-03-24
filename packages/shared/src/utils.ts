import { randomBytes } from "node:crypto";
import type { DomainConfig, ProjectUrls } from "./types.js";
import { DEFAULT_SUBDOMAINS } from "./constants.js";

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

export function buildDomainConfig(rootDomain: string, overrides?: Partial<DomainConfig>): DomainConfig {
  return {
    root: rootDomain,
    app: overrides?.app ?? rootDomain,
    admin: overrides?.admin ?? `${DEFAULT_SUBDOMAINS.admin}.${rootDomain}`,
    storage: overrides?.storage ?? `${DEFAULT_SUBDOMAINS.storage}.${rootDomain}`,
    functions: overrides?.functions ?? `${DEFAULT_SUBDOMAINS.functions}.${rootDomain}`,
    deploy: overrides?.deploy ?? `${DEFAULT_SUBDOMAINS.deploy}.${rootDomain}`,
    dashboard: overrides?.dashboard ?? `${DEFAULT_SUBDOMAINS.dashboard}.${rootDomain}`,
  };
}

export function buildProjectUrls(domain: DomainConfig): ProjectUrls {
  return {
    app: `https://${domain.app ?? domain.root}`,
    admin: `https://${domain.admin ?? `admin.${domain.root}`}`,
    storage: `https://${domain.storage ?? `storage.${domain.root}`}`,
    functions: `https://${domain.functions ?? `fn.${domain.root}`}`,
    deploy: `https://${domain.deploy ?? `deploy.${domain.root}`}`,
    dashboard: `https://${domain.dashboard ?? `home.${domain.root}`}`,
  };
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
  if (value.includes(" ") || value.includes('"') || value.includes("'")) {
    return `${key}="${value.replace(/"/g, '\\"')}"`;
  }
  return `${key}=${value}`;
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
