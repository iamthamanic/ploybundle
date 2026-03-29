import { execFile, spawn, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { existsSync, createWriteStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { finished } from "node:stream/promises";
import { Orchestrator, SecretsManager, SshService, type CommandResult as SshCommandResult } from "@ploybundle/core";
import { StackArtifactRenderer } from "@ploybundle/templates";
import type {
  DeployPhase,
  DeployResult,
  GeneratedSecrets,
  PhaseResult,
  ProjectConfig,
  ProjectUrls,
} from "@ploybundle/shared";
import {
  ConfigError,
  PlatformError,
  buildEnvFile,
  buildProjectUrls,
} from "@ploybundle/shared";
import { createAdapter } from "./adapter-factory.js";
import { getLocalStackRoot, getPromoteStateRoot } from "./local-runtime.js";

const REMOTE_PROJECT_DIR = "/opt/ploybundle";
const STANDARD_TIMEOUT_MS = 10 * 60 * 1000;
const LONG_TIMEOUT_MS = 30 * 60 * 1000;
const COMMAND_MAX_BUFFER = 10 * 1024 * 1024;

type PromoteStepName = "deploy" | "database" | "storage";

type PromoteSshClient = Pick<SshService, "exec" | "uploadFile">;
type PromoteSecretsClient = Pick<SecretsManager, "loadOrGenerate" | "loadOrGenerateLocal">;

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface StepOutcome {
  message: string;
  details?: Record<string, unknown>;
}

interface StorageMirrorInput {
  buckets: string[];
  localConfig: ProjectConfig;
  serverConfig: ProjectConfig;
  localSecrets: GeneratedSecrets;
  serverSecrets: GeneratedSecrets;
  stateRoot: string;
}

export interface PromoteOptions {
  skipDeploy?: boolean;
  skipDb?: boolean;
  skipStorage?: boolean;
}

export interface PromoteStepResult {
  step: PromoteStepName;
  success: boolean;
  skipped: boolean;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

export interface PromoteResult {
  success: boolean;
  projectName: string;
  target?: ProjectConfig["target"];
  urls: ProjectUrls;
  steps: PromoteStepResult[];
}

export interface PromoteCallbacks {
  onLog?: (message: string) => void;
  onStepStart?: (step: PromoteStepName, message: string) => void;
  onStepComplete?: (result: PromoteStepResult) => void;
  onDeployPhaseStart?: (phase: DeployPhase, message: string) => void;
  onDeployPhaseComplete?: (result: PhaseResult) => void;
}

export interface PromoteRunnerDeps {
  ssh?: PromoteSshClient;
  secretsManager?: PromoteSecretsClient;
  deployServer?: (config: ProjectConfig, callbacks: PromoteCallbacks) => Promise<DeployResult>;
  dumpLocalDatabase?: (config: ProjectConfig, dumpPath: string) => Promise<void>;
  mirrorStorage?: (input: StorageMirrorInput) => Promise<void>;
}

function execFileUtf8(
  file: string,
  args: string[],
  options: ExecFileOptionsWithStringEncoding = { encoding: "utf8" }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

function commandFailureResult(err: unknown): CommandResult | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number | string };
    if (typeof execErr.code === "number") {
      return {
        stdout: execErr.stdout ?? "",
        stderr: execErr.stderr ?? "",
        exitCode: execErr.code,
      };
    }
  }

  return undefined;
}

async function execLocalCommand(
  file: string,
  args: string[],
  cwd: string,
  timeoutMs: number = STANDARD_TIMEOUT_MS
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileUtf8(file, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: COMMAND_MAX_BUFFER,
      timeout: timeoutMs,
    });

    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const result = commandFailureResult(err);
    if (result) {
      return result;
    }

    throw new PlatformError(
      `Local command failed: ${err instanceof Error ? err.message : String(err)}`,
      "Ensure Docker is installed and the local runtime is available."
    );
  }
}

