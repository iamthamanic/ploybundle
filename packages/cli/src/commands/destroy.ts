import type { Command } from "commander";
import { Orchestrator } from "@ploybundle/core";
import { StackArtifactRenderer } from "@ploybundle/templates";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";
import { createInterface } from "node:readline";

async function confirmDestroy(projectName: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `Are you sure you want to destroy project "${projectName}"? This will delete all containers and volumes. Type the project name to confirm: `,
      (answer) => {
        rl.close();
        resolve(answer.trim() === projectName);
      }
    );
  });
}

export function registerDestroyCommand(program: Command, context: CliContext): void {
  program
    .command("destroy [project-name]")
    .description("Destroy the project stack (requires confirmation)")
    .option("--yes", "Skip confirmation prompt")
    .option("--mode <mode>", "Run against mode: local or server")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string | undefined, options: Record<string, string | boolean>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config as string, options.mode as string | undefined);

        if (!options.yes) {
          const confirmed = await confirmDestroy(config.projectName);
          if (!confirmed) {
            output.warn("Destroy cancelled. Project name did not match.");
            process.exit(1);
          }
        }

        output.info(`Destroying project: ${config.projectName}`);

        const adapter = createAdapter(config);
        const renderer = new StackArtifactRenderer();
        const orchestrator = new Orchestrator(adapter, renderer, {
          onPhaseStart: (_phase, message) => output.spinner(message).start(),
          onPhaseComplete: (result) => output.printPhaseResult(result),
          onLog: (message) => output.log(`  ${message}`),
        });

        const result = await orchestrator.destroy(config);

        if (result.success) {
          output.success(`Project ${config.projectName} destroyed.`);
        } else {
          output.error(`Failed to destroy project: ${result.message}`);
        }

        process.exit(result.success ? 0 : 1);
      } catch (err) {
        if (err instanceof PloybundleError) {
          output.error(err.message);
          if (err.hint) output.log(`  Hint: ${err.hint}`);
        } else {
          output.error(err instanceof Error ? err.message : String(err));
        }
        process.exit(1);
      }
    });
}
