import type {
  ProjectConfig,
  PlatformAdapter,
  DeployResult,
  PhaseResult,
  DeployPhase,
  StackArtifacts,
  ProjectSummary,
  GeneratedSecrets,
} from "@ploybundle/shared";
import { DeployError, buildProjectUrls } from "@ploybundle/shared";
import { SshService } from "../ssh/ssh-service.js";
import { HostInspector } from "../host/host-inspector.js";
import { DockerInstaller } from "../host/docker-installer.js";
import { SecretsManager } from "../secrets/secrets-manager.js";

export interface OrchestratorCallbacks {
  onPhaseStart?: (phase: DeployPhase, message: string) => void;
  onPhaseComplete?: (result: PhaseResult) => void;
  onLog?: (message: string) => void;
}

export interface ArtifactRenderer {
  render(config: ProjectConfig, env: Record<string, string>): StackArtifacts;
}

export class Orchestrator {
  private readonly ssh: SshService;
  private readonly inspector: HostInspector;
  private readonly dockerInstaller: DockerInstaller;
  private readonly secretsManager: SecretsManager;

  constructor(
    private readonly adapter: PlatformAdapter,
    private readonly renderer: ArtifactRenderer,
    private readonly callbacks: OrchestratorCallbacks = {}
  ) {
    this.ssh = new SshService();
    this.inspector = new HostInspector(this.ssh);
    this.dockerInstaller = new DockerInstaller(this.ssh);
    this.secretsManager = new SecretsManager(this.ssh);
  }

  async init(config: ProjectConfig): Promise<DeployResult> {
    const phases: PhaseResult[] = [];

    // Phase 1: Validate
    phases.push(await this.runPhase("validate", "Validating configuration", async () => {
      // Config is already validated by the parser, but we do additional checks
      const urls = buildProjectUrls(config.domain);
      return { urls };
    }));
    if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

    if (config.mode === "server") {
      // Phase 2: Connect and inspect
      phases.push(await this.runPhase("connect", "Connecting to host", async () => {
        const connected = await this.ssh.testConnection(config.ssh);
        if (!connected) {
          throw new DeployError(
            `Cannot connect to ${config.ssh.user}@${config.ssh.host}:${config.ssh.port}`,
            "connect",
            "Check SSH credentials, key file, and that the server is reachable."
          );
        }
        return { connected: true };
      }));
      if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

      // Phase 3: Inspect host
      phases.push(await this.runPhase("inspect", "Inspecting host", async () => {
        const diagnosis = await this.inspector.inspect(config.ssh);
        const validation = this.inspector.validate(diagnosis);

        if (!validation.valid) {
          this.callbacks.onLog?.(`Host issues found:\n${validation.issues.join("\n")}`);
          if (!diagnosis.isUbuntu2404) {
            this.callbacks.onLog?.("Warning: Non-Ubuntu 24.04 detected. Proceeding with caution.");
          }
        }

        if (!diagnosis.dockerInstalled) {
          this.callbacks.onLog?.("Docker not found. Installing...");
          const dockerResult = await this.dockerInstaller.ensureDocker(config.ssh);
          this.callbacks.onLog?.(dockerResult.alreadyPresent ? "Docker already installed." : "Docker installed successfully.");
        }

        return { diagnosis };
      }));
      if (!phases[phases.length - 1]!.success) return this.buildResult(phases);
    }

    // Phase 4: Install platform / validate local runtime
    phases.push(await this.runPhase("install-platform", `Preparing ${this.adapter.name}`, async () => {
      const result = await this.adapter.installPlatform(config.ssh, config);
      return result.details ?? {};
    }));
    if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

    // Phase 5: Render project bundle
    let artifacts: StackArtifacts;
    phases.push(await this.runPhase("render", "Rendering project bundle", async () => {
      const { secrets, isNew } = await this.loadOrGenerateSecrets(config);
      if (isNew) {
        await this.persistSecrets(config, secrets);
        this.callbacks.onLog?.("Generated and stored new secrets.");
      } else {
        this.callbacks.onLog?.("Using existing secrets.");
      }

      const env = this.secretsManager.buildEnvMap(secrets, config);
      artifacts = this.renderer.render(config, env);
      return { secretsNew: isNew, artifactCount: Object.keys(artifacts.configs).length };
    }));
    if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

    // Phase 6: Deploy
    phases.push(await this.runPhase("deploy", "Deploying stack", async () => {
      const result = await this.adapter.deployStack(config.ssh, config, artifacts!);
      return result.details ?? {};
    }));
    if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

    // Phase 7: Seed
    phases.push(await this.runPhase("seed", "Seeding services", async () => {
      // Set environment variables on the platform
      const { secrets } = await this.loadOrGenerateSecrets(config);
      const env = this.secretsManager.buildEnvMap(secrets, config);
      await this.adapter.setEnvironmentVariables(config.ssh, config, env);
      return { seeded: true };
    }));
    if (!phases[phases.length - 1]!.success) return this.buildResult(phases);

    // Phase 8: Verify
    phases.push(await this.runPhase("verify", "Verifying deployment", async () => {
      const status = await this.adapter.status(config.ssh, config);
      const allHealthy = status.services.every((s) => s.healthy);
      return { healthy: allHealthy, services: status.services };
    }));

    return this.buildResult(phases, config);
  }

