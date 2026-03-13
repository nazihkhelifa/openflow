import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PromptNode } from "@/components/nodes";
import { ReactFlowProvider } from "@xyflow/react";

// Mock the workflow store
const mockUpdateNodeData = vi.fn();
const mockIncrementModalCount = vi.fn();
const mockDecrementModalCount = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: vi.fn((selector) => {
    const state = {
      updateNodeData: mockUpdateNodeData,
      incrementModalCount: mockIncrementModalCount,
      decrementModalCount: mockDecrementModalCount,
      currentNodeIds: [],
      groups: {},
      nodes: [],
      edges: [],
      getConnectedInputs: vi.fn(() => ({ images: [], videos: [], text: null, dynamicInputs: {} })),
      getNodesWithComments: vi.fn(() => []),
      markCommentViewed: vi.fn(),
      setNavigationTarget: vi.fn(),
    };
    return selector(state);
  }),
}));

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("PromptNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    id: "test-prompt-1",
    type: "prompt" as const,
    data: {
      prompt: "",
    },
    selected: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    zIndex: 0,
    dragging: false,
    deletable: true,
    selectable: true,
    parentId: undefined,
    dragHandle: undefined,
  };

  it("should render the textarea with placeholder", () => {
    render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    const textarea = screen.getByPlaceholderText("Describe what to generate...");
    expect(textarea).toBeInTheDocument();
  });

  it("should render with initial prompt value", () => {
    const propsWithPrompt = {
      ...defaultProps,
      data: { prompt: "Initial prompt text" },
    };

    render(
      <TestWrapper>
        <PromptNode {...propsWithPrompt} />
      </TestWrapper>
    );

    const textarea = screen.getByDisplayValue("Initial prompt text");
    expect(textarea).toBeInTheDocument();
  });

  it("should call updateNodeData when typing in textarea and blurring", () => {
    render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    const textarea = screen.getByPlaceholderText("Describe what to generate...");
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: "New prompt text" } });
    fireEvent.blur(textarea);

    expect(mockUpdateNodeData).toHaveBeenCalledWith("test-prompt-1", {
      prompt: "New prompt text",
    });
  });

  it("should render the Prompt title", () => {
    render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByText("Prompt")).toBeInTheDocument();
  });

  it("should render expand button", () => {
    render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    expect(screen.getByTitle("Expand editor")).toBeInTheDocument();
  });

  it("should call incrementModalCount when expand button is clicked", () => {
    render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    const expandButton = screen.getByTitle("Expand editor");
    fireEvent.click(expandButton);

    expect(mockIncrementModalCount).toHaveBeenCalled();
  });

  it("should render text output handle", () => {
    const { container } = render(
      <TestWrapper>
        <PromptNode {...defaultProps} />
      </TestWrapper>
    );

    const handle = container.querySelector('[data-handletype="text"]');
    expect(handle).toBeInTheDocument();
  });
});
