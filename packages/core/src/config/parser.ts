import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import {
  ConfigError,
  ValidationError,
  buildDomainConfig,
  buildLocalDomainConfig,
  parseSshTarget,
  DEFAULT_MODE,
  DEFAULT_SERVICE_TOGGLE,
  DEFAULT_RESOURCE_PROFILE,
  DEFAULT_PROVIDER_HINT,
  DEFAULT_SSH_PORT,
  DEFAULT_PRODUCT_FRONTEND,
} from "@ploybundle/shared";
import {
  projectConfigFileSchema,
  projectConfigSchema,
  type ProjectConfigInput,
  type ProjectConfigFileParsed,
} from "./schema.js";
import {
  isAppSpecV2Candidate,
  materializeProjectConfigFromAppSpec,
  parseAndValidateAppSpec,
} from "./app-spec-parser.js";
import type { ProjectConfig, ProjectMode, DomainConfig, ServiceToggle, SshTarget } from "@ploybundle/shared";

export interface CliOverrides {
  projectName?: string;
  mode?: string;
  target?: string;
  preset?: string;
  domain?: string;
  host?: string;
  email?: string;
  resourceProfile?: string;
  providerHint?: string;
  projectRoot?: string;
  frontend?: string;
}

function defaultLocalSshTarget(): SshTarget {
  return {
    host: "127.0.0.1",
    port: DEFAULT_SSH_PORT,
    user: "root",
  };
}

function mergeServiceToggles(
  base: ServiceToggle,
  override?: Partial<ServiceToggle>
): ServiceToggle {
  return {
    ...DEFAULT_SERVICE_TOGGLE,
    ...base,
    ...override,
  };
}

function resolveMode(parsed: ProjectConfigFileParsed): ProjectMode {
  const hasLocalMode = Boolean(parsed.modes?.local);
  const hasServerMode = Boolean(parsed.modes?.server);
  const topLevelLooksLocal =
    parsed.domain?.root === "localhost" || parsed.domain?.root === "127.0.0.1";

  if (parsed.mode) {
    return parsed.mode as ProjectMode;
  }

  if (topLevelLooksLocal && !hasServerMode) {
    return "local";
  }

  if (hasLocalMode && !hasServerMode && !parsed.target && !parsed.domain && !parsed.ssh) {
    return "local";
  }

  return DEFAULT_MODE;
}

function resolveLocalDomain(parsed: ProjectConfigFileParsed): DomainConfig {
  const hasLocalMode = Boolean(parsed.modes?.local);
  const topLevelLooksLocal =
    parsed.mode === "local" ||
    parsed.domain?.root === "localhost" ||
    parsed.domain?.root === "127.0.0.1";
  const overrides = hasLocalMode
    ? parsed.modes?.local?.domain
    : topLevelLooksLocal
      ? parsed.domain
      : undefined;

  return buildLocalDomainConfig(overrides);
}

function resolveServerDomain(parsed: ProjectConfigFileParsed): DomainConfig {
  const domainInput = parsed.modes?.server?.domain ?? parsed.domain;
  return buildDomainConfig(domainInput?.root ?? "", domainInput);
}

function resolveLocalSsh(parsed: ProjectConfigFileParsed): SshTarget {
  const base = defaultLocalSshTarget();
  const topLevelLooksLocal =
    parsed.mode === "local" ||
    parsed.domain?.root === "localhost" ||
    parsed.domain?.root === "127.0.0.1";
  const sshOverride = parsed.modes?.local?.ssh ?? (topLevelLooksLocal ? parsed.ssh : undefined);

  return {
    ...base,
    ...sshOverride,
  };
}

function resolveServerSsh(parsed: ProjectConfigFileParsed): SshTarget {
  return {
    host: parsed.modes?.server?.ssh?.host ?? parsed.ssh?.host ?? "",
    port: parsed.modes?.server?.ssh?.port ?? parsed.ssh?.port ?? DEFAULT_SSH_PORT,
    user: parsed.modes?.server?.ssh?.user ?? parsed.ssh?.user ?? "root",
    privateKeyPath: parsed.modes?.server?.ssh?.privateKeyPath ?? parsed.ssh?.privateKeyPath,
  };
}

