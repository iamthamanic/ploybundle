import type { PlatformAdapter, PlatformTarget, ProjectConfig } from "@ploybundle/shared";
import { ConfigError } from "@ploybundle/shared";
import { CaproverAdapter } from "@ploybundle/platform-caprover";
import { CoolifyAdapter } from "@ploybundle/platform-coolify";
import { LocalAdapter } from "./local-adapter.js";

export function createAdapter(config: Pick<ProjectConfig, "mode" | "target">): PlatformAdapter {
  if (config.mode === "local") {
    return new LocalAdapter();
  }

  switch (config.target as PlatformTarget) {
    case "lite":
      return new CaproverAdapter();
    case "full":
      return new CoolifyAdapter();
    default:
      throw new ConfigError(
        `Unknown target: ${config.target as string}`,
        `Valid targets are: lite, full`
      );
  }
}
