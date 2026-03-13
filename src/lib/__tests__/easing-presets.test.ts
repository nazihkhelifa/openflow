import { describe, it, expect } from "vitest";
import {
  DEFAULT_CUSTOM_BEZIER,
  PRESET_BEZIERS,
  EASING_PRESETS,
  getPresetBezier,
  getEasingBezier,
} from "../easing-presets";

describe("easing-presets", () => {
  describe("constants", () => {
    it("DEFAULT_CUSTOM_BEZIER is [0.42, 0, 0.58, 1]", () => {
      expect(DEFAULT_CUSTOM_BEZIER).toEqual([0.42, 0, 0.58, 1]);
    });

    it("EASING_PRESETS contains 5 preset names", () => {
      expect(EASING_PRESETS).toHaveLength(5);
    });

    it("all EASING_PRESETS are keys in PRESET_BEZIERS", () => {
      for (const name of EASING_PRESETS) {
        expect(PRESET_BEZIERS).toHaveProperty(name);
      }
    });

    it("all PRESET_BEZIERS entries are 4-element tuples of numbers", () => {
      for (const [, value] of Object.entries(PRESET_BEZIERS)) {
        expect(value).toHaveLength(4);
        for (const v of value) {
          expect(typeof v).toBe("number");
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe("getPresetBezier", () => {
    it("returns correct handles for known preset", () => {
      const result = getPresetBezier("easeInOutExpo");
      expect(result).toEqual([0.87, 0, 0.13, 1]);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for null input", () => {
      expect(getPresetBezier(null)).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for undefined input", () => {
      expect(getPresetBezier(undefined)).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for unknown preset name", () => {
      expect(getPresetBezier("unknownPreset")).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns a copy, not the original array", () => {
      const result1 = getPresetBezier("easeInOutCubic");
      const result2 = getPresetBezier("easeInOutCubic");
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });

    it("mutating result does not affect source", () => {
      const result = getPresetBezier("easeInOutSine");
      const original = [...PRESET_BEZIERS.easeInOutSine];
      result[0] = 999;
      expect(PRESET_BEZIERS.easeInOutSine[0]).toBe(original[0]);
    });
  });

  describe("getEasingBezier", () => {
    it("returns correct handles for standard easing", () => {
      const result = getEasingBezier("linear");
      expect(result).toEqual([0, 0, 1, 1]);
    });

    it("returns preset bezier when name is a preset", () => {
      const result = getEasingBezier("easeInExpoOutCubic");
      expect(result).toEqual([...PRESET_BEZIERS.easeInExpoOutCubic]);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for null input", () => {
      expect(getEasingBezier(null)).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for undefined input", () => {
      expect(getEasingBezier(undefined)).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns DEFAULT_CUSTOM_BEZIER for unknown name", () => {
      expect(getEasingBezier("nonExistent")).toEqual(DEFAULT_CUSTOM_BEZIER);
    });

    it("returns a copy, not the original array", () => {
      const result1 = getEasingBezier("easeInQuad");
      const result2 = getEasingBezier("easeInQuad");
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });

    it("mutating result does not affect source", () => {
      const result = getEasingBezier("easeOutCirc");
      result[0] = 999;
      const fresh = getEasingBezier("easeOutCirc");
      expect(fresh[0]).not.toBe(999);
    });

    it("handles all base easing names from easings.net", () => {
      const expectedNames = [
        "easeInSine", "easeOutSine", "easeInOutSine",
        "easeInQuad", "easeOutQuad", "easeInOutQuad",
        "easeInCubic", "easeOutCubic", "easeInOutCubic",
        "easeInQuart", "easeOutQuart", "easeInOutQuart",
        "easeInQuint", "easeOutQuint", "easeInOutQuint",
        "easeInExpo", "easeOutExpo",
        "easeInCirc", "easeOutCirc", "easeInOutCirc",
      ];
      for (const name of expectedNames) {
        const result = getEasingBezier(name);
        expect(result).toHaveLength(4);
        expect(result).not.toEqual(DEFAULT_CUSTOM_BEZIER);
      }
    });
  });
});
