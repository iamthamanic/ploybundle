import { describe, it, expect } from "vitest";
import { createAdapter } from "../adapter-factory.js";

describe("createAdapter", () => {
  it("creates a CapRover adapter for lite target", () => {
    const adapter = createAdapter({ mode: "server", target: "lite" });
    expect(adapter.name).toBe("CapRover");
    expect(adapter.target).toBe("lite");
  });

  it("creates a Coolify adapter for full target", () => {
    const adapter = createAdapter({ mode: "server", target: "full" });
    expect(adapter.name).toBe("Coolify");
    expect(adapter.target).toBe("full");
  });

  it("creates a local adapter for local mode", () => {
    const adapter = createAdapter({ mode: "local" });
    expect(adapter.name).toBe("Local Docker");
    expect(adapter.target).toBeUndefined();
  });

  it("throws for unknown target", () => {
    expect(() => createAdapter({ mode: "server", target: "unknown" as any })).toThrow();
  });
});
