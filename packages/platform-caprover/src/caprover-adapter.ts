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
import { PlatformError, buildProjectUrls, isStackServiceEnabled, listStackServices } from "@ploybundle/shared";
import { SshService } from "@ploybundle/core";

const CAPROVER_INSTALL_SCRIPT = `
docker run -p 80:80 -p 443:443 -p 3000:3000 \\
  --restart always \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v /captain:/captain \\
  -e ACCEPTED_TERMS=true \\
  --name captain \\
  -d caprover/caprover:latest
`;

const PROJECT_DIR = "/opt/ploybundle";
const COMPOSE_PATH = `${PROJECT_DIR}/docker-compose.yml`;

export class CaproverAdapter implements PlatformAdapter {
  readonly name = "CapRover";
  readonly target = "lite" as const;

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

  async installPlatform(sshTarget: SshTarget, config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();

    // Check if CapRover is already running
    const check = await this.ssh.exec(sshTarget, "docker ps --filter name=captain --format '{{.Names}}' 2>/dev/null");
    if (check.stdout.trim() === "captain") {
      return {
        phase: "install-platform",
        success: true,
        message: "CapRover already installed and running",
        duration: Date.now() - start,
        details: { alreadyInstalled: true },
      };
    }

    // Install CapRover
    const installResult = await this.ssh.exec(sshTarget, CAPROVER_INSTALL_SCRIPT.trim());
    if (installResult.exitCode !== 0) {
      throw new PlatformError(
        `CapRover installation failed: ${installResult.stderr}`,
        "Check Docker installation and port availability (80, 443, 3000)."
      );
    }

    // Wait for CapRover to become healthy
    await this.waitForCaprover(sshTarget);

    // Configure CapRover with project domain
    await this.configureCaprover(sshTarget, config);

    return {
      phase: "install-platform",
      success: true,
      message: "CapRover installed successfully",
      duration: Date.now() - start,
      details: { alreadyInstalled: false },
    };
  }

  async platformHealth(sshTarget: SshTarget): Promise<ServiceHealth> {
    const result = await this.ssh.exec(
      sshTarget,
      "docker ps --filter name=captain --format '{{.Status}}' 2>/dev/null"
    );
    const running = result.stdout.trim().toLowerCase().includes("up");

    return {
      service: "hub",
      healthy: running,
      message: running ? "CapRover is running" : "CapRover is not running",
    };
  }

  async deployStack(sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    const start = Date.now();

    // Create project directory
    await this.ssh.exec(sshTarget, `mkdir -p ${PROJECT_DIR}`);

    // Upload docker-compose file
    await this.ssh.uploadContent(sshTarget, artifacts.composeFile, COMPOSE_PATH);

    // Upload all env files
    for (const [name, content] of Object.entries(artifacts.envFiles)) {
      await this.ssh.uploadContent(sshTarget, content, `${PROJECT_DIR}/${name}`);
    }

    // Upload all config files
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

    // Wait for services to be up
    await this.waitForServices(sshTarget, config);

    return {
      phase: "deploy",
      success: true,
      message: "Stack deployed successfully",
      duration: Date.now() - start,
      details: { services: Object.keys(artifacts.envFiles) },
    };
  }

  async updateStack(sshTarget: SshTarget, config: ProjectConfig, artifacts: StackArtifacts): Promise<PhaseResult> {
    // Update uses the same deploy logic — docker compose handles updates idempotently
    return this.deployStack(sshTarget, config, artifacts);
  }

  async destroyStack(sshTarget: SshTarget, config: ProjectConfig): Promise<PhaseResult> {
    const start = Date.now();

    const result = await this.ssh.exec(
      sshTarget,
      `cd ${PROJECT_DIR} && docker compose -p ${config.projectName} down -v --remove-orphans 2>/dev/null; echo done`
    );

    return {
      phase: "validate",
      success: true,
      message: "Stack destroyed",
      duration: Date.now() - start,
      details: { output: result.stdout },
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
      // Docker compose ps --format json outputs one JSON object per line
      const containers = output
        .trim()
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { Name: string; State: string; Status: string });

      if (output.trim() && containers.length === 0) {
        throw new Error("No container status JSON found");
      }

      return services.map((service) => {
        const container = containers.find((c) =>
          c.Name.toLowerCase().includes(service)
        );
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

  private async waitForCaprover(sshTarget: SshTarget, maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.ssh.exec(
        sshTarget,
        "docker ps --filter name=captain --filter health=healthy --format '{{.Names}}' 2>/dev/null"
      );
      if (result.stdout.trim() === "captain") return;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new PlatformError(
      "CapRover did not become healthy in time",
      "Check 'docker logs captain' on the server for details."
    );
  }

  private async configureCaprover(sshTarget: SshTarget, config: ProjectConfig): Promise<void> {
    // Set the root domain for CapRover
    const deployDomain = config.domain.deploy ?? `deploy.${config.domain.root}`;
    await this.ssh.exec(
      sshTarget,
      `docker exec captain sh -c 'echo "${deployDomain}" > /captain/data/config-captain.json' 2>/dev/null || true`
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
    // Non-fatal: services may still be starting
  }
}
