import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EaseCurveNodeData } from "@/types";

// Mock the workflow store
const mockUpdateNodeData = vi.fn();
const mockRegenerateNode = vi.fn();
const mockRemoveEdge = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector?: (state: unknown) => unknown) => {
    if (selector) {
      return mockUseWorkflowStore(selector);
    }
    return mockUseWorkflowStore((s: unknown) => s);
  },
}));

// Mock @xyflow/react
const mockSetNodes = vi.fn();

vi.mock("@xyflow/react", () => {
  const React = require("react");
  const MockHandle = (props: Record<string, unknown>) =>
    React.createElement("div", {
      "data-testid": `handle-${props.id}-${props.type}`,
      "data-handleid": props.id,
      "data-handletype": props["data-handletype"],
      "data-type": props.type,
      "data-position": props.position,
      className: `react-flow__handle react-flow__handle-${props.position}`,
      style: props.style,
    });
  return {
    Handle: MockHandle,
    NodeResizer: () => null,
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => children,
    useReactFlow: () => ({
      getNodes: () => [],
      setNodes: mockSetNodes,
      screenToFlowPosition: (pos: unknown) => pos,
    }),
  };
});

// Mock checkEncoderSupport
const mockCheckEncoderSupport = vi.fn();
vi.mock("@/hooks/useStitchVideos", () => ({
  checkEncoderSupport: () => mockCheckEncoderSupport(),
}));

vi.mock("@/components/Toast", () => ({
  useToast: { getState: () => ({ show: vi.fn() }) },
}));

vi.mock("@/hooks/useCommentNavigation", () => ({
  useCommentNavigation: () => null,
}));

vi.mock("@/components/nodes/shared/BaseNode", () => {
  const React = require("react");
  return {
    BaseNode: ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        "div",
        { "data-testid": "base-node", "data-title": props.title },
        children as React.ReactNode
      ),
  };
});

// Mock CubicBezierEditor
vi.mock("@/components/CubicBezierEditor", () => {
  const React = require("react");
  return {
    CubicBezierEditor: (props: Record<string, unknown>) =>
      React.createElement("div", {
        "data-testid": "bezier-editor",
        "data-disabled": String(props.disabled ?? false),
      }),
  };
});

import { EaseCurveNode } from "@/components/nodes";

/** Set up mock store state */
function setMockStoreState(overrides: Record<string, unknown> = {}) {
  const state = {
    updateNodeData: mockUpdateNodeData,
    regenerateNode: mockRegenerateNode,
    removeEdge: mockRemoveEdge,
    edges: [],
    nodes: [],
    isRunning: false,
    currentNodeIds: [],
    groups: {},
    getNodesWithComments: vi.fn(() => []),
    markCommentViewed: vi.fn(),
    setNavigationTarget: vi.fn(),
    ...overrides,
  };
  mockUseWorkflowStore.mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state)
  );
}

const createNodeData = (
  overrides: Partial<EaseCurveNodeData> = {}
): EaseCurveNodeData => ({
  bezierHandles: [0.42, 0, 0.58, 1],
  easingPreset: null,
  inheritedFrom: null,
  outputDuration: 1.5,
  outputVideo: null,
  status: "idle",
  error: null,
  progress: 0,
  encoderSupported: true,
  ...overrides,
});

const createNodeProps = (data: Partial<EaseCurveNodeData> = {}) => ({
  id: "test-ease-1",
  type: "easeCurve" as const,
  data: createNodeData(data),
  selected: false,
});

