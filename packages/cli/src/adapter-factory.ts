import type { PlatformAdapter, PlatformTarget } from "@ploybundle/shared";
import { ConfigError } from "@ploybundle/shared";
import { CaproverAdapter } from "@ploybundle/platform-caprover";
import { CoolifyAdapter } from "@ploybundle/platform-coolify";

export function createAdapter(target: PlatformTarget): PlatformAdapter {
  switch (target) {
    case "lite":
      return new CaproverAdapter();
    case "full":
      return new CoolifyAdapter();
    default:
      throw new ConfigError(
        `Unknown target: ${target as string}`,
        `Valid targets are: lite, full`
      );
  }
}
