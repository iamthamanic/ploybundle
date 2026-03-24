import { describe, it, expect } from "vitest";
import { createCli } from "../index.js";

describe("CLI", () => {
  it("creates a CLI program with all commands", () => {
    const program = createCli();
    expect(program.name()).toBe("ploybundle");

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("init");
    expect(commandNames).toContain("deploy");
    expect(commandNames).toContain("status");
    expect(commandNames).toContain("logs");
    expect(commandNames).toContain("update");
    expect(commandNames).toContain("destroy");
    expect(commandNames).toContain("doctor");
    expect(commandNames).toContain("open");
  });

  it("has version set", () => {
    const program = createCli();
    expect(program.version()).toBeTruthy();
  });

  it("init command has required options", () => {
    const program = createCli();
    const initCmd = program.commands.find((c) => c.name() === "init");
    expect(initCmd).toBeTruthy();

    const optionNames = initCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--host");
    expect(optionNames).toContain("--preset");
    expect(optionNames).toContain("--domain");
    expect(optionNames).toContain("--target");
  });

  it("destroy command has --yes flag", () => {
    const program = createCli();
    const destroyCmd = program.commands.find((c) => c.name() === "destroy");
    expect(destroyCmd).toBeTruthy();

    const optionNames = destroyCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--yes");
  });

  it("logs command has --service filter", () => {
    const program = createCli();
    const logsCmd = program.commands.find((c) => c.name() === "logs");
    expect(logsCmd).toBeTruthy();

    const optionNames = logsCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--service");
  });
});