function resolveProjectInput(parsed: ProjectConfigFileParsed): Record<string, unknown> {
  const mode = resolveMode(parsed);
  const modeOverrides = parsed.modes?.[mode];
  const services = mergeServiceToggles(parsed.services, modeOverrides?.services);

  const resolved: Record<string, unknown> = {
    projectName: parsed.projectName,
    mode,
    target: mode === "server" ? (modeOverrides?.target ?? parsed.target) : undefined,
    preset: parsed.preset,
    domain: mode === "local" ? resolveLocalDomain(parsed) : resolveServerDomain(parsed),
    ssh: mode === "local" ? resolveLocalSsh(parsed) : resolveServerSsh(parsed),
    projectRoot: parsed.projectRoot ?? process.cwd(),
    email: modeOverrides?.email ?? parsed.email,
    frontend: modeOverrides?.frontend ?? parsed.frontend ?? DEFAULT_PRODUCT_FRONTEND,
    services,
    buckets: modeOverrides?.buckets ?? parsed.buckets,
    directus: {
      ...parsed.directus,
      ...modeOverrides?.directus,
    },
    windmill: {
      ...parsed.windmill,
      ...modeOverrides?.windmill,
    },
    resourceProfile: modeOverrides?.resourceProfile ?? parsed.resourceProfile ?? DEFAULT_RESOURCE_PROFILE,
    providerHint: modeOverrides?.providerHint ?? parsed.providerHint ?? DEFAULT_PROVIDER_HINT,
    ...(parsed.hubPresentation ? { hubPresentation: parsed.hubPresentation } : {}),
  };

  return resolved;
}

export function loadConfigFromFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath}`,
      "Create a ploybundle.yaml file or use CLI flags to specify configuration."
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
  if (overrides.mode) merged.mode = overrides.mode;
  if (overrides.target) merged.target = overrides.target;
  if (overrides.preset) merged.preset = overrides.preset;
  if (overrides.resourceProfile) merged.resourceProfile = overrides.resourceProfile;
  if (overrides.providerHint) merged.providerHint = overrides.providerHint;
  if (overrides.projectRoot) merged.projectRoot = overrides.projectRoot;
  if (overrides.frontend) merged.frontend = overrides.frontend;

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
  if (isAppSpecV2Candidate(input)) {
    const spec = parseAndValidateAppSpec(input);
    return materializeProjectConfigFromAppSpec(spec, {
      mode: typeof input.mode === "string" ? input.mode : undefined,
      projectRoot: typeof input.projectRoot === "string" ? input.projectRoot : undefined,
      projectNameOverride: typeof input.projectName === "string" ? input.projectName : undefined,
    });
  }

  const parsedFile = projectConfigFileSchema.safeParse(input);

  if (!parsedFile.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsedFile.error.issues) {
      const path = issue.path.join(".");
      fields[path] = issue.message;
    }
    throw new ValidationError(
      "Invalid project configuration",
      fields,
      `Check your ploybundle.yaml or CLI flags. Issues: ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(", ")}`
    );
  }

  const resolvedInput = resolveProjectInput(parsedFile.data);
  const result = projectConfigSchema.safeParse(resolvedInput);

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

  return {
    ...result.data,
    mode: result.data.mode as ProjectConfig["mode"],
    target: result.data.target as ProjectConfig["target"],
    preset: result.data.preset as ProjectConfig["preset"],
    frontend: result.data.frontend as ProjectConfig["frontend"],
    resourceProfile: result.data.resourceProfile as ProjectConfig["resourceProfile"],
    providerHint: result.data.providerHint as ProjectConfig["providerHint"],
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
    mode: "server",
    target: (overrides.target ?? "lite") as "lite" | "full",
    preset: overrides.preset as ProjectConfigInput["preset"],
    domain: buildDomainConfig(overrides.domain),
    ssh: { user, host, port },
    projectRoot: overrides.projectRoot ?? process.cwd(),
    email,
    frontend: (overrides.frontend ?? DEFAULT_PRODUCT_FRONTEND) as ProjectConfigInput["frontend"],
    directus: { adminEmail: email },
    resourceProfile: (overrides.resourceProfile ?? "small") as ProjectConfigInput["resourceProfile"],
    providerHint: (overrides.providerHint ?? "generic") as ProjectConfigInput["providerHint"],
  };

  return parseAndValidateConfig(input as unknown as Record<string, unknown>);
}
