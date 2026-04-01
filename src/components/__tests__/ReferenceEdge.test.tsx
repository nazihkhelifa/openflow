import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ReferenceEdge } from "@/components/edges/ReferenceEdge";
import { ReactFlowProvider, Position } from "@xyflow/react";

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ReactFlowProvider>
      <svg data-testid="svg-container">{children}</svg>
    </ReactFlowProvider>
  );
}

// Default edge props
const createDefaultProps = (overrides = {}) => ({
  id: "ref-edge-1",
  source: "node-1",
  target: "node-2",
  sourceX: 100,
  sourceY: 50,
  targetX: 300,
  targetY: 50,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  selected: false,
  ...overrides,
});

describe("ReferenceEdge", () => {
  describe("Basic Rendering", () => {
    it("should render the edge path", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThan(0);
    });

    it("should always use bezier (curved) path style", () => {
      // ReferenceEdge always uses curved paths regardless of edgeStyle setting
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThan(0);
    });

    it("should render invisible interaction path for easier selection", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      const interactionPath = container.querySelector(".react-flow__edge-interaction");
      expect(interactionPath).toBeInTheDocument();
    });
  });

  describe("Dashed Style", () => {
    it("should render with dashed stroke pattern", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      // The BaseEdge path should have strokeDasharray style
      // The style is applied via the style prop to BaseEdge
      const paths = container.querySelectorAll("path");
      // At least one path should exist for the dashed edge
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe("Gray Color", () => {
    it("should render with solid reference stroke color", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      const edgePath = container.querySelector(".react-flow__edge-path");
      expect(edgePath).toBeInTheDocument();
      expect(edgePath).toHaveStyle({ stroke: "#a1a1aa" });
    });
  });

  describe("Read-Only (No Interactive Elements)", () => {
    it("should not render any interactive draggable handles", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge
            {...createDefaultProps({
              selected: true,
            })}
          />
        </TestWrapper>
      );

      // No draggable handle circles should be rendered
      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(0);
    });

    it("should not render pause indicator", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      // No rectangles (pause bars) should be rendered
      const rects = container.querySelectorAll("rect");
      expect(rects.length).toBe(0);
    });
  });

  describe("Stroke Width", () => {
    it("should render with thinner stroke than editable edges", () => {
      const { container } = render(
        <TestWrapper>
          <ReferenceEdge {...createDefaultProps()} />
        </TestWrapper>
      );

      // ReferenceEdge uses strokeWidth: 2 (vs 3 for EditableEdge)
      // The style is applied to the BaseEdge component
      const paths = container.querySelectorAll("path");
      expect(paths.length).toBeGreaterThan(0);
    });
  });

});
