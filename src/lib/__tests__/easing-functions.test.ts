import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  easing,
  createBezierEasing,
  getEasingFunction,
  getAllEasingNames,
  type EasingFunction,
} from "../easing-functions";

describe("easing-functions", () => {
  describe("boundary values", () => {
    const allNames = getAllEasingNames();

    it.each(allNames)("%s returns 0 at t=0", (name) => {
      const fn = easing[name as keyof typeof easing];
      expect(fn(0)).toBeCloseTo(0, 5);
    });

    it.each(allNames)("%s returns 1 at t=1", (name) => {
      const fn = easing[name as keyof typeof easing];
      expect(fn(1)).toBeCloseTo(1, 5);
    });
  });

  describe("monotonicity", () => {
    // All standard easing functions should be non-decreasing
    const names = getAllEasingNames();

    it.each(names)("%s is non-decreasing over 100 samples", (name) => {
      const fn = easing[name as keyof typeof easing];
      let prev = fn(0);
      for (let i = 1; i <= 100; i++) {
        const t = i / 100;
        const val = fn(t);
        expect(val).toBeGreaterThanOrEqual(prev - 1e-10);
        prev = val;
      }
    });
  });

  describe("InOut midpoint symmetry", () => {
    const inOutNames = getAllEasingNames().filter((n) => n.includes("InOut"));

    it.each(inOutNames)("%s returns ~0.5 at t=0.5", (name) => {
      const fn = easing[name as keyof typeof easing];
      expect(fn(0.5)).toBeCloseTo(0.5, 2);
    });
  });

  describe("easeIn acceleration", () => {
    const easeInNames = getAllEasingNames().filter(
      (n) => n.startsWith("easeIn") && !n.includes("Out")
    );

    it.each(easeInNames)("%s value < t for small t (t=0.2)", (name) => {
      const fn = easing[name as keyof typeof easing];
      // For easeIn functions, the curve starts slow so value should be less than t
      expect(fn(0.2)).toBeLessThan(0.2);
    });
  });

  describe("easeOut deceleration", () => {
    const easeOutNames = getAllEasingNames().filter(
      (n) => n.startsWith("easeOut")
    );

    it.each(easeOutNames)("%s value > t for small t (t=0.2)", (name) => {
      const fn = easing[name as keyof typeof easing];
      // For easeOut functions, the curve starts fast so value should be greater than t
      expect(fn(0.2)).toBeGreaterThan(0.2);
    });
  });

  describe("linear", () => {
    it("is the identity function", () => {
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        expect(easing.linear(t)).toBeCloseTo(t, 10);
      }
    });
  });

  describe("hybrid easings", () => {
    it("easeInExpoOutCubic is defined and behaves as InOut", () => {
      const fn = easing.easeInExpoOutCubic;
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
      expect(fn(0.5)).toBeCloseTo(0.5, 2);
    });

    it("easeInQuartOutQuad is defined and behaves as InOut", () => {
      const fn = easing.easeInQuartOutQuad;
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
      expect(fn(0.5)).toBeCloseTo(0.5, 2);
    });
  });

  describe("createBezierEasing", () => {
    it("linear bezier (0,0,1,1) is approximately identity", () => {
      const linear = createBezierEasing(0, 0, 1, 1);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        expect(linear(t)).toBeCloseTo(t, 2);
      }
    });

    it("returns 0 at t=0 and 1 at t=1", () => {
      const fn = createBezierEasing(0.25, 0.1, 0.25, 1);
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    });

    it("clamps control points to [0,1]", () => {
      // Passing values outside [0,1] should be clamped
      const fn = createBezierEasing(-1, -1, 2, 2);
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
      // Should still produce a valid curve
      expect(fn(0.5)).toBeGreaterThanOrEqual(0);
      expect(fn(0.5)).toBeLessThanOrEqual(1);
    });

    it("clamps input t to [0,1]", () => {
      const fn = createBezierEasing(0.42, 0, 0.58, 1);
      expect(fn(-0.5)).toBeCloseTo(0, 5);
      expect(fn(1.5)).toBeCloseTo(1, 5);
    });

    it("Newton-Raphson converges for standard ease curves", () => {
      const ease = createBezierEasing(0.25, 0.1, 0.25, 1);
      // Should produce monotonically increasing values
      let prev = 0;
      for (let i = 0; i <= 20; i++) {
        const val = ease(i / 20);
        expect(val).toBeGreaterThanOrEqual(prev - 1e-6);
        prev = val;
      }
    });

    it("handles degenerate bezier (all zeros)", () => {
      const fn = createBezierEasing(0, 0, 0, 0);
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    });
  });

  describe("getEasingFunction", () => {
    it("returns a function for known easing names", () => {
      const fn = getEasingFunction("easeInOutCubic");
      expect(typeof fn).toBe("function");
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    });

    it("returns linear and warns for unknown name", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const fn = getEasingFunction("nonExistentEasing");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("nonExistentEasing")
      );
      // Should return linear
      expect(fn(0.5)).toBeCloseTo(0.5, 10);
      warnSpy.mockRestore();
    });

    it("returns the same function reference as the easing object", () => {
      const fn = getEasingFunction("easeInQuad");
      expect(fn).toBe(easing.easeInQuad);
    });
  });

  describe("getAllEasingNames", () => {
    it("returns 24 easing names", () => {
      const names = getAllEasingNames();
      expect(names).toHaveLength(24);
    });

    it("includes linear", () => {
      expect(getAllEasingNames()).toContain("linear");
    });

    it("includes hybrid easings", () => {
      const names = getAllEasingNames();
      expect(names).toContain("easeInExpoOutCubic");
      expect(names).toContain("easeInQuartOutQuad");
    });

    it("includes all base easings", () => {
      const names = getAllEasingNames();
      expect(names).toContain("easeInQuad");
      expect(names).toContain("easeOutQuad");
      expect(names).toContain("easeInOutQuad");
      expect(names).toContain("easeInSine");
      expect(names).toContain("easeInExpo");
      expect(names).toContain("easeInCirc");
    });
  });
});
