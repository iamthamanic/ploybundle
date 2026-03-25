import { describe, it, expect } from "vitest";
import { getPreset, listPresets } from "../presets/index.js";

describe("presets", () => {
  describe("getPreset", () => {
    it("returns the learning-app preset", () => {
      const preset = getPreset("learning-app");
      expect(preset.name).toBe("learning-app");
      expect(preset.displayName).toBe("Learning App");
      expect(preset.services.nextjs).toBe(true);
      expect(preset.services.postgres).toBe(true);
    });

    it("returns the crud-saas preset", () => {
      const preset = getPreset("crud-saas");
      expect(preset.name).toBe("crud-saas");
      expect(preset.directusCollections.length).toBeGreaterThan(0);
    });

    it("returns the content-app preset", () => {
      const preset = getPreset("content-app");
      expect(preset.name).toBe("content-app");
      expect(preset.buckets).toContainEqual({ name: "media", public: true });
    });

    it("returns the workflow-app preset", () => {
      const preset = getPreset("workflow-app");
      expect(preset.name).toBe("workflow-app");
      expect(preset.windmillFlows.length).toBeGreaterThan(0);
    });

    it("throws for unknown preset", () => {
      expect(() => getPreset("nonexistent" as any)).toThrow("Unknown preset");
    });
  });

  describe("listPresets", () => {
    it("returns all presets", () => {
      const presets = listPresets();
      expect(presets).toHaveLength(4);
      const names = presets.map((p) => p.name);
      expect(names).toContain("learning-app");
      expect(names).toContain("crud-saas");
      expect(names).toContain("content-app");
      expect(names).toContain("workflow-app");
    });
  });

  describe("preset integrity", () => {
    for (const preset of listPresets()) {
      describe(preset.name, () => {
        it("has all required fields", () => {
          expect(preset.displayName).toBeTruthy();
          expect(preset.description).toBeTruthy();
          expect(preset.services).toBeTruthy();
          expect(preset.buckets).toBeTruthy();
          expect(preset.homarrBoard).toBeTruthy();
          expect(preset.homarrBoard.title).toBeTruthy();
          expect(preset.homarrBoard.theme).toBeTruthy();
          expect(preset.homarrBoard.theme.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
          expect(preset.homarrBoard.sections.length).toBeGreaterThan(0);
          expect(preset.homarrBoard.apps.length).toBeGreaterThan(0);
          expect(preset.homarrBoard.widgets.length).toBeGreaterThan(0);
        });

        it("has all core services enabled", () => {
          expect(preset.services.nextjs).toBe(true);
          expect(preset.services.postgres).toBe(true);
          expect(preset.services.homarr).toBe(true);
        });

        it("has valid bucket names", () => {
          for (const bucket of preset.buckets) {
            expect(bucket.name).toMatch(/^[a-z0-9-]+$/);
          }
        });

        it("has valid windmill flow types", () => {
          for (const flow of preset.windmillFlows) {
            expect(["script", "flow", "cron"]).toContain(flow.type);
            expect(flow.content).toBeTruthy();
          }
        });
      });
    }
  });
});
