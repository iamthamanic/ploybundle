import { exec } from "node:child_process";
import type { Command } from "commander";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError, CONFIG_FILENAME, buildProjectUrls } from "@ploybundle/shared";
import { CliOutput } from "../output.js";
import { resolveProjectConfig } from "../config-resolver.js";

const SERVICE_URL_MAP: Record<string, keyof ReturnType<typeof buildProjectUrls>> = {
  app: "app",
  admin: "admin",
  directus: "admin",
  storage: "storage",
  seaweedfs: "storage",
  functions: "functions",
  windmill: "functions",
  deploy: "deploy",
  dashboard: "dashboard",
  homarr: "dashboard",
};

export function registerOpenCommand(program: Command, context: CliContext): void {
  program
    .command("open <project-name>")
    .description("Open the project dashboard or a specific service URL in the browser")
    .option("--service <service>", "Open a specific service: app, admin, storage, functions, deploy, dashboard")
    .option("--config <path>", "Path to ploybundle.yaml", CONFIG_FILENAME)
    .action(async (projectName: string, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const config = resolveProjectConfig(projectName, options.config);
        const urls = buildProjectUrls(config.domain);

        let url: string;
        if (options.service) {
          const key = SERVICE_URL_MAP[options.service];
          if (!key) {
            output.error(`Unknown service: ${options.service}`);
            output.log(`  Available: ${Object.keys(SERVICE_URL_MAP).join(", ")}`);
            process.exit(1);
          }
          url = urls[key];
        } else {
          url = urls.dashboard;
        }

        if (context.outputMode === "json") {
          output.json({ url });
          return;
        }

        output.info(`Opening: ${url}`);

        // Open URL in default browser (macOS/Linux)
        const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
        exec(`${openCmd} "${url}"`, (err) => {
          if (err) {
            output.log(`  Could not open browser. Visit: ${url}`);
          }
        });
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
