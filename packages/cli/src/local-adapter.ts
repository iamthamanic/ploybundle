import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  PlatformAdapter,
  SshTarget,
  ProjectConfig,
  HostDiagnosis,
  ServiceHealth,
  PhaseResult,
  StackArtifacts,
  ProjectUrls,
  ProjectStatus,
} from "@ploybundle/shared";
import {
  isStackServiceEnabled,
  listStackServices,
  PlatformError,
  buildEnvFile,
  buildProjectUrls,
} from "@ploybundle/shared";
import { getLocalManifestPath, getLocalRuntimeRoot, getLocalStackRoot } from "./local-runtime.js";

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
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

export class LocalAdapter implements PlatformAdapter {
  readonly name = "Local Docker";

  private runtimeRoot(config: ProjectConfig): string {
    return getLocalRuntimeRoot(config.projectRoot);
  }

  private stackRoot(config: ProjectConfig): string {
    return getLocalStackRoot(config.projectRoot);
  }

  private manifestPath(config: ProjectConfig): string {
    return getLocalManifestPath(config.projectRoot);
  }

  private async exec(args: string[], cwd?: string): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execFileUtf8("docker", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300_000,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
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
      throw new PlatformError(
        `Local Docker command failed: ${err instanceof Error ? err.message : String(err)}`,
        "Ensure Docker Desktop / docker compose is installed and running."
      );
    }
  }

  private async compose(config: ProjectConfig, args: string[]): Promise<CommandResult> {
    return this.exec(["compose", "-p", config.projectName, ...args], this.stackRoot(config));
  }

  private parseContainerStatus(output: string, config: ProjectConfig): ServiceHealth[] {
    const services = listStackServices(config);
    try {
      const containers = output
        .trim()
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { Name: string; State: string; Status: string });

      return services.map((service) => {
        const container = containers.find((entry) => entry.Name.toLowerCase().includes(service));
        const enabled = isStackServiceEnabled(config, service);

        if (!container) {
          return {
            service,
            healthy: !enabled,
            message: enabled ? "Not found" : "Disabled",
          };
        }

        return {
          service,
          healthy: container.State === "running",
          message: container.Status,
        };
      });
    } catch {
      return services.map((service) => ({
        service,
        healthy: false,
        message: "Unable to determine status",
      }));
    }
  }

  private async waitForServices(config: ProjectConfig, maxAttempts: number = 30): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.status(config.ssh, config);
      const enabledServices = status.services.filter((svc) => isStackServiceEnabled(config, svc.service));
      if (enabledServices.length > 0 && enabledServices.every((svc) => svc.healthy)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  private async materializeArtifacts(config: ProjectConfig, artifacts: StackArtifacts): Promise<void> {
    const runtimeRoot = this.runtimeRoot(config);
    const stackRoot = this.stackRoot(config);
    const manifestPath = this.manifestPath(config);
    const files = new Map<string, string>([
      ["docker-compose.yml", artifacts.composeFile],
      ["hub/config/board.json", artifacts.hubConfig],
    ]);

    for (const [name, content] of Object.entries(artifacts.envFiles)) {
      files.set(name, content);
    }

    for (const [name, content] of Object.entries(artifacts.configs)) {
      files.set(name, content);
    }

    await mkdir(runtimeRoot, { recursive: true });
    await mkdir(stackRoot, { recursive: true });

    if (existsSync(manifestPath)) {
      const previous = JSON.parse(await readFile(manifestPath, "utf8")) as { files?: string[] };
      for (const relPath of previous.files ?? []) {
        if (!files.has(relPath)) {
          await unlink(path.join(stackRoot, relPath)).catch(() => undefined);
        }
      }
    }

    for (const [relPath, content] of files) {
      const absPath = path.join(stackRoot, relPath);
      await mkdir(path.dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf8");
    }

    await writeFile(
      manifestPath,
      JSON.stringify({ files: [...files.keys()], metadata: artifacts.metadata }, null, 2),
      "utf8"
    );
  }

  async validateHost(_sshTarget: SshTarget): Promise<HostDiagnosis> {
    const docker = await this.exec(["--version"]);
    const disk = await execFileUtf8("df", ["-k", "."], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
    }).catch(() => ({ stdout: "", stderr: "" }));

    const diskLine = disk.stdout.trim().split("\n").at(-1) ?? "";
    const diskFields = diskLine.split(/\s+/);
    const availableKb = Number.parseInt(diskFields[3] ?? "0", 10);
    const availableDiskGb = Math.max(0, Math.floor(availableKb / 1024 / 1024));

    return {
      os: `${os.platform()} ${os.arch()}`,
      osVersion: os.release(),
      isUbuntu2404: false,
      hasRoot: typeof process.getuid === "function" ? process.getuid() === 0 : false,
      dockerInstalled: docker.exitCode === 0,
      dockerVersion: docker.stdout.trim() || undefined,
      availableDiskGb,
      availableRamMb: Math.floor(os.totalmem() / 1024 / 1024),
      openPorts: [],
      portConflicts: [],
    };
  }

  async installPlatform(_sshTarget: SshTarget, _config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();
    const health = await this.platformHealth(_sshTarget);

    if (!health.healthy) {
      throw new PlatformError(
        health.message ?? "Docker is not available",
        "Start Docker Desktop / Docker Engine before running local mode."
      );
    }

    return {
      phase: "install-platform",
      success: true,
      message: "Local Docker environment ready",
      duration: Date.now() - start,
      details: { docker: true },
    };
  }

  async platformHealth(_sshTarget: SshTarget): Promise<ServiceHealth> {
    const result = await this.exec(["info"]);
    const healthy = result.exitCode === 0;

    return {
      service: "hub",
      healthy,
      message: healthy ? "Docker is running locally" : "Docker is not running locally",
    };
  }

  async deployStack(_sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    const start = Date.now();
    await this.materializeArtifacts(config, artifacts);

    const result = await this.compose(config, ["up", "-d", "--build", "--remove-orphans"]);
    if (result.exitCode !== 0) {
      throw new PlatformError(
        `Local stack deployment failed: ${result.stderr || result.stdout}`,
        `Check docker compose logs with: ploybundle logs ${config.projectName} --mode local`
      );
    }

    await this.waitForServices(config);

    return {
      phase: "deploy",
      success: true,
      message: "Local stack deployed successfully",
      duration: Date.now() - start,
      details: { stackRoot: this.stackRoot(config) },
    };
  }

  async updateStack(sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    return this.deployStack(sshTarget, config, artifacts);
  }

  async destroyStack(_sshTarget: SshTarget, config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();
    const stackRoot = this.stackRoot(config);

    if (!existsSync(stackRoot)) {
      return {
        phase: "validate",
        success: true,
        message: "Local stack already absent",
        duration: Date.now() - start,
      };
    }

    const result = await this.compose(config, ["down", "-v", "--remove-orphans"]);
    if (result.exitCode !== 0) {
      throw new PlatformError(
        `Failed to destroy local stack: ${result.stderr || result.stdout}`,
        "Make sure Docker is running and the local stack directory still exists."
      );
    }

    await rm(this.runtimeRoot(config), { recursive: true, force: true });

    return {
      phase: "validate",
      success: true,
      message: "Local stack destroyed",
      duration: Date.now() - start,
      details: { stackRoot },
    };
  }

  async fetchLogs(_sshTarget: SshTarget, config: ProjectConfig, service?: string): Promise<string> {
    const args = ["logs", "--tail=200"];
    if (service) args.push(service);
    const result = await this.compose(config, args);
    return result.stdout || result.stderr;
  }

  openUrls(config: ProjectConfig): ProjectUrls {
    return buildProjectUrls(config.domain);
  }

  async setEnvironmentVariables(_sshTarget: SshTarget, config: ProjectConfig, env: Record<string, string>): Promise<void> {
    const stackRoot = this.stackRoot(config);
    await mkdir(stackRoot, { recursive: true });
    await writeFile(path.join(stackRoot, ".env"), buildEnvFile(env), "utf8");
  }

  async status(_sshTarget: SshTarget, config: ProjectConfig): Promise<ProjectStatus> {
    if (!existsSync(this.stackRoot(config))) {
      return {
        projectName: config.projectName,
        mode: config.mode,
        target: config.target,
        preset: config.template?.name ?? config.preset,
        services: listStackServices(config).map((service) => ({
          service,
          healthy: false,
          message: "Local stack not materialized",
        })),
        urls: buildProjectUrls(config.domain),
        configSummary: {
          mode: config.mode,
          target: config.target ?? "local",
          preset: config.template?.name ?? config.preset,
          domain: config.domain.root,
          resourceProfile: config.resourceProfile,
        },
      };
    }

    const result = await this.compose(config, ["ps", "--format", "json"]);
    const services = this.parseContainerStatus(result.stdout, config);

    return {
      projectName: config.projectName,
      mode: config.mode,
      target: config.target,
      preset: config.template?.name ?? config.preset,
      services,
      urls: buildProjectUrls(config.domain),
      configSummary: {
        mode: config.mode,
        target: config.target ?? "local",
        preset: config.template?.name ?? config.preset,
        domain: config.domain.root,
        resourceProfile: config.resourceProfile,
      },
    };
  }
}
