import type { SshTarget, HostDiagnosis } from "@ploybundle/shared";
import { MIN_DISK_GB, MIN_RAM_MB, REQUIRED_PORTS } from "@ploybundle/shared";
import type { SshService } from "../ssh/ssh-service.js";

export class HostInspector {
  constructor(private readonly ssh: SshService) {}

  async inspect(target: SshTarget): Promise<HostDiagnosis> {
    const [osInfo, dockerInfo, diskInfo, ramInfo, portInfo, whoami] = await Promise.all([
      this.getOsInfo(target),
      this.getDockerInfo(target),
      this.getDiskInfo(target),
      this.getRamInfo(target),
      this.getOpenPorts(target),
      this.ssh.exec(target, "whoami"),
    ]);

    const isRoot = whoami.stdout.trim() === "root";

    return {
      os: osInfo.name,
      osVersion: osInfo.version,
      isUbuntu2404: osInfo.name.toLowerCase().includes("ubuntu") && osInfo.version.startsWith("24.04"),
      hasRoot: isRoot,
      dockerInstalled: dockerInfo.installed,
      dockerVersion: dockerInfo.version,
      availableDiskGb: diskInfo,
      availableRamMb: ramInfo,
      openPorts: portInfo.open,
      portConflicts: portInfo.conflicts,
    };
  }

  validate(diagnosis: HostDiagnosis): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!diagnosis.isUbuntu2404) {
      issues.push(`Expected Ubuntu 24.04, found ${diagnosis.os} ${diagnosis.osVersion}. Ploybundle targets Ubuntu 24.04 LTS.`);
    }

    if (!diagnosis.hasRoot) {
      issues.push("Root access is required. Connect as root or a user with sudo privileges.");
    }

    if (diagnosis.availableDiskGb < MIN_DISK_GB) {
      issues.push(`Insufficient disk space: ${diagnosis.availableDiskGb}GB available, ${MIN_DISK_GB}GB required.`);
    }

    if (diagnosis.availableRamMb < MIN_RAM_MB) {
      issues.push(`Insufficient RAM: ${diagnosis.availableRamMb}MB available, ${MIN_RAM_MB}MB required.`);
    }

    if (diagnosis.portConflicts.length > 0) {
      issues.push(`Port conflicts detected on: ${diagnosis.portConflicts.join(", ")}. These ports are needed by ploybundle services.`);
    }

    return { valid: issues.length === 0, issues };
  }

  private async getOsInfo(target: SshTarget): Promise<{ name: string; version: string }> {
    const result = await this.ssh.exec(target, "cat /etc/os-release 2>/dev/null || echo 'unknown'");
    const lines = result.stdout.split("\n");
    let name = "unknown";
    let version = "unknown";

    for (const line of lines) {
      if (line.startsWith("NAME=")) {
        name = line.split("=")[1]?.replace(/"/g, "") ?? "unknown";
      }
      if (line.startsWith("VERSION_ID=")) {
        version = line.split("=")[1]?.replace(/"/g, "") ?? "unknown";
      }
    }

    return { name, version };
  }

  private async getDockerInfo(target: SshTarget): Promise<{ installed: boolean; version?: string }> {
    const result = await this.ssh.exec(target, "docker --version 2>/dev/null");
    if (result.exitCode !== 0) {
      return { installed: false };
    }
    const match = result.stdout.match(/Docker version ([\d.]+)/);
    return { installed: true, version: match?.[1] };
  }

  private async getDiskInfo(target: SshTarget): Promise<number> {
    const result = await this.ssh.exec(target, "df -BG / | tail -1 | awk '{print $4}'");
    const match = result.stdout.match(/(\d+)G/);
    return match ? parseInt(match[1]!, 10) : 0;
  }

  private async getRamInfo(target: SshTarget): Promise<number> {
    const result = await this.ssh.exec(target, "free -m | awk '/^Mem:/{print $7}'");
    return parseInt(result.stdout.trim(), 10) || 0;
  }

  private async getOpenPorts(target: SshTarget): Promise<{ open: number[]; conflicts: number[] }> {
    const result = await this.ssh.exec(
      target,
      "ss -tlnp 2>/dev/null | awk 'NR>1 {print $4}' | grep -oP '\\d+$' | sort -un"
    );
    const open = result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((p) => parseInt(p, 10))
      .filter((p) => !isNaN(p));

    const conflicts = REQUIRED_PORTS.filter((p) => open.includes(p));

    return { open, conflicts };
  }
}
