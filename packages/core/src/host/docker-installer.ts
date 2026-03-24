import type { SshTarget } from "@ploybundle/shared";
import { PlatformError } from "@ploybundle/shared";
import type { SshService } from "../ssh/ssh-service.js";

export class DockerInstaller {
  constructor(private readonly ssh: SshService) {}

  async ensureDocker(target: SshTarget): Promise<{ installed: boolean; alreadyPresent: boolean }> {
    const check = await this.ssh.exec(target, "docker --version 2>/dev/null");
    if (check.exitCode === 0) {
      return { installed: true, alreadyPresent: true };
    }

    await this.install(target);
    return { installed: true, alreadyPresent: false };
  }

  private async install(target: SshTarget): Promise<void> {
    // Install Docker using the official convenience script
    const steps = [
      "apt-get update -qq",
      "apt-get install -y -qq ca-certificates curl gnupg",
      "install -m 0755 -d /etc/apt/keyrings",
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes',
      'chmod a+r /etc/apt/keyrings/docker.gpg',
      `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null`,
      "apt-get update -qq",
      "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
      "systemctl enable docker",
      "systemctl start docker",
    ];

    for (const step of steps) {
      const result = await this.ssh.exec(target, step);
      if (result.exitCode !== 0) {
        throw new PlatformError(
          `Docker installation failed at step: ${step}`,
          `Error: ${result.stderr}. Try running the Docker installation manually on the server.`
        );
      }
    }

    // Verify installation
    const verify = await this.ssh.exec(target, "docker --version");
    if (verify.exitCode !== 0) {
      throw new PlatformError(
        "Docker installation completed but verification failed",
        "Try connecting to the server and running 'docker --version' manually."
      );
    }
  }
}
