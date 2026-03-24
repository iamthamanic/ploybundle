import type { ProjectConfig, StackArtifacts } from "@ploybundle/shared";
import { buildEnvFile } from "@ploybundle/shared";
import type { ArtifactRenderer } from "@ploybundle/core";
import { getPreset } from "../presets/index.js";
import { renderComposeFile } from "./compose-renderer.js";
import { renderFullHomepageBundle } from "./homepage-renderer.js";
import { renderSeaweedfsConfig, renderBucketInitScript } from "./seaweedfs-renderer.js";
import { renderDirectusEnv, renderDirectusBootstrapScript, renderDirectusRolesScript } from "./directus-renderer.js";
import { renderWindmillBootstrapScript, renderWindmillEnv } from "./windmill-renderer.js";
import {
  renderNextjsPackageJson,
  renderNextjsConfig,
  renderNextjsTsConfig,
  renderNextjsLayout,
  renderNextjsGlobalsCss,
  renderNextjsHomePage,
  renderNextjsHealthRoute,
  renderNextjsEnvLocal,
} from "./nextjs-renderer.js";

export class StackArtifactRenderer implements ArtifactRenderer {
  render(config: ProjectConfig, env: Record<string, string>): StackArtifacts {
    const preset = getPreset(config.preset);

    // Merge preset env defaults into env
    const mergedEnv = { ...preset.envDefaults, ...env };

    // Docker compose
    const composeFile = renderComposeFile(config);

    // Env files
    const envFiles: Record<string, string> = {
      ".env": buildEnvFile(mergedEnv),
    };

    // Config files
    const configs: Record<string, string> = {};

    // SeaweedFS config
    if (config.services.seaweedfs) {
      configs["seaweedfs/s3.json"] = renderSeaweedfsConfig(
        config,
        env.SEAWEEDFS_ACCESS_KEY ?? "",
        env.SEAWEEDFS_SECRET_KEY ?? ""
      );
      configs["scripts/init-buckets.sh"] = renderBucketInitScript(config, preset.buckets);
    }

    // Directus configs
    if (config.services.directus) {
      configs["directus/.env"] = renderDirectusEnv(config, env);
      configs["scripts/bootstrap-directus.sh"] = renderDirectusBootstrapScript(
        config,
        preset.directusCollections
      );
      configs["scripts/setup-directus-roles.sh"] = renderDirectusRolesScript(config);
    }

    // Windmill configs
    if (config.services.windmill) {
      configs["windmill/.env"] = renderWindmillEnv(config, env);
      configs["scripts/bootstrap-windmill.sh"] = renderWindmillBootstrapScript(
        config,
        preset.windmillFlows
      );
    }

    // Next.js app scaffold
    if (config.services.nextjs) {
      configs["app/package.json"] = renderNextjsPackageJson(config, preset);
      configs["app/next.config.js"] = renderNextjsConfig(config);
      configs["app/tsconfig.json"] = renderNextjsTsConfig();
      configs["app/src/app/layout.tsx"] = renderNextjsLayout(config, preset);
      configs["app/src/app/globals.css"] = renderNextjsGlobalsCss();
      configs["app/src/app/page.tsx"] = renderNextjsHomePage(config, preset);
      configs["app/src/app/api/health/route.ts"] = renderNextjsHealthRoute();
      configs["app/.env.local"] = renderNextjsEnvLocal(config);
    }

    // Homepage config bundle
    const homepageFiles = renderFullHomepageBundle(config, preset.homarrLayout);
    // Keep a compact dashboard model for adapter compatibility
    const homarrConfig = homepageFiles["homarr/seed/board-model.json"] ?? "";

    // Add individual homepage files to configs
    for (const [name, content] of Object.entries(homepageFiles)) {
      configs[name] = content;
    }

    // Project metadata
    const metadata: Record<string, unknown> = {
      projectName: config.projectName,
      target: config.target,
      preset: config.preset,
      domain: config.domain.root,
      generatedAt: new Date().toISOString(),
      services: Object.entries(config.services)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    };

    return {
      composeFile,
      envFiles,
      configs,
      homarrConfig,
      metadata,
    };
  }
}
