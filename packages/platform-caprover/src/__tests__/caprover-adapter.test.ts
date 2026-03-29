import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ProjectConfig,
  StackArtifacts,
  SshTarget,
} from "@ploybundle/shared";
import { ALL_SERVICES, PlatformError, isStackServiceEnabled } from "@ploybundle/shared";
import { CaproverAdapter } from "../caprover-adapter.js";

// ---------------------------------------------------------------------------
// Mock SshService
// ---------------------------------------------------------------------------
function createMockSsh() {
  return {
    exec: vi.fn(),
    uploadContent: vi.fn(),
  };
}

type MockSsh = ReturnType<typeof createMockSsh>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const testSsh: SshTarget = { host: "1.2.3.4", port: 22, user: "root" };

const testConfig: ProjectConfig = {
  projectName: "test-project",
  mode: "server",
  target: "lite",
  preset: "learning-app",
  frontend: "nextjs",
  domain: { root: "example.com" },
  ssh: { host: "1.2.3.4", port: 22, user: "root" },
  projectRoot: "/tmp/test-project",
  email: "test@example.com",
  services: {
    nextjs: true,
    postgres: true,
    redis: true,
    directus: true,
    seaweedfs: true,
    windmill: true,
    hub: true,
    adminer: false,
  },
  buckets: [],
  directus: { adminEmail: "admin@example.com" },
  windmill: { workspace: "main", exampleFlows: false },
  resourceProfile: "small",
  providerHint: "generic",
};

