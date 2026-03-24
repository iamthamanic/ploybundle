import { describe, it, expect } from "vitest";
import {
  generateSecret,
  generatePassword,
  buildDomainConfig,
  buildProjectUrls,
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

describe("buildProjectUrls", () => {
  it("builds HTTPS URLs from domain config", () => {
    const domain = buildDomainConfig("test.io");
    const urls = buildProjectUrls(domain);
    expect(urls.app).toBe("https://test.io");
    expect(urls.admin).toBe("https://admin.test.io");
    expect(urls.storage).toBe("https://storage.test.io");
    expect(urls.functions).toBe("https://fn.test.io");
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
});

describe("buildEnvFile", () => {
  it("builds a multi-line env file", () => {
    const result = buildEnvFile({ A: "1", B: "2" });
    expect(result).toBe("A=1\nB=2\n");
  });
});
