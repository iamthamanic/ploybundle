import type { Command } from "commander";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME, formatDuration } from "@ploybundle/shared";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";
import { PromoteRunner, type PromoteStepResult } from "../promote-runner.js";

function printPromoteStep(output: CliOutput, result: PromoteStepResult): void {
  if (result.skipped) {
    output.info(result.message);
    return;
  }

  const duration = formatDuration(result.duration);
  if (result.success) {
    output.success(`${result.message} (${duration})`);
  } else {
    output.error(`${result.message} (${duration})`);
  }
}

export function registerPromoteCommand(program: Command, context: CliContext): void {
  program
    .command("promote [project-name]")
    .description("Promote a local project runtime onto the configured server runtime")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .option("--skip-deploy", "Skip re-deploying the server stack before data transfer")
    .option("--skip-db", "Skip Postgres dump/restore")
    .option("--skip-storage", "Skip SeaweedFS bucket mirroring")
    .action(async (projectName: string | undefined, options: Record<string, boolean | string>) => {
      const output = new CliOutput(context);

      try {
        const localConfig = resolveProjectConfig(projectName, options.config as string, "local");
        const serverConfig = resolveProjectConfig(projectName, options.config as string, "server");
        const runner = new PromoteRunner({
          onLog: (message) => output.log(`  ${message}`),
          onStepStart: (_step, message) => output.info(message),
          onStepComplete: (result) => printPromoteStep(output, result),
          onDeployPhaseStart: (_phase, message) => output.spinner(message).start(),
          onDeployPhaseComplete: (result) => output.printPhaseResult(result),
        });

        output.info(`Promoting project: ${localConfig.projectName} (local -> server)`);

        const result = await runner.run(localConfig, serverConfig, {
          skipDeploy: Boolean(options.skipDeploy),
          skipDb: Boolean(options.skipDb),
          skipStorage: Boolean(options.skipStorage),
        });

        if (context.outputMode === "json") {
          output.json(result);
        } else if (result.success) {
          output.success(`Promote completed. Server app: ${result.urls.app}`);
        } else {
          output.error("Promote failed.");
        }

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
