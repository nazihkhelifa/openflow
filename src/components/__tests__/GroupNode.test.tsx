import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupNode } from "@/components/nodes";
import { ReactFlowProvider } from "@xyflow/react";

// Mock the workflow store
const mockUpdateGroup = vi.fn();
const mockDeleteGroup = vi.fn();
const mockMoveGroupNodes = vi.fn();
const mockUseWorkflowStore = vi.fn();

// Mock GROUP_COLORS
const mockGroupColors: Record<string, string> = {
  neutral: "#262626",
  blue: "#1e3a5f",
  green: "#1a3d2e",
  purple: "#2d2458",
  orange: "#3d2a1a",
  red: "#3d1a1a",
};

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: () => mockUseWorkflowStore(),
  GROUP_COLORS: {
    neutral: "#262626",
    blue: "#1e3a5f",
    green: "#1a3d2e",
    purple: "#2d2458",
    orange: "#3d2a1a",
    red: "#3d1a1a",
  },
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
    NodeResizer: ({ isVisible, children }: { isVisible: boolean; children?: React.ReactNode }) => (
      <div data-testid="node-resizer" data-visible={isVisible}>
        {children}
      </div>
    ),
  };
});

// Wrapper component for React Flow context
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe("GroupNode", () => {
  const defaultGroup = {
    id: "group-1",
    name: "Test Group",
    color: "blue" as const,
    position: { x: 0, y: 0 },
    size: { width: 300, height: 200 },
    locked: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    mockUseWorkflowStore.mockReturnValue({
      groups: { "group-1": defaultGroup },
      updateGroup: mockUpdateGroup,
      deleteGroup: mockDeleteGroup,
      moveGroupNodes: mockMoveGroupNodes,
    });
  });

  const createNodeProps = (data: { groupId: string } = { groupId: "group-1" }) => ({
    id: "group-node-1",
    type: "group" as const,
    data,
    selected: false,
  });

  describe("Basic Rendering", () => {
    it("should render the group name", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      expect(screen.getByText("Test Group")).toBeInTheDocument();
    });

    it("should apply group color to background", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const groupContainer = container.querySelector(".rounded-xl");
      expect(groupContainer).toBeInTheDocument();
      // Browser converts hex to rgb, so check for the RGB values instead
      // #1e3a5f = rgb(30, 58, 95)
      expect(groupContainer?.getAttribute("style")).toContain("rgb(30, 58, 95)");
    });

    it("should render color picker button", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const colorButton = container.querySelector('button[title="Change color"]');
      expect(colorButton).toBeInTheDocument();
    });

    it("should render delete button", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const deleteButton = container.querySelector('button[title="Delete group"]');
      expect(deleteButton).toBeInTheDocument();
    });

    it("should return null when group not found", () => {
      mockUseWorkflowStore.mockReturnValue({
        groups: {},
        updateGroup: mockUpdateGroup,
        deleteGroup: mockDeleteGroup,
        moveGroupNodes: mockMoveGroupNodes,
      });

      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps({ groupId: "non-existent" })} />
        </TestWrapper>
      );

      // Should render nothing
      expect(container.querySelector(".rounded-xl")).not.toBeInTheDocument();
    });
  });

  describe("Group Name Editing", () => {
    it("should enter edit mode when name is clicked", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Input should be visible
      const input = screen.getByDisplayValue("Test Group");
      expect(input).toBeInTheDocument();
    });

    it("should update group name on Enter key", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click to edit
      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Change value and press Enter
      const input = screen.getByDisplayValue("Test Group");
      fireEvent.change(input, { target: { value: "New Name" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockUpdateGroup).toHaveBeenCalledWith("group-1", { name: "New Name" });
    });

    it("should cancel editing on Escape key", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click to edit
      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Change value and press Escape
      const input = screen.getByDisplayValue("Test Group");
      fireEvent.change(input, { target: { value: "Changed" } });
      fireEvent.keyDown(input, { key: "Escape" });

      // Should revert and exit edit mode
      expect(mockUpdateGroup).not.toHaveBeenCalled();
      expect(screen.getByText("Test Group")).toBeInTheDocument();
    });

    it("should update group name on blur", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click to edit
      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Change value and blur
      const input = screen.getByDisplayValue("Test Group");
      fireEvent.change(input, { target: { value: "Blurred Name" } });
      fireEvent.blur(input);

      expect(mockUpdateGroup).toHaveBeenCalledWith("group-1", { name: "Blurred Name" });
    });

    it("should not update if name is unchanged", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click to edit
      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Press Enter without changing
      const input = screen.getByDisplayValue("Test Group");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(mockUpdateGroup).not.toHaveBeenCalled();
    });

    it("should not update if name is empty", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click to edit
      const nameSpan = screen.getByText("Test Group");
      fireEvent.click(nameSpan);

      // Clear value and blur
      const input = screen.getByDisplayValue("Test Group");
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.blur(input);

      expect(mockUpdateGroup).not.toHaveBeenCalled();
    });
  });

  describe("Color Picker", () => {
    it("should open color picker when color button is clicked", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const colorButton = container.querySelector('button[title="Change color"]');
      fireEvent.click(colorButton!);

      // Color options should be visible (6 colors)
      const colorOptions = container.querySelectorAll('.grid.grid-cols-4 button');
      expect(colorOptions.length).toBe(6);
    });

    it("should change group color when color option is clicked", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Open color picker
      const colorButton = container.querySelector('button[title="Change color"]');
      fireEvent.click(colorButton!);

      // Click on green color option
      const greenOption = container.querySelector('button[title="Green"]');
      fireEvent.click(greenOption!);

      expect(mockUpdateGroup).toHaveBeenCalledWith("group-1", { color: "green" });
    });

    it("should close color picker after selecting a color", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Open color picker
      const colorButton = container.querySelector('button[title="Change color"]');
      fireEvent.click(colorButton!);

      // Select a color
      const greenOption = container.querySelector('button[title="Green"]');
      fireEvent.click(greenOption!);

      // Color picker should be closed
      const colorOptions = container.querySelectorAll('.grid.grid-cols-4 button');
      expect(colorOptions.length).toBe(0);
    });

    it("should highlight current color in picker", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Open color picker
      const colorButton = container.querySelector('button[title="Change color"]');
      fireEvent.click(colorButton!);

      // Blue option should have highlight styles (current color)
      const blueOption = container.querySelector('button[title="Blue"]');
      expect(blueOption).toHaveClass("border-white");
    });
  });

  describe("Delete Functionality", () => {
    it("should call deleteGroup when delete button is clicked", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const deleteButton = container.querySelector('button[title="Delete group"]');
      fireEvent.click(deleteButton!);

      expect(mockDeleteGroup).toHaveBeenCalledWith("group-1");
    });
  });

  describe("Node Resizer", () => {
    it("should show resizer when selected", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} selected={true} />
        </TestWrapper>
      );

      const resizer = screen.getByTestId("node-resizer");
      expect(resizer).toHaveAttribute("data-visible", "true");
    });

    it("should hide resizer when not selected", () => {
      render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} selected={false} />
        </TestWrapper>
      );

      const resizer = screen.getByTestId("node-resizer");
      expect(resizer).toHaveAttribute("data-visible", "false");
    });
  });

  describe("Header Drag", () => {
    it("should have cursor-grab class on header", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const header = container.querySelector(".cursor-grab");
      expect(header).toBeInTheDocument();
    });

    it("should not start drag when clicking on buttons", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      // Click on delete button
      const deleteButton = container.querySelector('button[title="Delete group"]');
      fireEvent.mouseDown(deleteButton!);

      // moveGroupNodes should not be called
      expect(mockMoveGroupNodes).not.toHaveBeenCalled();
    });

    it("should start drag when clicking on header background", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const header = container.querySelector(".cursor-grab");
      fireEvent.mouseDown(header!, { clientX: 100, clientY: 100 });

      // Move mouse
      fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });

      // moveGroupNodes should be called with delta
      expect(mockMoveGroupNodes).toHaveBeenCalledWith("group-1", { x: 20, y: 20 });
    });

    it("should stop drag on mouseup", () => {
      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const header = container.querySelector(".cursor-grab");
      fireEvent.mouseDown(header!, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 120, clientY: 120 });
      fireEvent.mouseUp(window);

      // Clear the mock
      mockMoveGroupNodes.mockClear();

      // Move mouse again - should not trigger moveGroupNodes
      fireEvent.mouseMove(window, { clientX: 140, clientY: 140 });
      expect(mockMoveGroupNodes).not.toHaveBeenCalled();
    });
  });

  describe("Different Group Colors", () => {
    // Map color names to RGB values (browser converts hex to rgb)
    it.each([
      ["neutral", "rgb(38, 38, 38)"],
      ["blue", "rgb(30, 58, 95)"],
      ["green", "rgb(26, 61, 46)"],
      ["purple", "rgb(45, 36, 88)"],
      ["orange", "rgb(61, 42, 26)"],
      ["red", "rgb(61, 26, 26)"],
    ])("should render with %s color", (colorName, colorRgb) => {
      mockUseWorkflowStore.mockReturnValue({
        groups: {
          "group-1": { ...defaultGroup, color: colorName }
        },
        updateGroup: mockUpdateGroup,
        deleteGroup: mockDeleteGroup,
        moveGroupNodes: mockMoveGroupNodes,
      });

      const { container } = render(
        <TestWrapper>
          <GroupNode {...createNodeProps()} />
        </TestWrapper>
      );

      const groupContainer = container.querySelector(".rounded-xl");
      // Check that container has inline style with the color (browser converts hex to rgb)
      expect(groupContainer?.getAttribute("style")).toContain(colorRgb);
    });
  });
});
