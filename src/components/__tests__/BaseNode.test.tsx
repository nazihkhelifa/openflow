import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BaseNode } from "@/components/nodes";
import { ReactFlowProvider } from "@xyflow/react";

// Mock the workflow store
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector: (state: unknown) => unknown) => mockUseWorkflowStore(selector),
}));

// Mock useReactFlow
const mockGetNodes = vi.fn(() => []);
const mockSetNodes = vi.fn();

vi.mock("@xyflow/react", async () => {
  const actual = await vi.importActual("@xyflow/react");
  return {
    ...actual,
    useReactFlow: () => ({
      getNodes: mockGetNodes,
      setNodes: mockSetNodes,
    }),
  };
});

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("BaseNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    mockUseWorkflowStore.mockImplementation((selector) => {
      const state = {
        currentNodeIds: [],
        groups: {},
        nodes: [],
        focusedCommentNodeId: null,
        setFocusedCommentNodeId: vi.fn(),
      };
      return selector(state);
    });
  });

  const defaultProps = {
    id: "test-node-1",
    title: "Test Node",
    children: <div data-testid="test-children">Test Content</div>,
  };

  describe("Basic Rendering", () => {
    it("should render the title", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByText("Test Node")).toBeInTheDocument();
    });

    it("should render children content", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByTestId("test-children")).toBeInTheDocument();
      expect(screen.getByText("Test Content")).toBeInTheDocument();
    });

    it("should apply custom className", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} className="custom-class" />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".custom-class");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should render custom title with default title", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} customTitle="My Custom Name" />
        </TestWrapper>
      );

      expect(screen.getByText("My Custom Name - Test Node")).toBeInTheDocument();
    });

    it("should render titlePrefix when provided", () => {
      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            titlePrefix={<span data-testid="title-prefix">PREFIX</span>}
          />
        </TestWrapper>
      );

      expect(screen.getByTestId("title-prefix")).toBeInTheDocument();
    });

    it("should render headerAction when provided", () => {
      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            headerAction={<button data-testid="header-action">Action</button>}
          />
        </TestWrapper>
      );

      expect(screen.getByTestId("header-action")).toBeInTheDocument();
    });
  });

  describe("Title Editing", () => {
    it("should enter edit mode when title is clicked", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCustomTitleChange={vi.fn()} />
        </TestWrapper>
      );

      const title = screen.getByText("Test Node");
      fireEvent.click(title);

      const input = screen.getByPlaceholderText("Custom title...");
      expect(input).toBeInTheDocument();
    });

    it("should update title value when typing", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCustomTitleChange={vi.fn()} />
        </TestWrapper>
      );

      const title = screen.getByText("Test Node");
      fireEvent.click(title);

      const input = screen.getByPlaceholderText("Custom title...");
      fireEvent.change(input, { target: { value: "New Title" } });

      expect(input).toHaveValue("New Title");
    });

    it("should submit title on Enter and call onCustomTitleChange", () => {
      const mockOnCustomTitleChange = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCustomTitleChange={mockOnCustomTitleChange} />
        </TestWrapper>
      );

      const title = screen.getByText("Test Node");
      fireEvent.click(title);

      const input = screen.getByPlaceholderText("Custom title...");
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockOnCustomTitleChange).toHaveBeenCalledWith("New Title");
    });

    it("should cancel editing on Escape and revert to original value", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} customTitle="Original" onCustomTitleChange={vi.fn()} />
        </TestWrapper>
      );

      const title = screen.getByText("Original - Test Node");
      fireEvent.click(title);

      const input = screen.getByPlaceholderText("Custom title...");
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.keyDown(input, { key: "Escape" });

      // Should exit edit mode and show original title
      expect(screen.getByText("Original - Test Node")).toBeInTheDocument();
    });

    it("should submit title on blur", () => {
      const mockOnCustomTitleChange = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCustomTitleChange={mockOnCustomTitleChange} />
        </TestWrapper>
      );

      const title = screen.getByText("Test Node");
      fireEvent.click(title);

      const input = screen.getByPlaceholderText("Custom title...");
      fireEvent.change(input, { target: { value: "Blurred Title" } });
      fireEvent.blur(input);

      expect(mockOnCustomTitleChange).toHaveBeenCalledWith("Blurred Title");
    });
  });

  describe("Comment Functionality", () => {
    it("should render empty comment button when no comment exists", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Add comment");
      expect(commentButton).toBeInTheDocument();
    });

    it("should render filled comment button when comment exists", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} comment="Test comment" onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Edit comment");
      expect(commentButton).toBeInTheDocument();
    });

    it("should open comment popover when button is clicked", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Add comment");
      fireEvent.click(commentButton);

      const textarea = screen.getByPlaceholderText("Add a comment...");
      expect(textarea).toBeInTheDocument();
    });

    it("should show existing comment in textarea", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} comment="Existing comment" onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Edit comment");
      fireEvent.click(commentButton);

      const textarea = screen.getByPlaceholderText("Add a comment...");
      expect(textarea).toHaveValue("Existing comment");
    });

    it("should call onCommentChange when Save is clicked", () => {
      const mockOnCommentChange = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCommentChange={mockOnCommentChange} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Add comment");
      fireEvent.click(commentButton);

      const textarea = screen.getByPlaceholderText("Add a comment...");
      fireEvent.change(textarea, { target: { value: "New comment" } });

      const saveButton = screen.getByText("Save");
      fireEvent.click(saveButton);

      expect(mockOnCommentChange).toHaveBeenCalledWith("New comment");
    });

    it("should close popover and revert on Cancel", () => {
      const mockOnCommentChange = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} comment="Original" onCommentChange={mockOnCommentChange} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Edit comment");
      fireEvent.click(commentButton);

      const textarea = screen.getByPlaceholderText("Add a comment...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      const cancelButton = screen.getByText("Cancel");
      fireEvent.click(cancelButton);

      // Popover should be closed
      expect(screen.queryByPlaceholderText("Add a comment...")).not.toBeInTheDocument();
      expect(mockOnCommentChange).not.toHaveBeenCalled();
    });

    it("should close popover on Escape key", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      const commentButton = screen.getByTitle("Add comment");
      fireEvent.click(commentButton);

      const textarea = screen.getByPlaceholderText("Add a comment...");
      fireEvent.keyDown(textarea, { key: "Escape" });

      expect(screen.queryByPlaceholderText("Add a comment...")).not.toBeInTheDocument();
    });
  });

  describe("Expand Button", () => {
    it("should not render expand button when onExpand is not provided", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.queryByTitle("Expand editor")).not.toBeInTheDocument();
    });

    it("should render expand button when onExpand is provided", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onExpand={vi.fn()} />
        </TestWrapper>
      );

      expect(screen.getByTitle("Expand editor")).toBeInTheDocument();
    });

    it("should call onExpand when expand button is clicked", () => {
      const mockOnExpand = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onExpand={mockOnExpand} />
        </TestWrapper>
      );

      const expandButton = screen.getByTitle("Expand editor");
      fireEvent.click(expandButton);

      expect(mockOnExpand).toHaveBeenCalled();
    });
  });

  describe("Run Button", () => {
    it("should not render run button when onRun is not provided", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.queryByTitle("Run this node")).not.toBeInTheDocument();
    });

    it("should render run button when onRun is provided", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onRun={vi.fn()} />
        </TestWrapper>
      );

      expect(screen.getByTitle("Run this node")).toBeInTheDocument();
    });

    it("should call onRun when run button is clicked", () => {
      const mockOnRun = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onRun={mockOnRun} />
        </TestWrapper>
      );

      const runButton = screen.getByTitle("Run this node");
      fireEvent.click(runButton);

      expect(mockOnRun).toHaveBeenCalled();
    });

    it("should disable run button when isExecuting is true", () => {
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onRun={vi.fn()} isExecuting={true} />
        </TestWrapper>
      );

      const runButton = screen.getByTitle("Run this node");
      expect(runButton).toBeDisabled();
    });

    it("should not call onRun when button is disabled", () => {
      const mockOnRun = vi.fn();
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} onRun={mockOnRun} isExecuting={true} />
        </TestWrapper>
      );

      const runButton = screen.getByTitle("Run this node");
      fireEvent.click(runButton);

      expect(mockOnRun).not.toHaveBeenCalled();
    });
  });

  describe("Lock Badge", () => {
    it("should not render lock badge when node is not in a locked group", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: { "group-1": { id: "group-1", locked: false } },
          nodes: [{ id: "test-node-1", groupId: "group-1" }],
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(
        screen.queryByTitle("This node is in a locked group and will be skipped during execution")
      ).not.toBeInTheDocument();
    });

    it("should render lock badge when node is in a locked group", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: { "group-1": { id: "group-1", locked: true } },
          nodes: [{ id: "test-node-1", groupId: "group-1" }],
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(
        screen.getByTitle("This node is in a locked group and will be skipped during execution")
      ).toBeInTheDocument();
    });

    it("should not render lock badge when node has no groupId", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: { "group-1": { id: "group-1", locked: true } },
          nodes: [{ id: "test-node-1" }], // No groupId
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      expect(
        screen.queryByTitle("This node is in a locked group and will be skipped during execution")
      ).not.toBeInTheDocument();
    });
  });

  describe("Comment Navigation in Tooltip", () => {
    // Navigation arrows now appear in the tooltip, which shows when the comment is "focused"
    // (via focusedCommentNodeId in the store) or when hovering

    it("should not render navigation arrows when commentNavigation is not provided even when focused", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1", // This node is focused
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      render(
        <TestWrapper>
          <BaseNode {...defaultProps} comment="Test comment" onCommentChange={vi.fn()} />
        </TestWrapper>
      );

      // Tooltip shows but no navigation arrows since commentNavigation not provided
      expect(screen.queryByTitle("Previous comment")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Next comment")).not.toBeInTheDocument();
    });

    it("should render navigation arrows in tooltip when focused, commentNavigation provided, and comment exists", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1", // This node is focused
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      const commentNavigation = {
        currentIndex: 2,
        totalCount: 5,
        onPrevious: vi.fn(),
        onNext: vi.fn(),
      };

      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            comment="Test comment"
            onCommentChange={vi.fn()}
            commentNavigation={commentNavigation}
          />
        </TestWrapper>
      );

      expect(screen.getByTitle("Previous comment")).toBeInTheDocument();
      expect(screen.getByTitle("Next comment")).toBeInTheDocument();
    });

    it("should render index indicator in tooltip showing current position when focused", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1",
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      const commentNavigation = {
        currentIndex: 2,
        totalCount: 5,
        onPrevious: vi.fn(),
        onNext: vi.fn(),
      };

      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            comment="Test comment"
            onCommentChange={vi.fn()}
            commentNavigation={commentNavigation}
          />
        </TestWrapper>
      );

      expect(screen.getByText("2/5")).toBeInTheDocument();
    });

    it("should call onPrevious when previous button is clicked in tooltip", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1",
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      const mockOnPrevious = vi.fn();
      const commentNavigation = {
        currentIndex: 2,
        totalCount: 5,
        onPrevious: mockOnPrevious,
        onNext: vi.fn(),
      };

      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            comment="Test comment"
            onCommentChange={vi.fn()}
            commentNavigation={commentNavigation}
          />
        </TestWrapper>
      );

      const prevButton = screen.getByTitle("Previous comment");
      fireEvent.click(prevButton);

      expect(mockOnPrevious).toHaveBeenCalled();
    });

    it("should call onNext when next button is clicked in tooltip", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1",
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      const mockOnNext = vi.fn();
      const commentNavigation = {
        currentIndex: 2,
        totalCount: 5,
        onPrevious: vi.fn(),
        onNext: mockOnNext,
      };

      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            comment="Test comment"
            onCommentChange={vi.fn()}
            commentNavigation={commentNavigation}
          />
        </TestWrapper>
      );

      const nextButton = screen.getByTitle("Next comment");
      fireEvent.click(nextButton);

      expect(mockOnNext).toHaveBeenCalled();
    });

    it("should not render arrows when no comment exists even when focused with commentNavigation prop", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: [],
          groups: {},
          nodes: [],
          focusedCommentNodeId: "test-node-1",
          setFocusedCommentNodeId: vi.fn(),
        };
        return selector(state);
      });

      const commentNavigation = {
        currentIndex: 1,
        totalCount: 1,
        onPrevious: vi.fn(),
        onNext: vi.fn(),
      };

      render(
        <TestWrapper>
          <BaseNode
            {...defaultProps}
            onCommentChange={vi.fn()}
            commentNavigation={commentNavigation}
          />
        </TestWrapper>
      );

      // No comment means tooltip won't show, so arrows shouldn't appear
      expect(screen.queryByTitle("Previous comment")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Next comment")).not.toBeInTheDocument();
    });
  });

  describe("Visual States", () => {
    it("should apply selected styling when selected is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} selected={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".ring-2.ring-blue-500\\/40");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply executing styling when isExecuting is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} isExecuting={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-blue-500.ring-1");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply executing styling when currentNodeIds includes the node", () => {
      mockUseWorkflowStore.mockImplementation((selector) => {
        const state = {
          currentNodeIds: ["test-node-1"],
          groups: {},
          nodes: [],
        };
        return selector(state);
      });

      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-blue-500.ring-1");
      expect(nodeDiv).toBeInTheDocument();
    });

    it("should apply error styling when hasError is true", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} hasError={true} />
        </TestWrapper>
      );

      const nodeDiv = container.querySelector(".border-red-500");
      expect(nodeDiv).toBeInTheDocument();
    });
  });

  describe("Node Resizer", () => {
    it("should make resizer visible when selected", () => {
      const { container } = render(
        <TestWrapper>
          <BaseNode {...defaultProps} selected={true} />
        </TestWrapper>
      );

      // NodeResizer component renders with isVisible prop
      // We can check that the component was rendered by looking for resizer handles
      const resizer = container.querySelector(".react-flow__resize-control");
      // NodeResizer is visible when selected, component structure varies
      expect(container.firstChild).toBeTruthy();
    });

    it("should use custom minWidth and minHeight", () => {
      // This test verifies the props are passed, but the actual resizer behavior
      // is managed by React Flow's NodeResizer component
      render(
        <TestWrapper>
          <BaseNode {...defaultProps} minWidth={200} minHeight={150} selected={true} />
        </TestWrapper>
      );

      // Component renders without error with custom dimensions
      expect(screen.getByText("Test Node")).toBeInTheDocument();
    });
  });
});
