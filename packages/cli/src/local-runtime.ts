import path from "node:path";
import { STATE_DIR } from "@ploybundle/shared";

export function getLocalRuntimeRoot(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR, "local");
}

export function getLocalStackRoot(projectRoot: string): string {
  return path.join(getLocalRuntimeRoot(projectRoot), "stack");
}

export function getLocalManifestPath(projectRoot: string): string {
  return path.join(getLocalRuntimeRoot(projectRoot), "manifest.json");
}

export function getPromoteStateRoot(projectRoot: string): string {
  return path.join(projectRoot, STATE_DIR, "promote");
}
