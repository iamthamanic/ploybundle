import type { Command } from "commander";
import { buildConfigFromFlags, Orchestrator, type CliOverrides } from "@ploybundle/core";
import { StackArtifactRenderer } from "@ploybundle/templates";
import type { CliContext, DeployPhase } from "@ploybundle/shared";
import { ConfigError, PloybundleError, CONFIG_FILENAME } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

async function promptProjectSlugIfTty(): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question("How should your project be named (slug, e.g. my-app)? ")).trim();
  } finally {
    rl.close();
  }
}

export function registerInitCommand(program: Command, context: CliContext): void {
  program
    .command("init [project-name]")
    .description("Initialize and deploy a new project from AppSpec v2 config or legacy preset flags")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .option("--host <ssh-target>", "SSH target (e.g., root@1.2.3.4)")
    .option("--preset <preset>", "Legacy project preset (learning-app, crud-saas, content-app, workflow-app)")
    .option("--domain <domain>", "Root domain for the project")
    .option("--target <target>", "Platform target: lite (CapRover) or full (Coolify)", "lite")
    .option("--email <email>", "Admin email address")
    .option("--resource-profile <profile>", "Resource profile: small, medium, large", "small")
    .option("--provider-hint <provider>", "VPS provider hint: hetzner, hostinger, generic", "generic")
    .option(
      "--frontend <frontend>",
      "Product web UI: nextjs (default) or vite-react (React SPA + Vite + nginx in Docker)",
      "nextjs"
    )
    .action(async (projectName: string | undefined, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const useConfigPath = !options.host && !options.domain && !options.preset;
        let resolvedSlug = projectName;
        if (!useConfigPath && !resolvedSlug?.trim() && process.stdin.isTTY) {
          resolvedSlug = await promptProjectSlugIfTty();
        }
        if (!useConfigPath && !resolvedSlug?.trim()) {
          throw new ConfigError(
            "Project name is required",
            "Pass the slug as the first argument (e.g. ploybundle init my-app) or run in a TTY to be prompted."
          );
        }
        const config = useConfigPath
          ? resolveProjectConfig(projectName, options.config, "server")
          : buildConfigFromFlags({
              projectName: resolvedSlug!.trim(),
              target: options.target,
              preset: options.preset,
              domain: options.domain,
              host: options.host,
              email: options.email,
              resourceProfile: options.resourceProfile,
              providerHint: options.providerHint,
              frontend: options.frontend,
            } as CliOverrides);
        output.info(`Initializing project: ${config.projectName}`);
        output.info(`Mode: ${config.mode} | Target: ${config.target} | Stack: ${config.template?.name ?? config.preset} | Domain: ${config.domain.root}`);
        output.log("");

        const adapter = createAdapter(config);
        const renderer = new StackArtifactRenderer();

        const orchestrator = new Orchestrator(adapter, renderer, {
          onPhaseStart: (_phase: DeployPhase, message: string) => {
            output.spinner(message).start();
          },
          onPhaseComplete: (result) => {
            output.printPhaseResult(result);
          },
          onLog: (message: string) => {
            output.log(`  ${message}`);
          },
        });

        const result = await orchestrator.init(config);
        output.printDeployResult(result);

        process.exit(result.success ? 0 : 1);
      } catch (err) {
        if (err instanceof PloybundleError) {
          output.error(err.message);
          if (err.hint) output.log(`  Hint: ${err.hint}`);
          if (context.outputMode === "json") output.json(err.toJSON());
        } else {
          output.error(err instanceof Error ? err.message : String(err));
        }
        process.exit(1);
      }
    });
}
