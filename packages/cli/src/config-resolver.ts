import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfigFromFile, parseAndValidateConfig, mergeOverrides } from "@ploybundle/core";
import type { ProjectConfig } from "@ploybundle/shared";
import { ConfigError, CONFIG_FILENAME } from "@ploybundle/shared";

function inferProjectName(raw: Record<string, unknown>): string | undefined {
  if (typeof raw.projectName === "string" && raw.projectName.length > 0) {
    return raw.projectName;
  }

  const app = raw.app;
  if (app && typeof app === "object" && typeof (app as Record<string, unknown>).id === "string") {
    return (app as Record<string, unknown>).id as string;
  }

  return undefined;
}

export function resolveProjectNameFromConfig(configPath?: string): string {
  const filePath = resolve(configPath ?? CONFIG_FILENAME);

  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath}`,
      `Create a ${CONFIG_FILENAME} file or run 'ploybundle init' to generate one.`
    );
  }

  const raw = loadConfigFromFile(filePath);
  const projectName = inferProjectName(raw);
  if (!projectName) {
    throw new ConfigError(
      "Could not determine project name from config",
      "Set projectName in a legacy config or app.id in an AppSpec v2 file."
    );
  }

  return projectName;
}

export function resolveProjectConfig(projectName?: string, configPath?: string, mode?: string): ProjectConfig {
  const filePath = resolve(configPath ?? CONFIG_FILENAME);

  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath}`,
      `Create a ${CONFIG_FILENAME} file or run 'ploybundle init' to generate one.`
    );
  }

  const raw = loadConfigFromFile(filePath);
  const resolvedProjectName = projectName ?? inferProjectName(raw);
  if (!resolvedProjectName) {
    throw new ConfigError(
      "Project name is required",
      "Pass the project name explicitly or define projectName/app.id in the config file."
    );
  }

  const merged = mergeOverrides(raw, {
    projectName: resolvedProjectName,
    mode,
    projectRoot: dirname(filePath),
  });

  return parseAndValidateConfig(merged);
}
