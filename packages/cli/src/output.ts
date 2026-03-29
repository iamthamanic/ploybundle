import chalk from "chalk";
import ora from "ora";
import type { CliContext, DeployResult, ProjectSummary, ProjectStatus, PhaseResult, ServiceHealth } from "@ploybundle/shared";
import { formatDuration } from "@ploybundle/shared";

export class CliOutput {
  private context: CliContext;

  constructor(context: CliContext) {
    this.context = context;
  }

  info(message: string): void {
    if (this.context.outputMode === "quiet") return;
    if (this.context.outputMode === "json") return;
    console.log(this.context.noColor ? message : chalk.blue(message));
  }

  success(message: string): void {
    if (this.context.outputMode === "quiet") return;
    if (this.context.outputMode === "json") return;
    console.log(this.context.noColor ? `✓ ${message}` : chalk.green(`✓ ${message}`));
  }

  warn(message: string): void {
    if (this.context.outputMode === "quiet") return;
    if (this.context.outputMode === "json") return;
    console.log(this.context.noColor ? `⚠ ${message}` : chalk.yellow(`⚠ ${message}`));
  }

  error(message: string): void {
    if (this.context.outputMode === "json") return;
    console.error(this.context.noColor ? `✗ ${message}` : chalk.red(`✗ ${message}`));
  }

  log(message: string): void {
    if (this.context.outputMode === "quiet") return;
    if (this.context.outputMode === "json") return;
    console.log(message);
  }

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  spinner(text: string): ReturnType<typeof ora> {
    if (this.context.outputMode !== "human" || this.context.noColor) {
      // Return a dummy spinner for non-human modes
      return {
        start: () => { this.log(text); return this as any; },
        stop: () => this as any,
        succeed: (t?: string) => { if (t) this.success(t); return this as any; },
        fail: (t?: string) => { if (t) this.error(t); return this as any; },
        text: "",
      } as any;
    }
    return ora({ text, color: "blue" });
  }

  printPhaseResult(result: PhaseResult): void {
    if (this.context.outputMode === "json") return;
    if (this.context.outputMode === "quiet") return;

    const duration = formatDuration(result.duration);
    if (result.success) {
      this.success(`${result.message} (${duration})`);
    } else {
      this.error(`${result.message} (${duration})`);
    }
  }

  printDeployResult(result: DeployResult): void {
    if (this.context.outputMode === "json") {
      this.json(result);
      return;
    }

    this.log("");
    if (result.success) {
      this.success("Deployment completed successfully!");
    } else {
      this.error("Deployment failed.");
    }

    this.log("");
    for (const phase of result.phases) {
      this.printPhaseResult(phase);
    }

    if (result.summary) {
      this.printSummary(result.summary);
    }
  }

  printSummary(summary: ProjectSummary): void {
    if (this.context.outputMode === "json") {
      this.json(summary);
      return;
    }

    const divider = this.context.noColor ? "─".repeat(50) : chalk.gray("─".repeat(50));

    this.log("");
    this.log(divider);
    this.log(this.context.noColor ? `  Project: ${summary.projectName}` : chalk.bold(`  Project: ${summary.projectName}`));
    this.log(`  Mode:    ${summary.mode}`);
    if (summary.target) {
      this.log(`  Target:  ${summary.target}`);
    }
    this.log(`  Stack:   ${summary.preset}`);
    this.log(divider);
    this.log("");
    this.log(this.context.noColor ? "  URLs:" : chalk.bold("  URLs:"));
    this.log(`    App:        ${summary.urls.app}`);
    this.log(`    Admin:      ${summary.urls.admin}`);
    this.log(`    Storage:    ${summary.urls.storage}`);
    if (summary.urls.storageBrowser !== summary.urls.storage) {
      this.log(`    Storage UI: ${summary.urls.storageBrowser}`);
    }
    if (summary.urls.databaseBrowser) {
      this.log(`    SQL (Adminer): ${summary.urls.databaseBrowser}`);
    }
    this.log(`    Functions:  ${summary.urls.functions}`);
    this.log(`    Deploy:     ${summary.urls.deploy}`);
    this.log(`    Dashboard:  ${summary.urls.dashboard}`);
    this.log("");

    if (summary.services.length > 0) {
      this.log(this.context.noColor ? "  Services:" : chalk.bold("  Services:"));
      for (const svc of summary.services) {
        const icon = svc.healthy ? "●" : "○";
        const color = svc.healthy ? chalk.green : chalk.red;
        const text = `    ${icon} ${svc.service}: ${svc.message ?? (svc.healthy ? "healthy" : "unhealthy")}`;
        this.log(this.context.noColor ? text : color(text));
      }
      this.log("");
    }

    this.log(this.context.noColor ? `  Hint: ${summary.troubleshootingHint}` : chalk.gray(`  Hint: ${summary.troubleshootingHint}`));
    this.log(divider);
  }

  printStatus(status: ProjectStatus): void {
    if (this.context.outputMode === "json") {
      this.json(status);
      return;
    }

    this.log("");
    this.log(this.context.noColor ? `Project: ${status.projectName}` : chalk.bold(`Project: ${status.projectName}`));
    this.log(`Mode: ${status.mode}${status.target ? ` | Target: ${status.target}` : ""} | Stack: ${status.preset}`);
    this.log("");

    this.log(this.context.noColor ? "URLs:" : chalk.bold("URLs:"));
    this.log(`  App:        ${status.urls.app}`);
    this.log(`  Admin:      ${status.urls.admin}`);
    this.log(`  Storage:    ${status.urls.storage}`);
    if (status.urls.storageBrowser !== status.urls.storage) {
      this.log(`  Storage UI: ${status.urls.storageBrowser}`);
    }
    if (status.urls.databaseBrowser) {
      this.log(`  SQL (Adminer): ${status.urls.databaseBrowser}`);
    }
    this.log(`  Functions:  ${status.urls.functions}`);
    this.log(`  Deploy:     ${status.urls.deploy}`);
    this.log(`  Dashboard:  ${status.urls.dashboard}`);
    this.log("");

    this.log(this.context.noColor ? "Services:" : chalk.bold("Services:"));
    for (const svc of status.services) {
      const icon = svc.healthy ? "●" : "○";
      const msg = svc.message ?? (svc.healthy ? "healthy" : "unhealthy");
      this.log(`  ${icon} ${svc.service}: ${msg}`);
    }
    this.log("");
  }

  printServiceHealth(services: ServiceHealth[]): void {
    if (this.context.outputMode === "json") {
      this.json(services);
      return;
    }

    for (const svc of services) {
      const icon = svc.healthy ? "●" : "○";
      const msg = svc.message ?? (svc.healthy ? "healthy" : "unhealthy");
      this.log(`  ${icon} ${svc.service}: ${msg}`);
    }
  }
}
