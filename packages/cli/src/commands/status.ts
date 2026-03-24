import type { Command } from "commander";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME } from "@ploybundle/shared";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

export function registerStatusCommand(program: Command, context: CliContext): void {
  program
    .command("status <project-name>")
    .description("Show project status, service health, and URLs")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config);
        const adapter = createAdapter(config.target);
        const status = await adapter.status(config.ssh, config);
        output.printStatus(status);
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