  async deploy(config: ProjectConfig): Promise<DeployResult> {
    const phases: PhaseResult[] = [];

    const { secrets, isNew } = await this.loadOrGenerateSecrets(config);
    if (isNew) {
      await this.persistSecrets(config, secrets);
    }
    const env = this.secretsManager.buildEnvMap(secrets, config);
    const artifacts = this.renderer.render(config, env);

    phases.push(await this.runPhase("deploy", "Deploying stack", async () => {
      const result = await this.adapter.deployStack(config.ssh, config, artifacts);
      return result.details ?? {};
    }));

    phases.push(await this.runPhase("verify", "Verifying deployment", async () => {
      const status = await this.adapter.status(config.ssh, config);
      return { healthy: status.services.every((s) => s.healthy) };
    }));

    return this.buildResult(phases, config);
  }

  async destroy(config: ProjectConfig): Promise<PhaseResult> {
    return this.runPhase("validate", "Destroying stack", async () => {
      const result = await this.adapter.destroyStack(config.ssh, config);
      return result.details ?? {};
    });
  }

  async update(config: ProjectConfig): Promise<DeployResult> {
    const phases: PhaseResult[] = [];

    const { secrets, isNew } = await this.loadOrGenerateSecrets(config);
    if (isNew) {
      await this.persistSecrets(config, secrets);
    }
    const env = this.secretsManager.buildEnvMap(secrets, config);
    const artifacts = this.renderer.render(config, env);

    phases.push(await this.runPhase("deploy", "Updating stack", async () => {
      const result = await this.adapter.updateStack(config.ssh, config, artifacts);
      return result.details ?? {};
    }));

    phases.push(await this.runPhase("verify", "Verifying update", async () => {
      const status = await this.adapter.status(config.ssh, config);
      return { healthy: status.services.every((s) => s.healthy) };
    }));

    return this.buildResult(phases, config);
  }

  private async runPhase(
    phase: DeployPhase,
    message: string,
    fn: () => Promise<Record<string, unknown>>
  ): Promise<PhaseResult> {
    this.callbacks.onPhaseStart?.(phase, message);
    const start = Date.now();

    try {
      const details = await fn();
      const result: PhaseResult = {
        phase,
        success: true,
        message: `${message} completed`,
        duration: Date.now() - start,
        details,
      };
      this.callbacks.onPhaseComplete?.(result);
      return result;
    } catch (err) {
      const result: PhaseResult = {
        phase,
        success: false,
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - start,
      };
      this.callbacks.onPhaseComplete?.(result);
      return result;
    }
  }

  private buildResult(phases: PhaseResult[], config?: ProjectConfig): DeployResult {
    const success = phases.every((p) => p.success);
    let summary: ProjectSummary | undefined;

    if (success && config) {
      const urls = buildProjectUrls(config.domain);
      summary = {
        projectName: config.projectName,
        mode: config.mode,
        target: config.target,
        preset: config.template?.name ?? config.preset,
        urls,
        services: [],
        troubleshootingHint: `Run 'ploybundle doctor ${config.projectName}${config.mode === "server" ? " --mode server" : " --mode local"}' to diagnose issues.`,
      };
    }

    return { success, phases, summary };
  }

  private async loadOrGenerateSecrets(config: ProjectConfig): Promise<{ secrets: GeneratedSecrets; isNew: boolean }> {
    if (config.mode === "local") {
      return this.secretsManager.loadOrGenerateLocal(config.projectRoot);
    }

    return this.secretsManager.loadOrGenerate(config.ssh, config);
  }

  private async persistSecrets(config: ProjectConfig, secrets: GeneratedSecrets): Promise<void> {
    if (config.mode === "local") {
      this.secretsManager.persistLocal(config.projectRoot, secrets);
      return;
    }

    await this.secretsManager.persist(config.ssh, secrets);
  }
}
