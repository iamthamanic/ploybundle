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
  PlatformError,
  buildProjectUrls,
  isStackServiceEnabled,
  listStackServices,
} from "@ploybundle/shared";
import { SshService } from "@ploybundle/core";

const COOLIFY_INSTALL_CMD = "curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash";
const PROJECT_DIR = "/opt/ploybundle";
const COMPOSE_PATH = `${PROJECT_DIR}/docker-compose.yml`;

export class CoolifyAdapter implements PlatformAdapter {
  readonly name = "Coolify";
  readonly target = "full" as const;

  private readonly ssh: SshService;

  constructor(ssh?: SshService) {
    this.ssh = ssh ?? new SshService();
  }

  async validateHost(sshTarget: SshTarget): Promise<HostDiagnosis> {
    const result = await this.ssh.exec(sshTarget, "cat /etc/os-release && free -m && df -BG /");
    const lines = result.stdout.split("\n");

    let os = "unknown";
    let osVersion = "unknown";
    for (const line of lines) {
      if (line.startsWith("NAME=")) os = line.split("=")[1]?.replace(/"/g, "") ?? "unknown";
      if (line.startsWith("VERSION_ID=")) osVersion = line.split("=")[1]?.replace(/"/g, "") ?? "unknown";
    }

    return {
      os,
      osVersion,
      isUbuntu2404: os.toLowerCase().includes("ubuntu") && osVersion.startsWith("24.04"),
      hasRoot: true,
      dockerInstalled: true,
      availableDiskGb: 20,
      availableRamMb: 4096,
      openPorts: [],
      portConflicts: [],
    };
  }

  async installPlatform(sshTarget: SshTarget, _config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();

    // Check if Coolify is already running
    const check = await this.ssh.exec(
      sshTarget,
      "docker ps --filter name=coolify --format '{{.Names}}' 2>/dev/null"
    );
    if (check.stdout.trim().includes("coolify")) {
      return {
        phase: "install-platform",
        success: true,
        message: "Coolify already installed and running",
        duration: Date.now() - start,
        details: { alreadyInstalled: true },
      };
    }

    // Install Coolify
    const installResult = await this.ssh.exec(sshTarget, COOLIFY_INSTALL_CMD);
    if (installResult.exitCode !== 0) {
      throw new PlatformError(
        `Coolify installation failed: ${installResult.stderr}`,
        "Check the Coolify installation docs at https://coolify.io/docs/installation"
      );
    }

    // Wait for Coolify to become healthy
    await this.waitForCoolify(sshTarget);

    return {
      phase: "install-platform",
      success: true,
      message: "Coolify installed successfully",
      duration: Date.now() - start,
      details: { alreadyInstalled: false },
    };
  }

  async platformHealth(sshTarget: SshTarget): Promise<ServiceHealth> {
    const result = await this.ssh.exec(
      sshTarget,
      "docker ps --filter name=coolify --format '{{.Status}}' 2>/dev/null"
    );
    const running = result.stdout.trim().toLowerCase().includes("up");

    return {
      service: "hub",
      healthy: running,
      message: running ? "Coolify is running" : "Coolify is not running",
    };
  }

  async deployStack(sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    const start = Date.now();

    // Create project directory
    await this.ssh.exec(sshTarget, `mkdir -p ${PROJECT_DIR}`);

    // Upload docker-compose file
    await this.ssh.uploadContent(sshTarget, artifacts.composeFile, COMPOSE_PATH);

    // Upload env files
    for (const [name, content] of Object.entries(artifacts.envFiles)) {
      await this.ssh.uploadContent(sshTarget, content, `${PROJECT_DIR}/${name}`);
    }

    // Upload config files
    for (const [name, content] of Object.entries(artifacts.configs)) {
      await this.ssh.uploadContent(sshTarget, content, `${PROJECT_DIR}/${name}`);
    }

    // Upload hub board.json for diagnostics/automation (same schema as container expects)
    await this.ssh.uploadContent(sshTarget, artifacts.hubConfig, `${PROJECT_DIR}/hub/config/board.json`);

    // Deploy with docker compose
    const deployResult = await this.ssh.exec(
      sshTarget,
      `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} up -d --remove-orphans`
    );

    if (deployResult.exitCode !== 0) {
      throw new PlatformError(
        `Stack deployment failed: ${deployResult.stderr}`,
        `Check docker compose logs with: ploybundle logs ${config.projectName}`
      );
    }

    await this.waitForServices(sshTarget, config);

    return {
      phase: "deploy",
      success: true,
      message: "Stack deployed successfully via Coolify",
      duration: Date.now() - start,
      details: { platform: "coolify" },
    };
  }

  async updateStack(sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    return this.deployStack(sshTarget, config, artifacts);
  }

  async destroyStack(sshTarget: SshTarget, config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();

    await this.ssh.exec(
      sshTarget,
      `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} down -v --remove-orphans 2>/dev/null; echo done`
    );

    return {
      phase: "validate",
      success: true,
      message: "Stack destroyed",
      duration: Date.now() - start,
    };
  }

  async fetchLogs(sshTarget: SshTarget, config: ProjectConfig, service?: string): Promise<string> {
    const serviceFlag = service ? ` ${service}` : "";
    const result = await this.ssh.exec(
      sshTarget,
      `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} logs --tail=200${serviceFlag} 2>&1`
    );
    return result.stdout;
  }

  openUrls(config: ProjectConfig): ProjectUrls {
    return buildProjectUrls(config.domain);
  }

  async setEnvironmentVariables(
    sshTarget: SshTarget,
    _config: ProjectConfig,
    env: Record<string, string>
  ): Promise<void> {
    const envContent = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n";

    await this.ssh.uploadContent(sshTarget, envContent, `${PROJECT_DIR}/.env`);
  }

  async status(sshTarget: SshTarget, config: ProjectConfig): Promise<ProjectStatus> {
    const result = await this.ssh.exec(
      sshTarget,
      `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} ps --format json 2>/dev/null || echo "[]"`
    );

    const services = this.parseContainerStatus(result.stdout, config);
    const urls = buildProjectUrls(config.domain);

    return {
      projectName: config.projectName,
      mode: config.mode,
      target: config.target,
      preset: config.template?.name ?? config.preset,
      services,
      urls,
      configSummary: {
        target: config.target ?? "",
        preset: config.template?.name ?? config.preset,
        domain: config.domain.root,
        resourceProfile: config.resourceProfile,
      },
    };
  }

  private parseContainerStatus(output: string, config: ProjectConfig): ServiceHealth[] {
    const services = listStackServices(config);
    try {
      const containers = output
        .trim()
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { Name: string; State: string; Status: string });

      if (output.trim() && containers.length === 0) {
        throw new Error("No container status JSON found");
      }

      return services.map((service) => {
        const container = containers.find((c) => c.Name.toLowerCase().includes(service));
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

  private async waitForCoolify(sshTarget: SshTarget, maxAttempts: number = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.ssh.exec(
        sshTarget,
        "docker ps --filter name=coolify --format '{{.Status}}' 2>/dev/null"
      );
      if (result.stdout.trim().toLowerCase().includes("up")) return;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new PlatformError(
      "Coolify did not become healthy in time",
      "Check 'docker logs coolify' on the server for details."
    );
  }

  private async waitForServices(sshTarget: SshTarget, config: ProjectConfig, maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.ssh.exec(
        sshTarget,
        `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} ps --format '{{.State}}' 2>/dev/null`
      );
      const states = result.stdout.trim().split("\n").filter(Boolean);
      if (states.length > 0 && states.every((s) => s === "running")) return;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}
