import type { HubBoardConfig, ProjectConfig, StackArtifacts } from "@ploybundle/shared";
import { buildEnvFile } from "@ploybundle/shared";
import type { ArtifactRenderer } from "@ploybundle/core";
import { getPreset } from "../presets/index.js";
import { PLATFORM_HUB_BOARD } from "../presets/platform-hub-board.js";
import { renderComposeFile } from "./compose-renderer.js";
import { renderHubBundle, renderHubBoardJson } from "./hub-renderer.js";
import { renderSpecModuleFiles } from "./module-renderer.js";
import { renderSeaweedfsConfig, renderBucketInitScript } from "./seaweedfs-renderer.js";
import { renderDirectusEnv, renderDirectusBootstrapScript, renderDirectusRolesScript } from "./directus-renderer.js";
import {
  renderWindmillBootstrapScript,
  renderWindmillEnv,
  renderWindmillPostgresInitSql,
} from "./windmill-renderer.js";
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
import {
  renderVitePackageJson,
  renderViteTsConfig,
  renderViteConfig,
  renderViteIndexHtml,
  renderViteMainTsx,
  renderViteAppTsx,
  renderViteIndexCss,
  renderViteEnvDts,
  renderViteEnvLocal,
  renderViteDockerfile,
  renderViteNginxDefaultConf,
  renderViteDockerIgnore,
} from "./vite-renderer.js";

export class StackArtifactRenderer implements ArtifactRenderer {
  render(config: ProjectConfig, env: Record<string, string>): StackArtifacts {
    const preset = config.template ?? getPreset(config.preset);

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

    Object.assign(configs, renderSpecModuleFiles(config));

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
      if (config.services.postgres) {
        configs["scripts/docker-entrypoint-initdb.d/01-windmill-database.sql"] =
          renderWindmillPostgresInitSql(config);
      }
    }

    // Product app scaffold (Next.js or Vite + React)
    if (config.services.nextjs) {
      if (config.frontend === "vite-react") {
        configs["vite-app/package.json"] = renderVitePackageJson(config, preset);
        configs["vite-app/tsconfig.json"] = renderViteTsConfig();
        configs["vite-app/vite.config.ts"] = renderViteConfig();
        configs["vite-app/index.html"] = renderViteIndexHtml(config, preset);
        configs["vite-app/src/main.tsx"] = renderViteMainTsx();
        configs["vite-app/src/App.tsx"] = renderViteAppTsx(config, preset);
        configs["vite-app/src/index.css"] = renderViteIndexCss();
        configs["vite-app/src/vite-env.d.ts"] = renderViteEnvDts();
        configs["vite-app/.env.local"] = renderViteEnvLocal(config);
        configs["vite-app/Dockerfile"] = renderViteDockerfile();
        configs["vite-app/nginx/default.conf"] = renderViteNginxDefaultConf();
        configs["vite-app/.dockerignore"] = renderViteDockerIgnore();
      } else {
        configs["app/package.json"] = renderNextjsPackageJson(config, preset);
        configs["app/next.config.js"] = renderNextjsConfig(config);
        configs["app/tsconfig.json"] = renderNextjsTsConfig();
        configs["app/src/app/layout.tsx"] = renderNextjsLayout(config, preset);
        configs["app/src/app/globals.css"] = renderNextjsGlobalsCss();
        configs["app/src/app/page.tsx"] = renderNextjsHomePage(config, preset);
        configs["app/src/app/api/health/route.ts"] = renderNextjsHealthRoute();
        configs["app/.env.local"] = renderNextjsEnvLocal(config);
      }
    }

    // Project metadata
    const metadata: Record<string, unknown> = {
      projectName: config.projectName,
      mode: config.mode,
      target: config.target,
      preset: config.template?.name ?? config.preset,
      frontend: config.frontend,
      domain: config.domain.root,
      generatedAt: new Date().toISOString(),
      services: Object.entries(config.services)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name),
    };

    // Ploybundle Hub (Next.js): platform shell — same task-first UI for every preset; deep work stays in Directus/Windmill/etc.
    if (config.services.hub) {
      const hubBoard: HubBoardConfig = {
        ...PLATFORM_HUB_BOARD,
        ...(config.hubPresentation ?? {}),
      };
      const hubFiles = renderHubBundle(config, hubBoard);
      for (const [name, content] of Object.entries(hubFiles)) {
        configs[name] = content;
      }
    }

    const hubConfig = config.services.hub
      ? renderHubBoardJson(config, { ...PLATFORM_HUB_BOARD, ...(config.hubPresentation ?? {}) })
      : "{}";

    return {
      composeFile,
      envFiles,
      configs,
      hubConfig,
      metadata,
    };
  }
}
