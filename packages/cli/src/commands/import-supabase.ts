import type { Command } from "commander";
import { importSupabaseProject } from "@ploybundle/core";
import type { CliContext } from "@ploybundle/shared";
import { PloybundleError } from "@ploybundle/shared";
import { CliOutput } from "../output.js";

export function registerImportSupabaseCommand(program: Command, context: CliContext): void {
  program
    .command("import-supabase <source-root>")
    .description("Import a Supabase repo layout into an AppSpec v2 ploybundle.yaml")
    .option("--output <path>", "Output path for the generated ploybundle.yaml")
    .option("--project-name <name>", "Override the generated app id")
    .option("--app-name <name>", "Human-friendly app name")
    .option("--project-ref <ref>", "Supabase project ref for migration metadata")
    .option("--frontend <frontend>", "Frontend scaffold: nextjs or vite-react", "nextjs")
    .option("--server-domain <domain>", "Optional server root domain for generated server mode")
    .option("--server-host <host>", "Optional server SSH host for generated server mode")
    .option("--server-user <user>", "Optional server SSH user", "root")
    .option("--server-target <target>", "Optional server target: lite or full", "lite")
    .action(async (sourceRoot: string, options: Record<string, string>) => {
      const output = new CliOutput(context);

      try {
        const result = await importSupabaseProject({
          sourceRoot,
          outputPath: options.output,
          projectName: options.projectName,
          appName: options.appName,
          projectRef: options.projectRef,
          frontend: options.frontend as "nextjs" | "vite-react",
          server: options.serverDomain && options.serverHost
            ? {
                rootDomain: options.serverDomain,
                host: options.serverHost,
                user: options.serverUser,
                target: options.serverTarget as "lite" | "full",
              }
            : undefined,
        });

        if (context.outputMode === "json") {
          output.json(result);
          return;
        }

        output.success(`Generated AppSpec v2: ${result.outputPath}`);
        output.log(`  Report: ${result.reportPath}`);
        output.log(`  App: ${result.spec.app.id}`);
        output.log(`  Archetype: ${result.spec.app.archetype}`);
        output.log(`  Entities: ${result.entities.length}`);
        output.log(`  Imported functions: ${result.functions.length}`);
        output.log(`  Env vars analyzed: ${result.report.env.variables.length}`);
        output.log(`  Secrets detected: ${result.report.secrets.keys.length}`);
        output.log(`  RLS tables: ${result.report.rls.enabledTables.length}`);
        output.log(`  RLS policies: ${result.report.rls.policies.length}`);
        output.log(`  Realtime tables: ${result.report.realtime.publicationTables.length}`);
        output.log(`  Realtime code refs: ${result.report.realtime.codeReferences.length}`);
        for (const fn of result.functions) {
          output.log(`  - ${fn.name}: ${fn.classification} -> ${fn.targetPath}`);
        }
        if (result.report.rls.tableStrategies.length > 0) {
          output.info("RLS migration strategy:");
          for (const strategy of result.report.rls.tableStrategies) {
            output.log(
              `  - ${strategy.table}: ${strategy.recommendedTarget} | patterns=${strategy.accessPatterns.join(",")} | readiness=${strategy.generatedCrudReadiness}`
            );
          }
        }
        if (result.report.realtime.strategies.length > 0) {
          output.info("Realtime migration strategy:");
          for (const strategy of result.report.realtime.strategies) {
            output.log(
              `  - ${strategy.scope}: ${strategy.recommendedTarget} | usage=${strategy.usage} | source=${strategy.detectedFrom}`
            );
          }
        }
        if (result.report.unresolved.length > 0) {
          output.warn("Unresolved migration areas:");
          for (const unresolved of result.report.unresolved) {
            output.warn(`  - ${unresolved}`);
          }
        }
        if (result.warnings.length > 0) {
          output.warn("Warnings:");
          for (const warning of result.warnings) {
            output.warn(`  - ${warning}`);
          }
        }
        if (result.report.recommendations.length > 0) {
          output.info("Recommendations:");
          for (const recommendation of result.report.recommendations) {
            output.log(`  - ${recommendation}`);
          }
        }
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