async function spawnLocalDumpToFile(
  file: string,
  args: string[],
  cwd: string,
  outputPath: string,
  timeoutMs: number = LONG_TIMEOUT_MS
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });

  const output = createWriteStream(outputPath, { encoding: "utf8" });
  const child = spawn(file, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);

  child.stdout.pipe(output);
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? 1));
    });

    await finished(output);

    if (exitCode !== 0) {
      const reason = timedOut ? "Timed out while dumping the local database" : stderr || "Unknown error";
      throw new PlatformError(
        `Local database dump failed: ${reason}`,
        "Ensure the local postgres container is running and reachable."
      );
    }
  } finally {
    clearTimeout(timer);
    output.end();
  }
}

async function defaultDumpLocalDatabase(config: ProjectConfig, dumpPath: string): Promise<void> {
  const stackRoot = getLocalStackRoot(config.projectRoot);

  await spawnLocalDumpToFile(
    "docker",
    [
      "compose",
      "-p",
      config.projectName,
      "exec",
      "-T",
      "postgres",
      "sh",
      "-lc",
      'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" --clean --if-exists --create --no-owner --no-privileges "$POSTGRES_DB"',
    ],
    stackRoot,
    dumpPath
  );
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function rewriteLocalStorageEndpointForDocker(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0") {
    url.hostname = "host.docker.internal";
  }
  return url.toString();
}

export function collectPromoteBuckets(localConfig: ProjectConfig, serverConfig: ProjectConfig): string[] {
  const buckets = new Set<string>();

  for (const bucket of [...localConfig.buckets, ...serverConfig.buckets]) {
    buckets.add(bucket.name);
  }

  if (localConfig.services.directus || serverConfig.services.directus) {
    buckets.add("directus");
  }

  return [...buckets].sort();
}

export function getDatabaseDependentComposeServices(config: ProjectConfig): string[] {
  const services: string[] = [];

  if (config.services.nextjs) {
    services.push(config.frontend === "vite-react" ? "vite" : "nextjs");
  }
  if (config.services.directus) services.push("directus");
  if (config.services.windmill) services.push("windmill");
  if (config.services.hub) services.push("hub");
  if (config.services.adminer) services.push("adminer");

  return services;
}

async function defaultMirrorStorage(input: StorageMirrorInput): Promise<void> {
  const envPath = path.join(input.stateRoot, `mc-${Date.now()}.env`);
  const localEndpoint = rewriteLocalStorageEndpointForDocker(buildProjectUrls(input.localConfig.domain).storage);
  const serverEndpoint = buildProjectUrls(input.serverConfig.domain).storage;
  const envContent = buildEnvFile({
    SRC_URL: localEndpoint,
    SRC_ACCESS_KEY: input.localSecrets.seaweedfsAccessKey,
    SRC_SECRET_KEY: input.localSecrets.seaweedfsSecretKey,
    DST_URL: serverEndpoint,
    DST_ACCESS_KEY: input.serverSecrets.seaweedfsAccessKey,
    DST_SECRET_KEY: input.serverSecrets.seaweedfsSecretKey,
  });

  const bucketCommands = input.buckets.map((bucket) => {
    const srcBucket = shellQuote(`src/${bucket}`);
    const dstBucket = shellQuote(`dst/${bucket}`);
    return [
      `if mc ls ${srcBucket} >/dev/null 2>&1; then`,
      `  mc mb --ignore-existing ${dstBucket} >/dev/null 2>&1 || true`,
      `  mc mirror --overwrite ${srcBucket} ${dstBucket}`,
      "else",
      `  echo "Skipping missing local bucket ${bucket}"`,
      "fi",
    ].join("\n");
  }).join("\n");

  const script = [
    "set -eu",
    'mc alias set src "$SRC_URL" "$SRC_ACCESS_KEY" "$SRC_SECRET_KEY" >/dev/null',
    'mc alias set dst "$DST_URL" "$DST_ACCESS_KEY" "$DST_SECRET_KEY" >/dev/null',
    bucketCommands,
  ].join("\n");

  await mkdir(input.stateRoot, { recursive: true });
  await writeFile(envPath, envContent, "utf8");

  try {
    const result = await execLocalCommand(
      "docker",
      [
        "run",
        "--rm",
        "--env-file",
        envPath,
        "--add-host=host.docker.internal:host-gateway",
        "minio/mc",
        "sh",
        "-lc",
        script,
      ],
      input.stateRoot,
      LONG_TIMEOUT_MS
    );

    if (result.exitCode !== 0) {
      throw new PlatformError(
        `Storage mirror failed: ${result.stderr || result.stdout}`,
        "Ensure local Docker is running and the server storage endpoint is reachable."
      );
    }
  } finally {
    await rm(envPath, { force: true }).catch(() => undefined);
  }
}

