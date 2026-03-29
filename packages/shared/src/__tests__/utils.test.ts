import { describe, it, expect } from "vitest";
import {
  generateSecret,
  generatePassword,
  buildDomainConfig,
  buildLocalDomainConfig,
  buildProjectUrls,
  listStackServices,
  slugify,
  parseSshTarget,
  formatDuration,
  maskSecret,
  envLine,
  buildEnvFile,
} from "../utils.js";

describe("generateSecret", () => {
  it("generates a hex string of the specified length", () => {
    const secret = generateSecret(32);
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[a-f0-9]+$/);
  });

  it("generates different values each time", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).not.toBe(b);
  });
});

describe("generatePassword", () => {
  it("generates a password of the specified length", () => {
    const pw = generatePassword(16);
    expect(pw).toHaveLength(16);
  });

  it("contains only allowed characters", () => {
    const pw = generatePassword(100);
    expect(pw).toMatch(/^[a-zA-Z0-9!@#$%&*]+$/);
  });
});

describe("buildDomainConfig", () => {
  it("builds a complete domain config from a root domain", () => {
    const config = buildDomainConfig("example.com");
    expect(config.root).toBe("example.com");
    expect(config.app).toBe("example.com");
    expect(config.admin).toBe("admin.example.com");
    expect(config.storage).toBe("storage.example.com");
    expect(config.functions).toBe("fn.example.com");
    expect(config.deploy).toBe("deploy.example.com");
    expect(config.dashboard).toBe("home.example.com");
  });

  it("allows overrides", () => {
    const config = buildDomainConfig("example.com", { app: "app.example.com" });
    expect(config.app).toBe("app.example.com");
    expect(config.admin).toBe("admin.example.com");
  });
});

describe("buildLocalDomainConfig", () => {
  it("defaults to numeric loopback hosts for docker-friendly browser URLs", () => {
    const d = buildLocalDomainConfig();
    expect(d.root).toBe("127.0.0.1");
    expect(d.app).toBe("127.0.0.1:3001");
    expect(d.admin).toBe("127.0.0.1:8055");
  });
});

describe("buildProjectUrls", () => {
  it("builds HTTPS URLs from domain config", () => {
    const domain = buildDomainConfig("test.io");
    const urls = buildProjectUrls(domain);
    expect(urls.app).toBe("https://test.io");
    expect(urls.admin).toBe("https://admin.test.io");
    expect(urls.storage).toBe("https://storage.test.io");
    expect(urls.storageBrowser).toBe("https://storage.test.io");
    expect(urls.functions).toBe("https://fn.test.io");
  });

  it("builds HTTP URLs when scheme is http (e.g. local docker ports)", () => {
    const urls = buildProjectUrls(
      buildDomainConfig("localhost", {
        scheme: "http",
        app: "localhost:3000",
        admin: "localhost:8055",
        storage: "localhost:8333",
        storageBrowser: "localhost:9333",
        functions: "localhost:8000",
        deploy: "localhost",
        dashboard: "localhost:7575",
      })
    );
    expect(urls.app).toBe("http://localhost:3000");
    expect(urls.admin).toBe("http://localhost:8055");
    expect(urls.storage).toBe("http://localhost:8333");
    expect(urls.storageBrowser).toBe("http://localhost:9333");
    expect(urls.functions).toBe("http://localhost:8000");
  });

  it("adds databaseBrowser URL when domain.databaseBrowser is set", () => {
    const urls = buildProjectUrls(
      buildDomainConfig("localhost", {
        scheme: "http",
        databaseBrowser: "localhost:8088",
      })
    );
    expect(urls.databaseBrowser).toBe("http://localhost:8088");
  });
});

describe("listStackServices", () => {
  it("includes dynamic custom api and worker services from AppSpec", () => {
    const services = listStackServices({
      projectName: "visudev",
      mode: "server",
      target: "lite",
      preset: "workflow-app",
      frontend: "nextjs",
      domain: buildDomainConfig("visudev.example.com"),
      ssh: { host: "1.2.3.4", port: 22, user: "root" },
      projectRoot: "/tmp/visudev",
      email: "admin@visudev.example.com",
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
      directus: { adminEmail: "admin@visudev.example.com" },
      windmill: { workspace: "visudev", exampleFlows: true },
      resourceProfile: "small",
      providerHint: "generic",
      appSpec: {
        version: 2,
        app: {
          id: "visudev",
          name: "VisuDEV",
          archetype: "tool",
          frontend: "nextjs",
        },
        modes: {
          local: { enabled: true },
          server: {
            enabled: true,
            target: "lite",
            ssh: { host: "1.2.3.4", port: 22, user: "root" },
            domain: { root: "visudev.example.com" },
          },
        },
        modules: {
          database: { enabled: true, provider: "postgres" },
          customApis: [{ id: "core", enabled: true, runtime: "node", path: "services/api" }],
          workers: [{ id: "preview-runner", enabled: true, runtime: "node", kind: "long-running", path: "services/preview-runner" }],
        },
      },
    });

    expect(services).toContain("custom-api-core");
    expect(services).toContain("worker-preview-runner");
  });
});

describe("slugify", () => {
  it("converts strings to slugs", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("My App 123")).toBe("my-app-123");
    expect(slugify("  Test  ")).toBe("test");
    expect(slugify("UPPERCASE")).toBe("uppercase");
  });
});

describe("parseSshTarget", () => {
  it("parses user@host", () => {
    const result = parseSshTarget("root@1.2.3.4");
    expect(result.user).toBe("root");
    expect(result.host).toBe("1.2.3.4");
    expect(result.port).toBe(22);
  });

  it("parses user@host:port", () => {
    const result = parseSshTarget("admin@server.com:2222");
    expect(result.user).toBe("admin");
    expect(result.host).toBe("server.com");
    expect(result.port).toBe(2222);
  });

  it("throws on invalid format", () => {
    expect(() => parseSshTarget("noatsign")).toThrow();
  });
});

describe("formatDuration", () => {
  it("formats milliseconds", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatDuration(3500)).toBe("3.5s");
  });

  it("formats minutes", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

describe("maskSecret", () => {
  it("masks secrets with visible prefix", () => {
    expect(maskSecret("abcdefghij", 4)).toBe("abcd****");
  });

  it("masks short secrets entirely", () => {
    expect(maskSecret("abc", 4)).toBe("****");
  });
});

describe("envLine", () => {
  it("formats simple key=value", () => {
    expect(envLine("KEY", "value")).toBe("KEY=value");
  });

  it("quotes values with spaces", () => {
    expect(envLine("KEY", "hello world")).toBe('KEY="hello world"');
  });

  it("escapes dollars for Docker Compose .env interpolation", () => {
    expect(envLine("REDIS_PASSWORD", "pre$post")).toBe("REDIS_PASSWORD=pre$$post"); // two $ in file for Compose
  });
});

describe("buildEnvFile", () => {
  it("builds a multi-line env file", () => {
    const result = buildEnvFile({ A: "1", B: "2" });
    expect(result).toBe("A=1\nB=2\n");
  });
});
