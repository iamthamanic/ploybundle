import type { Command } from "commander";
import { buildConfigFromFlags, Orchestrator, type CliOverrides } from "@ploybundle/core";
import { StackArtifactRenderer } from "@ploybundle/templates";
import type { CliContext, DeployPhase } from "@ploybundle/shared";
import { PloybundleError } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";

export function registerInitCommand(program: Command, context: CliContext): void {
  program
    .command("init <project-name>")
    .description("Initialize and deploy a new project on a remote VPS")
    .requiredOption("--host <ssh-target>", "SSH target (e.g., root@1.2.3.4)")
    .requiredOption("--preset <preset>", "Project preset (learning-app, crud-saas, content-app, workflow-app)")
    .requiredOption("--domain <domain>", "Root domain for the project")
    .option("--target <target>", "Platform target: lite (CapRover) or full (Coolify)", "lite")
    .option("--email <email>", "Admin email address")
    .option("--resource-profile <profile>", "Resource profile: small, medium, large", "small")
    .option("--provider-hint <provider>", "VPS provider hint: hetzner, hostinger, generic", "generic")
    .action(async (projectName: string, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const overrides: CliOverrides = {
          projectName,
          target: options.target,
          preset: options.preset,
          domain: options.domain,
          host: options.host,
          email: options.email,
          resourceProfile: options.resourceProfile,
          providerHint: options.providerHint,
        };

        const config = buildConfigFromFlags(overrides);
        output.info(`Initializing project: ${config.projectName}`);
        output.info(`Target: ${config.target} | Preset: ${config.preset} | Domain: ${config.domain.root}`);
        output.log("");

        const adapter = createAdapter(config.target);
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
