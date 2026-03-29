import { vi, beforeEach } from "vitest";
import { SshError } from "@ploybundle/shared";
import type { SshTarget } from "@ploybundle/shared";

// Mock callback-style execFile before importing SshService
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { SshService } from "../ssh/ssh-service.js";

function getExecFileCallback(args: unknown[]): Function | undefined {
  const last = args[args.length - 1];
  return typeof last === "function" ? (last as Function) : undefined;
}

function mockExecFileResolve(stdout: string, stderr = "") {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
    const cb = getExecFileCallback(args);
    if (cb) cb(null, stdout, stderr);
  });
}

function mockExecFileReject(error: { code?: number | string; stdout?: string; stderr?: string; message?: string }) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
    const cb = getExecFileCallback(args);
    if (!cb) return;
    const err = Object.assign(new Error(error.message ?? "command failed"), {
      ...(error.code !== undefined ? { code: error.code } : {}),
      ...(error.stdout !== undefined ? { stdout: error.stdout } : {}),
      ...(error.stderr !== undefined ? { stderr: error.stderr } : {}),
    });
    cb(err);
  });
}

const target: SshTarget = {
  host: "10.0.0.1",
  port: 22,
  user: "root",
  privateKeyPath: "/home/user/.ssh/id_ed25519",
};

const targetNoKey: SshTarget = {
  host: "10.0.0.2",
  port: 2222,
  user: "deploy",
};

