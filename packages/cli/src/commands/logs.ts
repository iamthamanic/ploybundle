import type { Command } from "commander";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME, ALL_SERVICES } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

export function registerLogsCommand(program: Command, context: CliContext): void {
  program
    .command("logs [project-name]")
    .description("Show logs for the project stack or a specific service")
    .option("--service <service>", `Filter by service: ${ALL_SERVICES.join(", ")}, custom-api-*, worker-*`)
    .option("--mode <mode>", "Run against mode: local or server")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string | undefined, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config, options.mode);
        const adapter = createAdapter(config);
        const service = options.service;
        const logs = await adapter.fetchLogs(config.ssh, config, service);

        if (context.outputMode === "json") {
          output.json({ projectName: config.projectName, service: service ?? "all", logs });
        } else {
          output.log(logs);
        }
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
