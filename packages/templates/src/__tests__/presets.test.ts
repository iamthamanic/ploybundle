import { describe, it, expect } from "vitest";
import { getPreset, listPresets, PLATFORM_HUB_BOARD } from "../presets/index.js";

describe("PLATFORM_HUB_BOARD", () => {
  it("uses platform branding and valid section references", () => {
    expect(PLATFORM_HUB_BOARD.title).toBe("Ploybundle");
    expect(PLATFORM_HUB_BOARD.sections.length).toBeGreaterThan(0);
    const titles = new Set(PLATFORM_HUB_BOARD.sections.map((s) => s.title));
    for (const app of PLATFORM_HUB_BOARD.apps) {
      expect(titles.has(app.section)).toBe(true);
    }
    for (const w of PLATFORM_HUB_BOARD.widgets) {
      expect(titles.has(w.section)).toBe(true);
    }
  });
});

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
          expect(preset.hubBoard).toBeTruthy();
          expect(preset.hubBoard.title).toBeTruthy();
          expect(preset.hubBoard.theme).toBeTruthy();
          expect(preset.hubBoard.theme.primaryColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
          expect(preset.hubBoard.sections.length).toBeGreaterThan(0);
          expect(preset.hubBoard.apps.length).toBeGreaterThan(0);
          expect(preset.hubBoard.widgets.length).toBeGreaterThan(0);
        });

        it("hub sections have stable ids and apps reference section titles", () => {
          const titles = new Set(preset.hubBoard.sections.map((s) => s.title));
          const ids = preset.hubBoard.sections.map((s) => s.id);
          expect(new Set(ids).size).toBe(ids.length);
          for (const s of preset.hubBoard.sections) {
            expect(s.id).toMatch(/^[a-z0-9-]+$/);
            expect(s.id.length).toBeGreaterThan(0);
          }
          for (const app of preset.hubBoard.apps) {
            expect(titles.has(app.section)).toBe(true);
          }
          for (const w of preset.hubBoard.widgets) {
            expect(titles.has(w.section)).toBe(true);
          }
        });

        it("has all core services enabled", () => {
          expect(preset.services.nextjs).toBe(true);
          expect(preset.services.postgres).toBe(true);
          expect(preset.services.hub).toBe(true);
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
