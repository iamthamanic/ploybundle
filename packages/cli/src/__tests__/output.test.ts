import { describe, it, expect, vi } from "vitest";
import { CliOutput } from "../output.js";
import type { CliContext } from "@ploybundle/shared";

describe("CliOutput", () => {
  it("suppresses output in quiet mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const context: CliContext = { outputMode: "quiet", noColor: true, verbose: false };
    const output = new CliOutput(context);

    output.info("test");
    output.success("test");
    output.warn("test");
    output.log("test");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("outputs JSON in json mode", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const context: CliContext = { outputMode: "json", noColor: true, verbose: false };
    const output = new CliOutput(context);

    output.json({ test: true });

    expect(spy).toHaveBeenCalledWith(JSON.stringify({ test: true }, null, 2));
    spy.mockRestore();
  });

  it("formats phase results", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const context: CliContext = { outputMode: "human", noColor: true, verbose: false };
    const output = new CliOutput(context);

    output.printPhaseResult({
      phase: "validate",
      success: true,
      message: "Validation completed",
      duration: 150,
    });

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