const testArtifacts: StackArtifacts = {
  composeFile: "version: '3'",
  envFiles: { ".env": "KEY=value" },
  configs: { "config.yaml": "key: value" },
  hubConfig: "{\"board\":true}",
  metadata: {},
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("CaproverAdapter", () => {
  let mockSsh: MockSsh;
  let adapter: CaproverAdapter;

  beforeEach(() => {
    mockSsh = createMockSsh();
    adapter = new CaproverAdapter(mockSsh as any);
  });

  // -------------------------------------------------------------------------
  // validateHost
  // -------------------------------------------------------------------------
  describe("validateHost", () => {
    it("parses os-release output and returns HostDiagnosis", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: [
          'NAME="Ubuntu"',
          'VERSION_ID="24.04"',
          "MemTotal:        4096 MB",
          "Filesystem      1G-blocks  Used Available Use% Mounted on",
          "/dev/sda1              40    20        20  50% /",
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      });

      const diagnosis = await adapter.validateHost(testSsh);

      expect(diagnosis.os).toBe("Ubuntu");
      expect(diagnosis.osVersion).toBe("24.04");
      expect(diagnosis.isUbuntu2404).toBe(true);
      expect(diagnosis.hasRoot).toBe(true);
      expect(diagnosis.dockerInstalled).toBe(true);
      expect(diagnosis.availableDiskGb).toBe(20);
      expect(diagnosis.availableRamMb).toBe(4096);
      expect(mockSsh.exec).toHaveBeenCalledWith(
        testSsh,
        "cat /etc/os-release && free -m && df -BG /",
      );
    });
  });

  // -------------------------------------------------------------------------
  // installPlatform
  // -------------------------------------------------------------------------
  describe("installPlatform", () => {
    it("skips if captain already running and returns alreadyInstalled=true", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "captain",
        stderr: "",
        exitCode: 0,
      });

      const result = await adapter.installPlatform(testSsh, testConfig);

      expect(result.success).toBe(true);
      expect(result.phase).toBe("install-platform");
      expect(result.details?.alreadyInstalled).toBe(true);
      expect(result.message).toContain("already installed");
      // Should only call once (the check), not the install command
      expect(mockSsh.exec).toHaveBeenCalledTimes(1);
    });

    it("installs CapRover when not present", async () => {
      // First call: captain not running
      mockSsh.exec
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        // Second call: install script succeeds
        .mockResolvedValueOnce({ stdout: "ok", stderr: "", exitCode: 0 })
        // Third+: waitForCaprover polling returns healthy
        .mockResolvedValueOnce({ stdout: "captain", stderr: "", exitCode: 0 })
        // configureCaprover
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 });

      const result = await adapter.installPlatform(testSsh, testConfig);

      expect(result.success).toBe(true);
      expect(result.details?.alreadyInstalled).toBe(false);
      expect(result.message).toContain("installed successfully");
    });

    it("throws PlatformError on install failure", async () => {
      // Check: not running
      mockSsh.exec
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        // Install: failure
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "port 80 in use",
          exitCode: 1,
        });

      const installPromise = adapter.installPlatform(testSsh, testConfig);
      await expect(installPromise).rejects.toThrow(PlatformError);
      await expect(installPromise).rejects.toThrow(/installation failed/i);
    });
  });

  // -------------------------------------------------------------------------
  // platformHealth
  // -------------------------------------------------------------------------
  describe("platformHealth", () => {
    it("returns healthy=true when captain is up", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "Up 2 hours",
        stderr: "",
        exitCode: 0,
      });

      const health = await adapter.platformHealth(testSsh);

      expect(health.healthy).toBe(true);
      expect(health.message).toBe("CapRover is running");
    });

    it("returns healthy=false when captain is down", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const health = await adapter.platformHealth(testSsh);

      expect(health.healthy).toBe(false);
      expect(health.message).toBe("CapRover is not running");
    });
  });

  // -------------------------------------------------------------------------
  // deployStack
  // -------------------------------------------------------------------------
  describe("deployStack", () => {
    it("uploads compose, env, configs, runs docker compose up", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "running\nrunning",
        stderr: "",
        exitCode: 0,
      });
      mockSsh.uploadContent.mockResolvedValue(undefined);

      const result = await adapter.deployStack(
        testSsh,
        testConfig,
        testArtifacts,
      );

      expect(result.success).toBe(true);
      expect(result.phase).toBe("deploy");

      // Verify uploads happened
      expect(mockSsh.uploadContent).toHaveBeenCalledWith(
        testSsh,
        testArtifacts.composeFile,
        "/opt/ploybundle/docker-compose.yml",
      );
      expect(mockSsh.uploadContent).toHaveBeenCalledWith(
        testSsh,
        "KEY=value",
        "/opt/ploybundle/.env",
      );
      expect(mockSsh.uploadContent).toHaveBeenCalledWith(
        testSsh,
        "key: value",
        "/opt/ploybundle/config.yaml",
      );
      expect(mockSsh.uploadContent).toHaveBeenCalledWith(
        testSsh,
        "{\"board\":true}",
        "/opt/ploybundle/hub/config/board.json",
      );

      // Verify docker compose up was called
      expect(mockSsh.exec).toHaveBeenCalledWith(
        testSsh,
        expect.stringContaining("docker compose -p test-project up -d"),
      );
    });

    it("throws PlatformError on deploy failure", async () => {
      mockSsh.exec
        // mkdir -p
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        // docker compose up fails
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "service failed",
          exitCode: 1,
        });
      mockSsh.uploadContent.mockResolvedValue(undefined);

      const deployPromise = adapter.deployStack(testSsh, testConfig, testArtifacts);
      await expect(deployPromise).rejects.toThrow(PlatformError);
      await expect(deployPromise).rejects.toThrow(/deployment failed/i);
    });
  });

  // -------------------------------------------------------------------------
  // destroyStack
  // -------------------------------------------------------------------------
  describe("destroyStack", () => {
    it("runs docker compose down", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "done",
        stderr: "",
        exitCode: 0,
      });

      const result = await adapter.destroyStack(testSsh, testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Stack destroyed");
      expect(mockSsh.exec).toHaveBeenCalledWith(
        testSsh,
        expect.stringContaining(
          "docker compose -p test-project down -v --remove-orphans",
        ),
      );
    });
  });

  // -------------------------------------------------------------------------
  // fetchLogs
  // -------------------------------------------------------------------------
  describe("fetchLogs", () => {
    it("runs docker compose logs without service filter", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "log line 1\nlog line 2",
        stderr: "",
        exitCode: 0,
      });

      const logs = await adapter.fetchLogs(testSsh, testConfig);

      expect(logs).toBe("log line 1\nlog line 2");
      expect(mockSsh.exec).toHaveBeenCalledWith(
        testSsh,
        expect.stringContaining("logs --tail=200 2>&1"),
      );
    });

    it("runs docker compose logs with service filter", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "nextjs log",
        stderr: "",
        exitCode: 0,
      });

      const logs = await adapter.fetchLogs(testSsh, testConfig, "nextjs");

      expect(logs).toBe("nextjs log");
      expect(mockSsh.exec).toHaveBeenCalledWith(
        testSsh,
        expect.stringContaining("logs --tail=200 nextjs 2>&1"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // openUrls
  // -------------------------------------------------------------------------
  describe("openUrls", () => {
    it("returns correct URLs from domain config", () => {
      const urls = adapter.openUrls(testConfig);

      expect(urls.app).toBe("https://example.com");
      expect(urls.admin).toBe("https://admin.example.com");
      expect(urls.storage).toBe("https://storage.example.com");
      expect(urls.storageBrowser).toBe("https://storage.example.com");
      expect(urls.functions).toBe("https://fn.example.com");
      expect(urls.deploy).toBe("https://deploy.example.com");
      expect(urls.dashboard).toBe("https://home.example.com");
    });
  });

  // -------------------------------------------------------------------------
  // setEnvironmentVariables
  // -------------------------------------------------------------------------
  describe("setEnvironmentVariables", () => {
    it("uploads .env file with formatted content", async () => {
      mockSsh.uploadContent.mockResolvedValue(undefined);

      await adapter.setEnvironmentVariables(testSsh, testConfig, {
        DB_HOST: "localhost",
        DB_PORT: "5432",
      });

      expect(mockSsh.uploadContent).toHaveBeenCalledWith(
        testSsh,
        "DB_HOST=localhost\nDB_PORT=5432\n",
        "/opt/ploybundle/.env",
      );
    });
  });

  // -------------------------------------------------------------------------
  // status
  // -------------------------------------------------------------------------
  describe("status", () => {
    it("parses docker compose ps JSON output correctly", async () => {
      const psOutput = [
        '{"Name":"test-project-nextjs-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-postgres-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-redis-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-directus-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-seaweedfs-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-windmill-1","State":"running","Status":"Up 5 minutes"}',
        '{"Name":"test-project-hub-1","State":"running","Status":"Up 5 minutes"}',
      ].join("\n");

      mockSsh.exec.mockResolvedValue({
        stdout: psOutput,
        stderr: "",
        exitCode: 0,
      });

      const status = await adapter.status(testSsh, testConfig);

      expect(status.projectName).toBe("test-project");
      expect(status.target).toBe("lite");
      expect(status.preset).toBe("learning-app");
      expect(status.services).toHaveLength(ALL_SERVICES.length);
      expect(status.services.every((s) => s.healthy)).toBe(true);
      expect(status.urls.app).toBe("https://example.com");
      expect(status.configSummary).toEqual({
        target: "lite",
        preset: "learning-app",
        domain: "example.com",
        resourceProfile: "small",
      });
    });

    it("reports services as unhealthy when not found in output", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: '{"Name":"test-project-nextjs-1","State":"running","Status":"Up"}',
        stderr: "",
        exitCode: 0,
      });

      const status = await adapter.status(testSsh, testConfig);

      const nextjs = status.services.find((s) => s.service === "nextjs");
      expect(nextjs?.healthy).toBe(true);

      // postgres is enabled but not found -- should be unhealthy
      const postgres = status.services.find((s) => s.service === "postgres");
      expect(postgres?.healthy).toBe(false);
      expect(postgres?.message).toBe("Not found");
    });

    it("handles unparseable output gracefully", async () => {
      mockSsh.exec.mockResolvedValue({
        stdout: "not json at all",
        stderr: "",
        exitCode: 0,
      });

      const status = await adapter.status(testSsh, testConfig);

      expect(status.services).toHaveLength(ALL_SERVICES.length);
      const enabled = status.services.filter((s) => isStackServiceEnabled(testConfig, s.service));
      expect(enabled.every((s) => !s.healthy)).toBe(true);
      expect(status.services.find((s) => s.service === "nextjs")?.message).toBe("Unable to determine status");
    });
  });

  // -------------------------------------------------------------------------
  // Adapter metadata
  // -------------------------------------------------------------------------
  describe("metadata", () => {
    it("has the correct name and target", () => {
      expect(adapter.name).toBe("CapRover");
      expect(adapter.target).toBe("lite");
    });
  });
});
