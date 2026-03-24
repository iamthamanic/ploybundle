import { describe, it, expect } from "vitest";
import { createAdapter } from "../adapter-factory.js";

describe("createAdapter", () => {
  it("creates a CapRover adapter for lite target", () => {
    const adapter = createAdapter("lite");
    expect(adapter.name).toBe("CapRover");
    expect(adapter.target).toBe("lite");
  });

  it("creates a Coolify adapter for full target", () => {
    const adapter = createAdapter("full");
    expect(adapter.name).toBe("Coolify");
    expect(adapter.target).toBe("full");
  });

  it("throws for unknown target", () => {
    expect(() => createAdapter("unknown" as any)).toThrow();
  });
});