describe("SshService", () => {
  let ssh: SshService;

  beforeEach(() => {
    vi.clearAllMocks();
    ssh = new SshService();
  });

  // ── exec ────────────────────────────────────────────────
  describe("exec", () => {
    it("returns stdout/stderr with exitCode 0 on success", async () => {
      mockExecFileResolve("hello world\n", "");

      const result = await ssh.exec(target, "echo hello world");

      expect(result).toEqual({
        stdout: "hello world\n",
        stderr: "",
        exitCode: 0,
      });
    });

    it("returns non-zero exitCode when the command fails with a numeric code", async () => {
      mockExecFileReject({ code: 2, stdout: "", stderr: "not found" });

      const result = await ssh.exec(target, "ls /nonexistent");

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toBe("not found");
    });

    it("throws SshError when the error has a non-numeric code (connection error)", async () => {
      mockExecFileReject({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" });

      await expect(ssh.exec(target, "echo test")).rejects.toThrow(SshError);
    });

    it("throws SshError when the error has no code property", async () => {
      (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        const cb = getExecFileCallback(args);
        if (cb) cb(new Error("timeout"));
      });

      await expect(ssh.exec(target, "echo test")).rejects.toThrow(SshError);
    });

    it("builds correct SSH args including port, key path, and StrictHostKeyChecking", async () => {
      mockExecFileResolve("ok");

      await ssh.exec(target, "whoami");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [cmd, args] = call as [string, string[]];

      expect(cmd).toBe("ssh");
      expect(args).toContain("-p");
      expect(args[args.indexOf("-p") + 1]).toBe("22");
      expect(args).toContain("-i");
      expect(args[args.indexOf("-i") + 1]).toBe("/home/user/.ssh/id_ed25519");
      expect(args).toContain("StrictHostKeyChecking=accept-new");
      expect(args).toContain("root@10.0.0.1");
      expect(args[args.length - 1]).toBe("whoami");
    });

    it("respects timeout overrides for long-running commands", async () => {
      mockExecFileResolve("ok");

      await ssh.exec(target, "sleep 1", { timeoutMs: 1234, maxBuffer: 2048 });

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, , options] = call as [string, string[], { timeout: number; maxBuffer: number }];

      expect(options.timeout).toBe(1234);
      expect(options.maxBuffer).toBe(2048);
    });

    it("does not include -i flag when privateKeyPath is absent", async () => {
      mockExecFileResolve("ok");

      await ssh.exec(targetNoKey, "whoami");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, args] = call as [string, string[]];

      expect(args).not.toContain("-i");
      expect(args).toContain("-p");
      expect(args[args.indexOf("-p") + 1]).toBe("2222");
      expect(args).toContain("deploy@10.0.0.2");
    });
  });

  // ── testConnection ──────────────────────────────────────
  describe("testConnection", () => {
    it("returns true when exec succeeds and stdout is 'ok'", async () => {
      mockExecFileResolve("ok\n", "");

      const result = await ssh.testConnection(target);

      expect(result).toBe(true);
    });

    it("returns false when exec succeeds but stdout is not 'ok'", async () => {
      mockExecFileResolve("something else\n", "");

      const result = await ssh.testConnection(target);

      expect(result).toBe(false);
    });

    it("returns false when exec rejects (connection error)", async () => {
      mockExecFileReject({ code: "ECONNREFUSED", message: "connect refused" });

      const result = await ssh.testConnection(target);

      expect(result).toBe(false);
    });
  });

  // ── uploadFile ──────────────────────────────────────────
  describe("uploadFile", () => {
    it("calls scp with correct args", async () => {
      mockExecFileResolve("");

      await ssh.uploadFile(target, "/tmp/local.tar.gz", "/opt/remote.tar.gz");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [cmd, args] = call as [string, string[]];

      expect(cmd).toBe("scp");
      expect(args).toContain("-P");
      expect(args[args.indexOf("-P") + 1]).toBe("22");
      expect(args).toContain("-i");
      expect(args[args.indexOf("-i") + 1]).toBe("/home/user/.ssh/id_ed25519");
      expect(args).toContain("/tmp/local.tar.gz");
      expect(args).toContain("root@10.0.0.1:/opt/remote.tar.gz");
    });

    it("does not include -i when privateKeyPath is absent", async () => {
      mockExecFileResolve("");

      await ssh.uploadFile(targetNoKey, "/tmp/file", "/opt/file");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, args] = call as [string, string[]];

      expect(args).not.toContain("-i");
      expect(args).toContain("-P");
      expect(args[args.indexOf("-P") + 1]).toBe("2222");
    });

    it("uses upload timeout overrides when provided", async () => {
      mockExecFileResolve("");

      await ssh.uploadFile(target, "/tmp/local.tar.gz", "/opt/remote.tar.gz", {
        timeoutMs: 4321,
        maxBuffer: 4096,
      });

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, , options] = call as [string, string[], { timeout: number; maxBuffer: number }];

      expect(options.timeout).toBe(4321);
      expect(options.maxBuffer).toBe(4096);
    });

    it("throws SshError on scp failure", async () => {
      mockExecFileReject({ code: "SCP_FAIL", message: "scp failed" });

      await expect(
        ssh.uploadFile(target, "/tmp/local.tar.gz", "/opt/remote.tar.gz"),
      ).rejects.toThrow(SshError);
    });
  });

  // ── uploadContent ───────────────────────────────────────
  describe("uploadContent", () => {
    it("uses heredoc approach to write content", async () => {
      mockExecFileResolve("");

      await ssh.uploadContent(target, "line1\nline2", "/etc/config.yml");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, args] = call as [string, string[]];
      const command = args[args.length - 1] as string;

      expect(command).toContain("PLOYBUNDLE_EOF");
      expect(command).toContain('cat > "/etc/config.yml"');
      expect(command).toContain("line1\nline2");
    });

    it("escapes single quotes in content", async () => {
      mockExecFileResolve("");

      await ssh.uploadContent(target, "it's a test", "/etc/config.yml");

      const call = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      const [, args] = call as [string, string[]];
      const command = args[args.length - 1] as string;

      // Single quotes are escaped as: ' -> '\''
      expect(command).toContain("it'\\''s a test");
    });

    it("throws SshError when remote write fails", async () => {
      mockExecFileReject({ code: 1, stdout: "", stderr: "permission denied" });

      await expect(
        ssh.uploadContent(target, "data", "/root/secret.txt"),
      ).rejects.toThrow(SshError);
    });
  });

  // ── readFile ────────────────────────────────────────────
  describe("readFile", () => {
    it("returns stdout on success", async () => {
      mockExecFileResolve("file content here\n");

      const content = await ssh.readFile(target, "/etc/hostname");

      expect(content).toBe("file content here\n");
    });

    it("throws SshError when cat fails (non-zero exit)", async () => {
      mockExecFileReject({ code: 1, stdout: "", stderr: "No such file or directory" });

      await expect(ssh.readFile(target, "/nonexistent")).rejects.toThrow(SshError);
    });
  });

  // ── fileExists ──────────────────────────────────────────
  describe("fileExists", () => {
    it("returns true when file exists", async () => {
      mockExecFileResolve("exists\n");

      const result = await ssh.fileExists(target, "/etc/hostname");

      expect(result).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      // test -f returns exit code 1 but our exec catches it as a numeric code
      mockExecFileReject({ code: 1, stdout: "", stderr: "" });

      const result = await ssh.fileExists(target, "/nonexistent");

      expect(result).toBe(false);
    });
  });
});
