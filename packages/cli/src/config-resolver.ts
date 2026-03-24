import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfigFromFile, parseAndValidateConfig, mergeOverrides } from "@ploybundle/core";
import type { ProjectConfig } from "@ploybundle/shared";
import { ConfigError, CONFIG_FILENAME } from "@ploybundle/shared";

export function resolveProjectConfig(projectName: string, configPath?: string): ProjectConfig {
  const filePath = resolve(configPath ?? CONFIG_FILENAME);

  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found: ${filePath}`,
      `Create a ${CONFIG_FILENAME} file or run 'ploybundle init' to generate one.`
    );
  }

  const raw = loadConfigFromFile(filePath);

  // Ensure project name matches
  const merged = mergeOverrides(raw, { projectName });

  return parseAndValidateConfig(merged);
}
