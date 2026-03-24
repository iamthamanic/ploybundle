import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SshTarget } from "@ploybundle/shared";
import { SshError } from "@ploybundle/shared";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class SshService {
  private buildArgs(target: SshTarget): string[] {
    const args = [
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=10",
      "-o", "BatchMode=yes",
      "-p", String(target.port),
    ];

    if (target.privateKeyPath) {
      args.push("-i", target.privateKeyPath);
    }

    args.push(`${target.user}@${target.host}`);
    return args;
  }

  async exec(target: SshTarget, command: string): Promise<CommandResult> {
    const args = [...this.buildArgs(target), command];

    try {
      const { stdout, stderr } = await execFileAsync("ssh", args, {
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
      throw new SshError(
        `SSH command failed: ${err instanceof Error ? err.message : String(err)}`,
        `Check SSH connectivity to ${target.user}@${target.host}:${target.port}`
      );
    }
  }

  async testConnection(target: SshTarget): Promise<boolean> {
    try {
      const result = await this.exec(target, "echo ok");
      return result.exitCode === 0 && result.stdout.trim() === "ok";
    } catch {
      return false;
    }
  }

  async uploadFile(target: SshTarget, localPath: string, remotePath: string): Promise<void> {
    const args = [
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "ConnectTimeout=10",
      "-P", String(target.port),
    ];

    if (target.privateKeyPath) {
      args.push("-i", target.privateKeyPath);
    }

    args.push(localPath, `${target.user}@${target.host}:${remotePath}`);

    try {
      await execFileAsync("scp", args, { timeout: 120_000 });
    } catch (err) {
      throw new SshError(
        `Failed to upload ${localPath} to ${remotePath}: ${err instanceof Error ? err.message : String(err)}`,
        `Check SSH connectivity and remote path permissions.`
      );
    }
  }

  async uploadContent(target: SshTarget, content: string, remotePath: string): Promise<void> {
    // Use heredoc via ssh to write content directly
    const escapedContent = content.replace(/'/g, "'\\''");
    const command = `mkdir -p $(dirname "${remotePath}") && cat > "${remotePath}" << 'PLOYBUNDLE_EOF'\n${escapedContent}\nPLOYBUNDLE_EOF`;
    const result = await this.exec(target, command);

    if (result.exitCode !== 0) {
      throw new SshError(
        `Failed to write content to ${remotePath}: ${result.stderr}`,
        `Check remote path permissions.`
      );
    }
  }

  async readFile(target: SshTarget, remotePath: string): Promise<string> {
    const result = await this.exec(target, `cat "${remotePath}"`);
    if (result.exitCode !== 0) {
      throw new SshError(
        `Failed to read ${remotePath}: ${result.stderr}`,
        `Check if the file exists on the remote host.`
      );
    }
    return result.stdout;
  }

  async fileExists(target: SshTarget, remotePath: string): Promise<boolean> {
    const result = await this.exec(target, `test -f "${remotePath}" && echo exists`);
    return result.stdout.trim() === "exists";
  }
}
