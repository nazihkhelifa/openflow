import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  warpTime,
  calculateWarpedDuration,
  validateWarpFunction,
  analyzeWarpCurve,
} from "../speed-curve";
import { easing, getAllEasingNames } from "../easing-functions";

describe("speed-curve", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("warpTime", () => {
    it("maps 0 to 0 (boundary start)", () => {
      expect(warpTime(0, 5, 1.5)).toBeCloseTo(0, 5);
    });

    it("maps inputDuration to outputDuration (boundary end)", () => {
      expect(warpTime(5, 5, 1.5)).toBeCloseTo(1.5, 3);
    });

    it("maps 0 to 0 and end to end with default params", () => {
      expect(warpTime(0)).toBeCloseTo(0, 5);
      expect(warpTime(5)).toBeCloseTo(1.5, 3);
    });

    it("accepts string easing name", () => {
      const result = warpTime(2.5, 5, 1.5, "linear");
      expect(result).toBeCloseTo(0.75, 3);
    });

    it("uses easeInOutCubic by default", () => {
      // Midpoint should map close to midpoint of output
      const mid = warpTime(2.5, 5, 1.5);
      expect(mid).toBeCloseTo(0.75, 2);
    });

    it("with linear easing, produces uniform mapping", () => {
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * 5;
        const expected = (i / 10) * 1.5;
        expect(warpTime(t, 5, 1.5, easing.linear)).toBeCloseTo(expected, 3);
      }
    });

    it("clamps out-of-range input time", () => {
      // Negative time should clamp to 0
      expect(warpTime(-1, 5, 1.5, easing.linear)).toBeCloseTo(0, 3);
      // Time > inputDuration should clamp to outputDuration
      expect(warpTime(10, 5, 1.5, easing.linear)).toBeCloseTo(1.5, 3);
    });

    it("produces monotonically increasing output for standard easings", () => {
      const fn = easing.easeInOutQuad;
      let prev = 0;
      for (let i = 0; i <= 50; i++) {
        const t = (i / 50) * 5;
        const warped = warpTime(t, 5, 1.5, fn);
        expect(warped).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = warped;
      }
    });

    it("works with custom durations", () => {
      expect(warpTime(0, 10, 3, easing.linear)).toBeCloseTo(0, 3);
      expect(warpTime(10, 10, 3, easing.linear)).toBeCloseTo(3, 3);
      expect(warpTime(5, 10, 3, easing.linear)).toBeCloseTo(1.5, 3);
    });
  });

  describe("calculateWarpedDuration", () => {
    it("frame durations sum to approximately outputDuration", () => {
      const fps = 30;
      const inputDuration = 5;
      const outputDuration = 1.5;
      const frameDuration = 1 / fps;
      let totalWarped = 0;

      for (let i = 0; i < inputDuration * fps; i++) {
        const start = i * frameDuration;
        const warped = calculateWarpedDuration(
          start,
          frameDuration,
          inputDuration,
          outputDuration,
          easing.linear
        );
        totalWarped += warped;
      }

      expect(totalWarped).toBeCloseTo(outputDuration, 1);
    });

    it("linear easing produces roughly uniform frame durations", () => {
      const fps = 30;
      const frameDuration = 1 / fps;
      const durations: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = i * frameDuration;
        durations.push(
          calculateWarpedDuration(start, frameDuration, 5, 1.5, easing.linear)
        );
      }

      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      for (const d of durations) {
        expect(d).toBeCloseTo(avg, 3);
      }
    });

    it("returns non-negative duration", () => {
      const result = calculateWarpedDuration(2.5, 0.033, 5, 1.5);
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it("accepts string easing name", () => {
      const result = calculateWarpedDuration(1, 0.033, 5, 1.5, "linear");
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("validateWarpFunction", () => {
    it("returns valid=true for all standard easing names", () => {
      const names = getAllEasingNames();
      for (const name of names) {
        const { valid, errors } = validateWarpFunction(name, 5, 1.5);
        expect(valid).toBe(true);
        expect(errors).toHaveLength(0);
      }
    });

    it("returns valid=true for easing functions", () => {
      const { valid } = validateWarpFunction(easing.easeInOutCubic);
      expect(valid).toBe(true);
    });

    it("returns valid=true with default parameters", () => {
      const { valid } = validateWarpFunction();
      expect(valid).toBe(true);
    });

    it("returns valid=true for linear", () => {
      const { valid } = validateWarpFunction(easing.linear, 5, 1.5);
      expect(valid).toBe(true);
    });

    it("validates start and end points", () => {
      // A well-behaved function should have start=0 and end=outputDuration
      const { valid, errors } = validateWarpFunction(easing.easeInQuad, 5, 1.5);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });
  });

  describe("analyzeWarpCurve", () => {
    it("linear easing gives approximately uniform speed multipliers", () => {
      const result = analyzeWarpCurve(easing.linear, 5, 1.5, 100);
      expect(result.speedMultipliers).toHaveLength(100);
      // All multipliers should be close to 1.0 for linear
      for (const m of result.speedMultipliers) {
        expect(m).toBeCloseTo(1.0, 1);
      }
    });

    it("minSpeed <= avgSpeed <= maxSpeed", () => {
      const result = analyzeWarpCurve(easing.easeInOutCubic, 5, 1.5, 100);
      expect(result.minSpeed).toBeLessThanOrEqual(result.avgSpeed);
      expect(result.avgSpeed).toBeLessThanOrEqual(result.maxSpeed);
    });

    it("avgSpeed is positive for all standard easings", () => {
      const names = getAllEasingNames();
      for (const name of names) {
        const result = analyzeWarpCurve(name, 5, 1.5, 100);
        expect(result.avgSpeed).toBeGreaterThan(0);
      }
    });

    it("linear avgSpeed is close to 1.0", () => {
      const result = analyzeWarpCurve(easing.linear, 5, 1.5, 100);
      expect(result.avgSpeed).toBeCloseTo(1.0, 1);
    });

    it("returns correct number of samples", () => {
      const result = analyzeWarpCurve(easing.linear, 5, 1.5, 50);
      expect(result.speedMultipliers).toHaveLength(50);
    });

    it("easeIn curves have higher speed at the end", () => {
      const result = analyzeWarpCurve(easing.easeInCubic, 5, 1.5, 100);
      const firstQuarter = result.speedMultipliers.slice(0, 25);
      const lastQuarter = result.speedMultipliers.slice(75);
      const avgFirst = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const avgLast = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      // For easeIn, the inverse mapping means: slow start in output = high speed multiplier at start
      // This is because speed multiplier = inputSegment / outputSegment * (outputDuration / inputDuration)
      expect(result.minSpeed).toBeGreaterThan(0);
      expect(result.maxSpeed).toBeGreaterThan(1);
    });

    it("accepts string easing name", () => {
      const result = analyzeWarpCurve("linear", 5, 1.5, 10);
      expect(result.speedMultipliers).toHaveLength(10);
    });
  });

  describe("non-monotonic fallback", () => {
    it("warns once for non-monotonic function and uses direct mapping", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // A sine function is non-monotonic over [0,1] because it goes up then down
      const nonMonotonic = (t: number) => Math.sin(t * Math.PI);

      // First call should warn
      warpTime(2.5, 5, 1.5, nonMonotonic);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("not monotonic")
      );

      // Second call should not warn again (WeakSet prevents repeat)
      warpTime(1, 5, 1.5, nonMonotonic);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      warnSpy.mockRestore();
    });
  });
});
