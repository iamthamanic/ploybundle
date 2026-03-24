import type { Command } from "commander";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME } from "@ploybundle/shared";
import { SshService, HostInspector } from "@ploybundle/core";
import { createAdapter } from "../adapter-factory.js";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

export function registerDoctorCommand(program: Command, context: CliContext): void {
  program
    .command("doctor <project-name>")
    .description("Diagnose host, platform, services, DNS, and configuration")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config);
        output.info(`Running diagnostics for: ${config.projectName}`);
        output.log("");

        const ssh = new SshService();
        const inspector = new HostInspector(ssh);

        // 1. SSH connectivity
        output.info("Checking SSH connectivity...");
        const connected = await ssh.testConnection(config.ssh);
        if (connected) {
          output.success("SSH connection successful");
        } else {
          output.error(`Cannot connect to ${config.ssh.user}@${config.ssh.host}:${config.ssh.port}`);
          process.exit(1);
        }

        // 2. Host inspection
        output.info("Inspecting host...");
        const diagnosis = await inspector.inspect(config.ssh);
        const validation = inspector.validate(diagnosis);

        if (context.outputMode === "json") {
          output.json({ diagnosis, validation });
          return;
        }

        output.log(`  OS: ${diagnosis.os} ${diagnosis.osVersion}`);
        output.log(`  Ubuntu 24.04: ${diagnosis.isUbuntu2404 ? "Yes" : "No"}`);
        output.log(`  Root access: ${diagnosis.hasRoot ? "Yes" : "No"}`);
        output.log(`  Docker: ${diagnosis.dockerInstalled ? `Yes (${diagnosis.dockerVersion})` : "No"}`);
        output.log(`  Disk: ${diagnosis.availableDiskGb}GB available`);
        output.log(`  RAM: ${diagnosis.availableRamMb}MB available`);

        if (diagnosis.portConflicts.length > 0) {
          output.warn(`  Port conflicts: ${diagnosis.portConflicts.join(", ")}`);
        }

        if (validation.valid) {
          output.success("Host validation passed");
        } else {
          output.warn("Host validation issues:");
          for (const issue of validation.issues) {
            output.warn(`  - ${issue}`);
          }
        }
        output.log("");

        // 3. Platform health
        output.info("Checking platform health...");
        const adapter = createAdapter(config.target);
        const platformHealth = await adapter.platformHealth(config.ssh);
        if (platformHealth.healthy) {
          output.success(`${adapter.name} is healthy`);
        } else {
          output.error(`${adapter.name}: ${platformHealth.message}`);
        }
        output.log("");

        // 4. Service health
        output.info("Checking service health...");
        const status = await adapter.status(config.ssh, config);
        output.printServiceHealth(status.services);
        output.log("");

        // 5. Config integrity
        output.info("Checking configuration...");
        output.success(`Target: ${config.target}`);
        output.success(`Preset: ${config.preset}`);
        output.success(`Domain: ${config.domain.root}`);
        output.success(`Resource profile: ${config.resourceProfile}`);

        const enabledServices = Object.entries(config.services)
          .filter(([, v]) => v)
          .map(([k]) => k);
        output.success(`Services: ${enabledServices.join(", ")}`);
        output.log("");

        // Summary
        const allHealthy = status.services.every((s) => s.healthy);
        if (allHealthy && validation.valid && platformHealth.healthy) {
          output.success("All checks passed. Project is healthy.");
        } else {
          output.warn("Some checks failed. Review the output above for details.");
          output.log(`  Run 'ploybundle logs ${projectName}' to investigate service issues.`);
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
