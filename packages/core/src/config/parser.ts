import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ConfigError, ValidationError, buildDomainConfig, parseSshTarget } from "@ploybundle/shared";
import { projectConfigSchema, type ProjectConfigInput } from "./schema.js";
import type { ProjectConfig } from "@ploybundle/shared";

export interface CliOverrides {
  projectName?: string;
  target?: string;
  preset?: string;
  domain?: string;
  host?: string;
  email?: string;
  resourceProfile?: string;
  providerHint?: string;
}

export function loadConfigFromFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath}`,
      `Create a ploybundle.yaml file or use CLI flags to specify configuration.`
    );
  }

  const raw = readFileSync(filePath, "utf-8");
  try {
    return parseYaml(raw) as Record<string, unknown>;
  } catch (err) {
    throw new ConfigError(
      `Failed to parse config file: ${filePath}`,
      `Check YAML syntax. Error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function mergeOverrides(
  base: Record<string, unknown>,
  overrides: CliOverrides
): Record<string, unknown> {
  const merged = { ...base };

  if (overrides.projectName) merged.projectName = overrides.projectName;
  if (overrides.target) merged.target = overrides.target;
  if (overrides.preset) merged.preset = overrides.preset;
  if (overrides.resourceProfile) merged.resourceProfile = overrides.resourceProfile;
  if (overrides.providerHint) merged.providerHint = overrides.providerHint;

  if (overrides.domain) {
    merged.domain = buildDomainConfig(overrides.domain);
  }

  if (overrides.host) {
    const { user, host, port } = parseSshTarget(overrides.host);
    merged.ssh = { user, host, port };
  }

  if (overrides.email) {
    merged.email = overrides.email;
    if (!merged.directus || typeof merged.directus !== "object") {
      merged.directus = { adminEmail: overrides.email };
    } else {
      (merged.directus as Record<string, unknown>).adminEmail = overrides.email;
    }
  }

  return merged;
}

export function parseAndValidateConfig(input: Record<string, unknown>): ProjectConfig {
  const result = projectConfigSchema.safeParse(input);

  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      fields[path] = issue.message;
    }
    throw new ValidationError(
      "Invalid project configuration",
      fields,
      `Check your ploybundle.yaml or CLI flags. Issues: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(", ")}`
    );
  }

  // Build full domain config with defaults
  const parsed = result.data;
  const domain = buildDomainConfig(parsed.domain.root, parsed.domain);

  return {
    ...parsed,
    domain,
    target: parsed.target as ProjectConfig["target"],
    preset: parsed.preset as ProjectConfig["preset"],
    resourceProfile: parsed.resourceProfile as ProjectConfig["resourceProfile"],
    providerHint: parsed.providerHint as ProjectConfig["providerHint"],
  };
}

export function buildConfigFromFlags(overrides: CliOverrides): ProjectConfig {
  if (!overrides.projectName) {
    throw new ConfigError("Project name is required", "Provide a project name as the first argument.");
  }
  if (!overrides.domain) {
    throw new ConfigError("Domain is required", "Use --domain to specify the root domain.");
  }
  if (!overrides.host) {
    throw new ConfigError("Host is required", "Use --host to specify the SSH target (e.g., root@IP).");
  }
  if (!overrides.preset) {
    throw new ConfigError("Preset is required", "Use --preset to specify a preset (e.g., learning-app).");
  }

  const { user, host, port } = parseSshTarget(overrides.host);
  const email = overrides.email ?? `admin@${overrides.domain}`;

  const input: ProjectConfigInput = {
    projectName: overrides.projectName,
    target: (overrides.target ?? "lite") as "lite" | "full",
    preset: overrides.preset as ProjectConfigInput["preset"],
    domain: buildDomainConfig(overrides.domain),
    ssh: { user, host, port },
    email,
    directus: { adminEmail: email },
    resourceProfile: (overrides.resourceProfile ?? "small") as ProjectConfigInput["resourceProfile"],
    providerHint: (overrides.providerHint ?? "generic") as ProjectConfigInput["providerHint"],
  };

  return parseAndValidateConfig(input as unknown as Record<string, unknown>);
}