function ensureTransferRequested(options: PromoteOptions): void {
  if (options.skipDeploy && options.skipDb && options.skipStorage) {
    throw new ConfigError(
      "Nothing to do for promote",
      "Remove one of --skip-deploy, --skip-db, or --skip-storage."
    );
  }
}

export class PromoteRunner {
  private readonly ssh: PromoteSshClient;
  private readonly secretsManager: PromoteSecretsClient;
  private readonly deployServer: NonNullable<PromoteRunnerDeps["deployServer"]>;
  private readonly dumpLocalDatabase: NonNullable<PromoteRunnerDeps["dumpLocalDatabase"]>;
  private readonly mirrorStorage: NonNullable<PromoteRunnerDeps["mirrorStorage"]>;

  constructor(
    private readonly callbacks: PromoteCallbacks = {},
    deps: PromoteRunnerDeps = {}
  ) {
    const ssh = deps.ssh ?? new SshService();
    this.ssh = ssh;
    this.secretsManager = deps.secretsManager ?? new SecretsManager(ssh as SshService);
    this.deployServer = deps.deployServer ?? this.deployServerWithOrchestrator.bind(this);
    this.dumpLocalDatabase = deps.dumpLocalDatabase ?? defaultDumpLocalDatabase;
    this.mirrorStorage = deps.mirrorStorage ?? defaultMirrorStorage;
  }

