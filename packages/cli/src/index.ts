import { Command } from "commander";
import type { CliContext, OutputMode } from "@ploybundle/shared";
import { PLOYBUNDLE_VERSION } from "@ploybundle/shared";
import { registerInitCommand } from "./commands/init.js";
import { registerDeployCommand } from "./commands/deploy.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerLogsCommand } from "./commands/logs.js";
import { registerUpdateCommand } from "./commands/update.js";
import { registerDestroyCommand } from "./commands/destroy.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerOpenCommand } from "./commands/open.js";

export function createCli(): Command {
  const program = new Command();

  program
    .name("ploybundle")
    .description("Project-scoped self-hosted app bundle generator and installer")
    .version(PLOYBUNDLE_VERSION)
    .option("--json", "Output in JSON format")
    .option("--quiet", "Suppress non-essential output")
    .option("--no-color", "Disable colored output")
    .option("--verbose", "Enable verbose output");

  // Build context from global options
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    const context: CliContext = {
      outputMode: opts.json ? "json" : opts.quiet ? "quiet" : "human" as OutputMode,
      noColor: opts.color === false,
      verbose: opts.verbose ?? false,
    };

    // Store context for commands to access
    thisCommand.setOptionValue("_context", context);
  });

  const defaultContext: CliContext = {
    outputMode: "human",
    noColor: false,
    verbose: false,
  };

  // Register all commands
  registerInitCommand(program, defaultContext);
  registerDeployCommand(program, defaultContext);
  registerStatusCommand(program, defaultContext);
  registerLogsCommand(program, defaultContext);
  registerUpdateCommand(program, defaultContext);
  registerDestroyCommand(program, defaultContext);
  registerDoctorCommand(program, defaultContext);
  registerOpenCommand(program, defaultContext);

  return program;
}
