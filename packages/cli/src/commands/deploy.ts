import type { Command } from "commander";
import { Orchestrator } from "@ploybundle/core";
import { StackArtifactRenderer } from "@ploybundle/templates";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

export function registerDeployCommand(program: Command, context: CliContext): void {
  program
    .command("deploy [project-name]")
    .description("Deploy or re-deploy the project stack")
    .option("--mode <mode>", "Run against mode: local or server")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string | undefined, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config, options.mode);

        output.info(`Deploying project: ${config.projectName} (${config.mode} mode)`);

        const adapter = createAdapter(config);
        const renderer = new StackArtifactRenderer();
        const orchestrator = new Orchestrator(adapter, renderer, {
          onPhaseStart: (_phase, message) => output.spinner(message).start(),
          onPhaseComplete: (result) => output.printPhaseResult(result),
          onLog: (message) => output.log(`  ${message}`),
        });

        const result = await orchestrator.deploy(config);
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