describe("EaseCurveNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckEncoderSupport.mockResolvedValue(true);
    setMockStoreState();
    mockSetNodes.mockImplementation((fn: unknown) => {
      // Simulate setNodes by applying function to empty array
      if (typeof fn === "function") fn([]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Handle Rendering", () => {
    it("should render 4 handles: video in/out and easeCurve in/out", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps()} />
      );

      // Video input (target)
      expect(
        container.querySelector('[data-handleid="video"][data-type="target"]')
      ).toBeInTheDocument();
      // Video output (source)
      expect(
        container.querySelector('[data-handleid="video"][data-type="source"]')
      ).toBeInTheDocument();
      // EaseCurve input (target)
      expect(
        container.querySelector('[data-handleid="easeCurve"][data-type="target"]')
      ).toBeInTheDocument();
      // EaseCurve output (source)
      expect(
        container.querySelector('[data-handleid="easeCurve"][data-type="source"]')
      ).toBeInTheDocument();
    });

    it("renders handles in checking and unsupported states", () => {
      const { container: checking } = render(
        <EaseCurveNode {...createNodeProps({ encoderSupported: null })} />
      );
      expect(checking.querySelectorAll(".react-flow__handle").length).toBeGreaterThanOrEqual(4);

      const { container: unsupported } = render(
        <EaseCurveNode {...createNodeProps({ encoderSupported: false })} />
      );
      expect(unsupported.querySelectorAll(".react-flow__handle").length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Encoder Detection States", () => {
    it("should show checking spinner when encoderSupported is null", () => {
      render(<EaseCurveNode {...createNodeProps({ encoderSupported: null })} />);
      expect(screen.getByText("Checking encoder...")).toBeInTheDocument();
    });

    it("should show unsupported message when encoderSupported is false", () => {
      render(<EaseCurveNode {...createNodeProps({ encoderSupported: false })} />);
      expect(
        screen.getByText(/doesn.t support video encoding/)
      ).toBeInTheDocument();
    });
  });

  describe("Tab Switching", () => {
    it("should show Editor tab by default", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      expect(screen.getByText("Editor")).toBeInTheDocument();
      expect(screen.getByText("Video")).toBeInTheDocument();
      expect(screen.getByTestId("bezier-editor")).toBeInTheDocument();
    });

    it("should switch to Video tab when clicked", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Video"));
      expect(
        screen.getByText("Run workflow to apply ease curve")
      ).toBeInTheDocument();
    });

    it("should call setNodes to resize when switching tabs", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Video"));
      expect(mockSetNodes).toHaveBeenCalled();
    });
  });

  describe("Preset Popover", () => {
    it("should open preset popover when Presets button is clicked", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Presets"));
      expect(screen.getByText("Bezier Presets")).toBeInTheDocument();
      expect(screen.getByText("All Easing Functions")).toBeInTheDocument();
    });

    it("should close preset popover when Presets button is clicked again", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      // Open
      fireEvent.click(screen.getByText("Presets"));
      expect(screen.getByText("Bezier Presets")).toBeInTheDocument();
      // Close
      fireEvent.click(screen.getByText("Presets"));
      expect(screen.queryByText("Bezier Presets")).not.toBeInTheDocument();
    });

    it("should select a preset and update bezierHandles", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Presets"));

      // Find and click a preset button (easeInOutExpo is one of the EASING_PRESETS)
      const presetButtons = screen.getAllByTitle(/ease/i);
      if (presetButtons.length > 0) {
        fireEvent.click(presetButtons[0]);
        expect(mockUpdateNodeData).toHaveBeenCalled();
      }
    });
  });

  describe("Duration Input", () => {
    it("should show duration input with current value", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps({ outputDuration: 2.0 })} />
      );
      const input = container.querySelector('input[type="number"]');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(2.0);
    });

    it("should update duration on change", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps()} />
      );
      const input = container.querySelector('input[type="number"]')!;
      fireEvent.change(input, { target: { value: "3.5" } });
      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-ease-1", {
        outputDuration: 3.5,
      });
    });

    it("should clamp duration to min 0.1", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps()} />
      );
      const input = container.querySelector('input[type="number"]')!;
      fireEvent.change(input, { target: { value: "0.01" } });
      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-ease-1", {
        outputDuration: 0.1,
      });
    });

    it("should clamp duration to max 30", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps()} />
      );
      const input = container.querySelector('input[type="number"]')!;
      fireEvent.change(input, { target: { value: "50" } });
      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-ease-1", {
        outputDuration: 30,
      });
    });

    it("should fallback to 1.5 for NaN", () => {
      const { container } = render(
        <EaseCurveNode {...createNodeProps()} />
      );
      const input = container.querySelector('input[type="number"]')!;
      fireEvent.change(input, { target: { value: "abc" } });
      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-ease-1", {
        outputDuration: 1.5,
      });
    });
  });

  describe("Apply Button", () => {
    it("should call regenerateNode when Apply button is clicked", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Apply"));
      expect(mockRegenerateNode).toHaveBeenCalledWith("test-ease-1");
    });

    it("should disable Apply when isRunning", () => {
      setMockStoreState({ isRunning: true });
      render(<EaseCurveNode {...createNodeProps()} />);
      expect(screen.getByText("Apply")).toBeDisabled();
    });

    it("should disable Apply when status is loading", () => {
      render(
        <EaseCurveNode {...createNodeProps({ status: "loading" })} />
      );
      expect(screen.getByText("Apply")).toBeDisabled();
    });
  });

  describe("Inheritance", () => {
    it("should show inheritance overlay when easeCurve edge exists", () => {
      setMockStoreState({
        edges: [
          {
            id: "ec-edge",
            source: "parent-ease",
            target: "test-ease-1",
            targetHandle: "easeCurve",
          },
        ],
      });
      render(<EaseCurveNode {...createNodeProps()} />);
      // isInherited auto-switches to video tab; switch back to editor to see overlay
      fireEvent.click(screen.getByText("Editor"));
      expect(
        screen.getByText("Settings inherited from parent node")
      ).toBeInTheDocument();
    });

    it("should show break button in inheritance overlay", () => {
      setMockStoreState({
        edges: [
          {
            id: "ec-edge",
            source: "parent-ease",
            target: "test-ease-1",
            targetHandle: "easeCurve",
          },
        ],
      });
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Editor"));
      expect(screen.getByText("Control manually")).toBeInTheDocument();
    });

    it("should remove edge when break inheritance is clicked", () => {
      setMockStoreState({
        edges: [
          {
            id: "ec-edge",
            source: "parent-ease",
            target: "test-ease-1",
            targetHandle: "easeCurve",
          },
        ],
      });
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Editor"));
      fireEvent.click(screen.getByText("Control manually"));
      expect(mockRemoveEdge).toHaveBeenCalledWith("ec-edge");
      expect(mockUpdateNodeData).toHaveBeenCalledWith("test-ease-1", {
        inheritedFrom: null,
      });
    });

    it("should disable Apply when inherited", () => {
      setMockStoreState({
        edges: [
          {
            id: "ec-edge",
            source: "parent-ease",
            target: "test-ease-1",
            targetHandle: "easeCurve",
          },
        ],
      });
      render(<EaseCurveNode {...createNodeProps()} />);
      // isInherited auto-switches to video tab; switch back to editor
      fireEvent.click(screen.getByText("Editor"));
      expect(screen.getByText("Apply")).toBeDisabled();
    });

    it("should disable bezier editor when inherited", () => {
      setMockStoreState({
        edges: [
          {
            id: "ec-edge",
            source: "parent-ease",
            target: "test-ease-1",
            targetHandle: "easeCurve",
          },
        ],
      });
      render(<EaseCurveNode {...createNodeProps()} />);
      // The editor should still be in the DOM but inside a dimmed wrapper
      // Since the editor is auto-switched to video tab when inherited,
      // we need to switch to editor first
      fireEvent.click(screen.getByText("Editor"));
      const editor = screen.getByTestId("bezier-editor");
      expect(editor.dataset.disabled).toBe("true");
    });
  });

  describe("Processing State", () => {
    it("should show processing overlay when status is loading", () => {
      render(
        <EaseCurveNode {...createNodeProps({ status: "loading", progress: 45 })} />
      );
      expect(screen.getByText("Processing... 45%")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should show error message when status is error", () => {
      render(
        <EaseCurveNode
          {...createNodeProps({
            status: "error",
            error: "Encoder failed",
          })}
        />
      );
      expect(screen.getByText("Encoder failed")).toBeInTheDocument();
    });
  });

  describe("Video Tab", () => {
    it("should show placeholder when no output video", () => {
      render(<EaseCurveNode {...createNodeProps()} />);
      fireEvent.click(screen.getByText("Video"));
      expect(
        screen.getByText("Run workflow to apply ease curve")
      ).toBeInTheDocument();
    });

    it("should show video element when outputVideo exists", () => {
      render(
        <EaseCurveNode
          {...createNodeProps({ outputVideo: "blob:http://localhost/video" })}
        />
      );
      // outputVideo is set from initial render (no auto-switch), click Video tab
      fireEvent.click(screen.getByText("Video"));
      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video?.getAttribute("src")).toBe("blob:http://localhost/video");
    });
  });
});
