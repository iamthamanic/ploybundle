import type { PresetDefinition, PresetName } from "@ploybundle/shared";
import { ConfigError } from "@ploybundle/shared";
import { learningAppPreset } from "./learning-app.js";
import { crudSaasPreset } from "./crud-saas.js";
import { contentAppPreset } from "./content-app.js";
import { workflowAppPreset } from "./workflow-app.js";

const presetRegistry: ReadonlyMap<PresetName, PresetDefinition> = new Map([
  ["learning-app", learningAppPreset],
  ["crud-saas", crudSaasPreset],
  ["content-app", contentAppPreset],
  ["workflow-app", workflowAppPreset],
]);

export function getPreset(name: PresetName): PresetDefinition {
  const preset = presetRegistry.get(name);
  if (!preset) {
    throw new ConfigError(
      `Unknown preset: ${name}`,
      `Available presets: ${[...presetRegistry.keys()].join(", ")}`
    );
  }
  return preset;
}

export function listPresets(): PresetDefinition[] {
  return [...presetRegistry.values()];
}

export { learningAppPreset, crudSaasPreset, contentAppPreset, workflowAppPreset };