  async run(localConfig: ProjectConfig, serverConfig: ProjectConfig, options: PromoteOptions = {}): Promise<PromoteResult> {
    ensureTransferRequested(options);

    if (localConfig.mode !== "local") {
      throw new ConfigError("Promote requires a local source config", "Resolve the source with --mode local.");
    }
    if (serverConfig.mode !== "server") {
      throw new ConfigError("Promote requires a server target config", "Resolve the target with --mode server.");
    }

    const steps: PromoteStepResult[] = [];
    const transferRequested = !options.skipDb || !options.skipStorage;
    const localStackRoot = getLocalStackRoot(localConfig.projectRoot);
    const stateRoot = getPromoteStateRoot(localConfig.projectRoot);

    if (transferRequested && !existsSync(localStackRoot)) {
      throw new ConfigError(
        `Local runtime not found at ${localStackRoot}`,
        `Run 'ploybundle deploy ${localConfig.projectName} --mode local' before promoting.`
      );
    }

    await mkdir(stateRoot, { recursive: true });

    if (!options.skipDeploy) {
      const deployStep = await this.runStep("deploy", "Deploying server stack", async () => {
        const result = await this.deployServer(serverConfig, this.callbacks);
        if (!result.success) {
          throw new PlatformError(
            "Server deployment failed during promote",
            `Run 'ploybundle deploy ${serverConfig.projectName} --mode server' and retry.`
          );
        }

        return {
          message: "Server stack deployed",
          details: { phaseCount: result.phases.length },
        };
      });
      steps.push(deployStep);

      if (!deployStep.success) {
        return this.buildResult(serverConfig, steps);
      }
    } else {
      steps.push(this.buildSkippedStep("deploy", "Server deploy skipped"));
    }

    let localSecrets: GeneratedSecrets | undefined;
    let serverSecrets: GeneratedSecrets | undefined;

    if (!options.skipDb || !options.skipStorage) {
      const localSecretState = this.secretsManager.loadOrGenerateLocal(localConfig.projectRoot);
      if (localSecretState.isNew) {
        throw new ConfigError(
          "Local secrets not found",
          `Run 'ploybundle deploy ${localConfig.projectName} --mode local' before promoting.`
        );
      }
      localSecrets = localSecretState.secrets;

      const serverSecretState = await this.secretsManager.loadOrGenerate(serverConfig.ssh, serverConfig);
      if (serverSecretState.isNew) {
        throw new ConfigError(
          "Server secrets not found",
          options.skipDeploy
            ? `Run 'ploybundle deploy ${serverConfig.projectName} --mode server' first or remove --skip-deploy.`
            : "Re-run the server deployment, then retry promote."
        );
      }
      serverSecrets = serverSecretState.secrets;
    }

    if (options.skipDb || !localConfig.services.postgres || !serverConfig.services.postgres) {
      const reason = options.skipDb
        ? "Database promotion skipped"
        : "Database promotion skipped because postgres is disabled in local or server mode";
      steps.push(this.buildSkippedStep("database", reason));
    } else {
      const databaseStep = await this.runStep("database", "Promoting Postgres data", async () => {
        const result = await this.promoteDatabase(localConfig, serverConfig, stateRoot);
        return {
          message: "Database promoted to server",
          details: result,
        };
      });
      steps.push(databaseStep);

      if (!databaseStep.success) {
        return this.buildResult(serverConfig, steps);
      }
    }

    if (options.skipStorage || !localConfig.services.seaweedfs || !serverConfig.services.seaweedfs) {
      const reason = options.skipStorage
        ? "Storage promotion skipped"
        : "Storage promotion skipped because SeaweedFS is disabled in local or server mode";
      steps.push(this.buildSkippedStep("storage", reason));
    } else {
      const buckets = collectPromoteBuckets(localConfig, serverConfig);
      if (buckets.length === 0) {
        steps.push(this.buildSkippedStep("storage", "Storage promotion skipped because no buckets are configured"));
      } else {
        const storageStep = await this.runStep("storage", "Mirroring object storage", async () => {
          await this.mirrorStorage({
            buckets,
            localConfig,
            serverConfig,
            localSecrets: localSecrets!,
            serverSecrets: serverSecrets!,
            stateRoot,
          });

          return {
            message: "Object storage mirrored to server",
            details: { bucketCount: buckets.length, buckets },
          };
        });
        steps.push(storageStep);

        if (!storageStep.success) {
          return this.buildResult(serverConfig, steps);
        }
      }
    }

    return this.buildResult(serverConfig, steps);
  }

  private async deployServerWithOrchestrator(config: ProjectConfig, callbacks: PromoteCallbacks): Promise<DeployResult> {
    const adapter = createAdapter(config);
    const renderer = new StackArtifactRenderer();
    const orchestrator = new Orchestrator(adapter, renderer, {
      onPhaseStart: (phase, message) => callbacks.onDeployPhaseStart?.(phase, message),
      onPhaseComplete: (result) => callbacks.onDeployPhaseComplete?.(result),
      onLog: (message) => callbacks.onLog?.(message),
    });

    return orchestrator.deploy(config);
  }

