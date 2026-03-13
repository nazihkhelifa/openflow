import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SplitGridNode } from "@/components/nodes";
import { ReactFlowProvider } from "@xyflow/react";
import { SplitGridNodeData } from "@/types";

// Mock the workflow store
const mockUpdateNodeData = vi.fn();
const mockRegenerateNode = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => mockUseWorkflowStore(selector),
}));

// Mock useReactFlow
vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: () => ({
      getNodes: vi.fn(() => []),
      setNodes: vi.fn(),
    }),
  };
});

// Mock the SplitGridSettingsModal
vi.mock("@/components/SplitGridSettingsModal", () => ({
  SplitGridSettingsModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="split-grid-settings-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("SplitGridNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    mockUseWorkflowStore.mockImplementation((selector) => {
      const state = {
        updateNodeData: mockUpdateNodeData,
        regenerateNode: mockRegenerateNode,
        isRunning: false,
        currentNodeIds: [],
        groups: {},
        nodes: [],
        getNodesWithComments: vi.fn(() => []),
        markCommentViewed: vi.fn(),
        setNavigationTarget: vi.fn(),
      };
      return selector(state);
    });
  });

  const createDefaultNodeData = (overrides: Partial<SplitGridNodeData> = {}): SplitGridNodeData => ({
    sourceImage: null,
    targetCount: 4,
    defaultPrompt: "",
    generateSettings: {
      aspectRatio: "1:1",
      resolution: "1K",
      model: "nano-banana",
      useGoogleSearch: false,
    },
    childNodeIds: [],
    gridRows: 2,
    gridCols: 2,
    isConfigured: false,
    status: "idle",
    error: null,
    ...overrides,
  });

  const createNodeProps = (data: Partial<SplitGridNodeData> = {}) => ({
    id: "split-grid-node-1",
    type: "splitGrid" as const,
    data: createDefaultNodeData(data),
    selected: false,
  });

  describe("Basic Rendering", () => {
    it("should render the title 'Split Grid'", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      expect(screen.getByText("Split Grid")).toBeInTheDocument();
    });

    it("should render input handle for image", () => {
      const { container } = render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      const imageHandle = container.querySelector('[data-handletype="image"]');
      expect(imageHandle).toBeInTheDocument();
    });

    it("should render output handle for reference", () => {
      const { container } = render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      const referenceHandle = container.querySelector('[data-handletype="reference"]');
      expect(referenceHandle).toBeInTheDocument();
    });

    it("should render grid configuration summary", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ gridRows: 2, gridCols: 3, targetCount: 6 })} />
        </TestWrapper>
      );

      expect(screen.getByText("2x3 grid (6 images)")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("should show 'Connect image' message when no source image", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ sourceImage: null })} />
        </TestWrapper>
      );

      expect(screen.getByText("Connect image")).toBeInTheDocument();
    });

    it("should show unconfigured warning when not configured", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: false })} />
        </TestWrapper>
      );

      expect(screen.getByText("Not configured - click Settings")).toBeInTheDocument();
    });
  });

  describe("Source Image Display", () => {
    it("should display source image when provided", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ sourceImage: "data:image/png;base64,abc123" })} />
        </TestWrapper>
      );

      const img = screen.getByAltText("Source grid");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "data:image/png;base64,abc123");
    });

    it("should show grid overlay on source image", () => {
      const { container } = render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({
            sourceImage: "data:image/png;base64,abc123",
            gridRows: 2,
            gridCols: 2,
            targetCount: 4
          })} />
        </TestWrapper>
      );

      // Check for grid overlay cells
      const gridCells = container.querySelectorAll(".border.border-blue-400\\/50");
      expect(gridCells.length).toBe(4);
    });
  });

  describe("Settings Modal", () => {
    it("should open settings modal when Settings button is clicked", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      const settingsButton = screen.getByText("Settings");
      fireEvent.click(settingsButton);

      expect(screen.getByTestId("split-grid-settings-modal")).toBeInTheDocument();
    });

    it("should close settings modal when onClose is called", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Open modal
      const settingsButton = screen.getByText("Settings");
      fireEvent.click(settingsButton);

      expect(screen.getByTestId("split-grid-settings-modal")).toBeInTheDocument();

      // Close modal
      const closeButton = screen.getByText("Close Modal");
      fireEvent.click(closeButton);

      expect(screen.queryByTestId("split-grid-settings-modal")).not.toBeInTheDocument();
    });

    it("should auto-open settings when not configured and no child nodes", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: false, childNodeIds: [] })} />
        </TestWrapper>
      );

      // Modal should be open automatically
      expect(screen.getByTestId("split-grid-settings-modal")).toBeInTheDocument();
    });

    it("should not auto-open settings when already configured", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: true })} />
        </TestWrapper>
      );

      // Modal should not be open
      expect(screen.queryByTestId("split-grid-settings-modal")).not.toBeInTheDocument();
    });
  });

  describe("Split Button", () => {
    it("should render Split button", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: true })} />
        </TestWrapper>
      );

      expect(screen.getByText("Split")).toBeInTheDocument();
    });

    it("should call regenerateNode when Split button is clicked", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: true })} />
        </TestWrapper>
      );

      const splitButton = screen.getByText("Split");
      fireEvent.click(splitButton);

      expect(mockRegenerateNode).toHaveBeenCalledWith("split-grid-node-1");
    });

    it("should disable Split button when not configured", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: false })} />
        </TestWrapper>
      );

      const splitButton = screen.getByText("Split");
      expect(splitButton).toBeDisabled();
    });

    it("should disable Split button when workflow is running", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          updateNodeData: mockUpdateNodeData,
          regenerateNode: mockRegenerateNode,
          isRunning: true,
          currentNodeIds: [],
          groups: {},
          nodes: [],
          getNodesWithComments: vi.fn(() => []),
          markCommentViewed: vi.fn(),
          setNavigationTarget: vi.fn(),
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ isConfigured: true })} />
        </TestWrapper>
      );

      const splitButton = screen.getByText("Split");
      expect(splitButton).toBeDisabled();
    });
  });

  describe("Child Node Count", () => {
    it("should display child node count when configured", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({
            isConfigured: true,
            childNodeIds: [
              { imageInput: "1", prompt: "2", nanoBanana: "3" },
              { imageInput: "4", prompt: "5", nanoBanana: "6" },
              { imageInput: "7", prompt: "8", nanoBanana: "9" },
            ]
          })} />
        </TestWrapper>
      );

      expect(screen.getByText("3 generate sets created")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("should show loading spinner when status is loading", () => {
      const { container } = render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ status: "loading" })} />
        </TestWrapper>
      );

      const spinner = container.querySelector(".animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("should show loading overlay on source image when loading", () => {
      const { container } = render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({
            sourceImage: "data:image/png;base64,abc",
            status: "loading"
          })} />
        </TestWrapper>
      );

      // Check for loading overlay
      const overlay = container.querySelector(".bg-neutral-900\\/70");
      expect(overlay).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("should show error message when status is error", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ status: "error", error: "Something went wrong" })} />
        </TestWrapper>
      );

      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("should show default error message when error is null", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ status: "error", error: null })} />
        </TestWrapper>
      );

      expect(screen.getByText("Error")).toBeInTheDocument();
    });
  });

  describe("Custom Title", () => {
    it("should display custom title when provided", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps({ customTitle: "My Split" })} />
        </TestWrapper>
      );

      expect(screen.getByText("My Split - Split Grid")).toBeInTheDocument();
    });

    it("should call updateNodeData when custom title is changed", () => {
      render(
        <TestWrapper>
          <SplitGridNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click on title to edit
      const title = screen.getByText("Split Grid");
      fireEvent.click(title);

      // Type new title
      const input = screen.getByPlaceholderText("Custom title...");
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockUpdateNodeData).toHaveBeenCalledWith("split-grid-node-1", { customTitle: "New Title" });
    });
  });
});
