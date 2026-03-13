import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CubicBezierEditor } from "@/components/CubicBezierEditor";

describe("CubicBezierEditor", () => {
  const defaultValue: [number, number, number, number] = [0.42, 0, 0.58, 1];
  const mockOnChange = vi.fn();
  const mockOnCommit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock requestAnimationFrame for RAF throttling
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderEditor = (
    props: Partial<React.ComponentProps<typeof CubicBezierEditor>> = {}
  ) =>
    render(
      <CubicBezierEditor
        value={defaultValue}
        onChange={mockOnChange}
        onCommit={mockOnCommit}
        {...props}
      />
    );

  describe("SVG Rendering", () => {
    it("should render an SVG with viewBox", () => {
      const { container } = renderEditor();
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");
    });

    it("should render grid lines", () => {
      const { container } = renderEditor();
      const lines = container.querySelectorAll("svg line");
      // Should have grid lines (horizontal, vertical, diagonal) + control point lines
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it("should render a bezier curve path", () => {
      const { container } = renderEditor();
      const path = container.querySelector("svg path");
      expect(path).toBeInTheDocument();
      expect(path?.getAttribute("d")).toContain("M0 100 C");
    });
  });

  describe("Control Points", () => {
    it("should render two control point buttons", () => {
      renderEditor();
      expect(screen.getByLabelText("Adjust control point 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Adjust control point 2")).toBeInTheDocument();
    });

    it("should position control point 1 based on value", () => {
      renderEditor({ value: [0.25, 0.1, 0.75, 0.9] });
      const cp1 = screen.getByLabelText("Adjust control point 1");
      // left = v0 * 100 = 25%, top = (1 - v1) * 100 = 90%
      // jsdom normalizes "25.00%" to "25%" — match the CSS-normalized form
      expect(cp1.style.left).toBe("25%");
      expect(cp1.style.top).toBe("90%");
    });

    it("should position control point 2 based on value", () => {
      renderEditor({ value: [0.25, 0.1, 0.75, 0.9] });
      const cp2 = screen.getByLabelText("Adjust control point 2");
      // left = v2 * 100 = 75%, top = (1 - v3) * 100 = 10%
      expect(cp2.style.left).toBe("75%");
      expect(cp2.style.top).toBe("10%");
    });

    it("should update positions when value changes", () => {
      const { rerender } = renderEditor({ value: [0, 0, 1, 1] });
      const cp1 = screen.getByLabelText("Adjust control point 1");
      expect(cp1.style.left).toBe("0%");

      rerender(
        <CubicBezierEditor
          value={[0.5, 0.5, 0.5, 0.5]}
          onChange={mockOnChange}
          onCommit={mockOnCommit}
        />
      );
      expect(cp1.style.left).toBe("50%");
    });
  });

  describe("Disabled State", () => {
    it("should disable control points when disabled=true", () => {
      renderEditor({ disabled: true });
      expect(screen.getByLabelText("Adjust control point 1")).toBeDisabled();
      expect(screen.getByLabelText("Adjust control point 2")).toBeDisabled();
    });

    it("should not start dragging when disabled", () => {
      renderEditor({ disabled: true });
      const cp1 = screen.getByLabelText("Adjust control point 1");
      fireEvent.pointerDown(cp1, { clientX: 50, clientY: 50 });
      // Should not have any ring class since dragging shouldn't start
      expect(cp1.className).not.toContain("ring-2");
    });
  });

  describe("Pointer Drag Interaction", () => {
    it("should start drag on pointerDown for control point 1", () => {
      const { container } = renderEditor();
      const editorDiv = container.querySelector(".relative.w-full")!;
      // Mock getBoundingClientRect
      vi.spyOn(editorDiv, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 260,
        height: 260,
        right: 260,
        bottom: 260,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const cp1 = screen.getByLabelText("Adjust control point 1");
      fireEvent.pointerDown(cp1, { clientX: 130, clientY: 130 });

      // After pointerDown + RAF, onChange should have been called
      expect(mockOnChange).toHaveBeenCalled();
    });

    it("should call onCommit on pointerUp", () => {
      const { container } = renderEditor();
      const editorDiv = container.querySelector(".relative.w-full")!;
      vi.spyOn(editorDiv, "getBoundingClientRect").mockReturnValue({
        left: 0,
        top: 0,
        width: 260,
        height: 260,
        right: 260,
        bottom: 260,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      const cp1 = screen.getByLabelText("Adjust control point 1");
      fireEvent.pointerDown(cp1, { clientX: 130, clientY: 130 });
      // Simulate pointerUp on window
      fireEvent.pointerUp(window);

      expect(mockOnCommit).toHaveBeenCalled();
    });
  });

  describe("Easing Curve Overlay", () => {
    it("should render polyline when easingCurve prop is provided", () => {
      const { container } = renderEditor({
        easingCurve: "0,100 50,50 100,0",
      });
      const polyline = container.querySelector("polyline");
      expect(polyline).toBeInTheDocument();
      expect(polyline?.getAttribute("points")).toBe("0,100 50,50 100,0");
    });

    it("should not render polyline when easingCurve is undefined", () => {
      const { container } = renderEditor();
      const polyline = container.querySelector("polyline");
      expect(polyline).not.toBeInTheDocument();
    });

    it("should dim the bezier curve when easingCurve is present", () => {
      const { container } = renderEditor({
        easingCurve: "0,100 50,50 100,0",
      });
      const path = container.querySelector("svg path");
      // When easing overlay is active, the bezier path is dimmed
      expect(path?.getAttribute("stroke-dasharray")).toBe("3 2");
    });
  });

  describe("Background and Border", () => {
    it("renders the background rect", () => {
      const { container } = renderEditor();
      const rect = container.querySelector("svg rect");
      expect(rect).toBeInTheDocument();
      expect(rect?.getAttribute("fill")).toBe("#0f1720");
    });
  });
});