  private async promoteDatabase(
    localConfig: ProjectConfig,
    serverConfig: ProjectConfig,
    stateRoot: string
  ): Promise<Record<string, unknown>> {
    const dumpFileName = `${localConfig.projectName}-${Date.now()}.sql`;
    const localDumpPath = path.join(stateRoot, dumpFileName);
    const remoteDumpPath = `/tmp/${dumpFileName}`;
    const servicesToStop = getDatabaseDependentComposeServices(serverConfig);
    let remoteDumpUploaded = false;
    let servicesStopped = false;
    let restoreFailed = false;

    try {
      await this.dumpLocalDatabase(localConfig, localDumpPath);
      this.callbacks.onLog?.(`Local database dumped to ${localDumpPath}`);

      await this.ssh.uploadFile(serverConfig.ssh, localDumpPath, remoteDumpPath, {
        timeoutMs: LONG_TIMEOUT_MS,
        maxBuffer: COMMAND_MAX_BUFFER,
      });
      remoteDumpUploaded = true;

      if (servicesToStop.length > 0) {
        await this.execRemoteChecked(
          serverConfig,
          this.composeCommand(serverConfig.projectName, `stop ${servicesToStop.map(shellQuote).join(" ")}`),
          STANDARD_TIMEOUT_MS,
          "Failed to stop server services before database restore"
        );
        servicesStopped = true;
      }

      try {
        await this.execRemoteChecked(
          serverConfig,
          this.composeCommand(
            serverConfig.projectName,
            `exec -T postgres sh -lc ${shellQuote('PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres')} < ${shellQuote(remoteDumpPath)}`
          ),
          LONG_TIMEOUT_MS,
          "Failed to restore the database on the server"
        );
      } catch (err) {
        restoreFailed = true;
        throw err;
      } finally {
        if (servicesStopped) {
          try {
            await this.execRemoteChecked(
              serverConfig,
              this.composeCommand(serverConfig.projectName, `up -d ${servicesToStop.map(shellQuote).join(" ")}`),
              STANDARD_TIMEOUT_MS,
              "Failed to restart server services after database restore"
            );
          } catch (err) {
            if (!restoreFailed) {
              throw err;
            }
            this.callbacks.onLog?.(
              `Warning: failed to restart some services after restore: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }

      return {
        servicesRestarted: servicesStopped,
        stoppedServices: servicesToStop,
      };
    } finally {
      await rm(localDumpPath, { force: true }).catch(() => undefined);

      if (remoteDumpUploaded) {
        await this.ssh.exec(
          serverConfig.ssh,
          `rm -f ${shellQuote(remoteDumpPath)}`,
          { timeoutMs: STANDARD_TIMEOUT_MS, maxBuffer: COMMAND_MAX_BUFFER }
        ).catch(() => undefined);
      }
    }
  }

  private composeCommand(projectName: string, command: string): string {
    return `cd ${shellQuote(REMOTE_PROJECT_DIR)} && docker compose -p ${shellQuote(projectName)} ${command}`;
  }

  private async execRemoteChecked(
    config: ProjectConfig,
    command: string,
    timeoutMs: number,
    message: string
  ): Promise<SshCommandResult> {
    const result = await this.ssh.exec(config.ssh, command, {
      timeoutMs,
      maxBuffer: COMMAND_MAX_BUFFER,
    });

    if (result.exitCode !== 0) {
      throw new PlatformError(
        `${message}: ${result.stderr || result.stdout}`,
        `Inspect the server with 'ploybundle logs ${config.projectName} --mode server'.`
      );
    }

    return result;
  }

  private async runStep(
    step: PromoteStepName,
    startMessage: string,
    fn: () => Promise<StepOutcome>
  ): Promise<PromoteStepResult> {
    this.callbacks.onStepStart?.(step, startMessage);
    const start = Date.now();

    try {
      const outcome = await fn();
      const result: PromoteStepResult = {
        step,
        success: true,
        skipped: false,
        message: outcome.message,
        duration: Date.now() - start,
        details: outcome.details,
      };
      this.callbacks.onStepComplete?.(result);
      return result;
    } catch (err) {
      const result: PromoteStepResult = {
        step,
        success: false,
        skipped: false,
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      };
      this.callbacks.onStepComplete?.(result);
      return result;
    }
  }

  private buildSkippedStep(step: PromoteStepName, message: string): PromoteStepResult {
    const result: PromoteStepResult = {
      step,
      success: true,
      skipped: true,
      message,
      duration: 0,
    };
    this.callbacks.onStepComplete?.(result);
    return result;
  }

  private buildResult(config: ProjectConfig, steps: PromoteStepResult[]): PromoteResult {
    return {
      success: steps.every((step) => step.success),
      projectName: config.projectName,
      target: config.target,
      urls: buildProjectUrls(config.domain),
      steps,
    };
  }
}
