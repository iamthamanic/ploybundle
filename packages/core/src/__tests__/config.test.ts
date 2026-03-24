import { describe, it, expect } from "vitest";
import { parseAndValidateConfig, buildConfigFromFlags } from "../config/parser.js";

describe("parseAndValidateConfig", () => {
  const validInput = {
    projectName: "testproject",
    target: "lite",
    preset: "learning-app",
    domain: { root: "test.example.com" },
    ssh: { host: "1.2.3.4", port: 22, user: "root" },
    email: "admin@test.example.com",
    directus: { adminEmail: "admin@test.example.com" },
  };

  it("parses a valid config", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.projectName).toBe("testproject");
    expect(config.target).toBe("lite");
    expect(config.preset).toBe("learning-app");
    expect(config.domain.root).toBe("test.example.com");
    expect(config.domain.admin).toBe("admin.test.example.com");
  });

  it("applies defaults for services", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.services.nextjs).toBe(true);
    expect(config.services.postgres).toBe(true);
    expect(config.services.homepage).toBe(true);
  });

  it("applies default resource profile", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.resourceProfile).toBe("small");
  });

  it("applies default buckets", () => {
    const config = parseAndValidateConfig(validInput);
    expect(config.buckets).toHaveLength(1);
    expect(config.buckets[0]!.name).toBe("assets");
  });

  it("rejects invalid project names", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "INVALID" })
    ).toThrow();
  });

  it("rejects invalid project names starting with numbers", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "123abc" })
    ).toThrow();
  });

  it("rejects unknown targets", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, target: "unknown" })
    ).toThrow();
  });

  it("rejects unknown presets", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, preset: "unknown-preset" })
    ).toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, email: "notanemail" })
    ).toThrow();
  });

  it("rejects missing project name", () => {
    expect(() =>
      parseAndValidateConfig({ ...validInput, projectName: "" })
    ).toThrow();
  });
});

describe("buildConfigFromFlags", () => {
  it("builds a config from CLI flags", () => {
    const config = buildConfigFromFlags({
      projectName: "myproject",
      target: "lite",
      preset: "crud-saas",
      domain: "myproject.example.com",
      host: "root@1.2.3.4",
      email: "admin@myproject.example.com",
    });

    expect(config.projectName).toBe("myproject");
    expect(config.target).toBe("lite");
    expect(config.preset).toBe("crud-saas");
    expect(config.ssh.host).toBe("1.2.3.4");
    expect(config.ssh.user).toBe("root");
  });

  it("throws on missing required flags", () => {
    expect(() => buildConfigFromFlags({})).toThrow();
    expect(() => buildConfigFromFlags({ projectName: "test" })).toThrow();
  });

  it("defaults email from domain", () => {
    const config = buildConfigFromFlags({
      projectName: "myproject",
      preset: "crud-saas",
      domain: "myproject.example.com",
      host: "root@1.2.3.4",
    });
    expect(config.email).toBe("admin@myproject.example.com");
  });
});
