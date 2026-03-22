import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "@/components/Header";

const mockSetWorkflowMetadata = vi.fn();
const mockSaveToFile = vi.fn();
const mockLoadWorkflow = vi.fn();
const mockDuplicateWorkflowToPath = vi.fn();
const mockUseWorkflowStore = vi.fn();

vi.mock("@/store/workflowStore", () => ({
  useWorkflowStore: (selector?: (state: unknown) => unknown) => {
    if (selector) return mockUseWorkflowStore(selector);
    return mockUseWorkflowStore((s: unknown) => s);
  },
}));

vi.mock("@/components/ProjectSetupModal", () => ({
  ProjectSetupModal: ({ isOpen, mode }: { isOpen: boolean; mode: string }) =>
    isOpen ? <div data-testid="project-setup-modal" data-mode={mode}>Project Setup Modal</div> : null,
}));

const createDefaultState = (overrides = {}) => ({
  workflowName: "",
  workflowId: "",
  saveDirectoryPath: "",
  hasUnsavedChanges: false,
  lastSavedAt: null,
  isSaving: false,
  setWorkflowMetadata: mockSetWorkflowMetadata,
  saveToFile: mockSaveToFile,
  loadWorkflow: mockLoadWorkflow,
  duplicateWorkflowToPath: mockDuplicateWorkflowToPath,
  previousWorkflowSnapshot: null,
  revertToSnapshot: vi.fn(),
  shortcutsDialogOpen: false,
  setShortcutsDialogOpen: vi.fn(),
  setShowQuickstart: vi.fn(),
  flowyAgentOpen: false,
  flowyHistoryRailOpen: false,
  toggleFlowyHistoryRail: vi.fn(),
  ...overrides,
});

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkflowStore.mockImplementation((selector) => selector(createDefaultState()));
  });

  describe("Basic Rendering", () => {
    it("should render the banana icon", () => {
      render(<Header />);
      const icon = screen.getByAltText("Openflows");
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute("src", "/banana_icon.png");
    });

    it("should not render Made by Willie link", () => {
      render(<Header />);
      expect(screen.queryByText("Made by Willie")).not.toBeInTheDocument();
    });

    it("should not render Discord link", () => {
      render(<Header />);
      expect(screen.queryByTitle("Support")).not.toBeInTheDocument();
    });
  });

  describe("Unconfigured Project State", () => {
    it("should show Untitled Project when no project name is set", () => {
      render(<Header />);
      expect(screen.getByText("Untitled Project")).toBeInTheDocument();
    });

    it("should show Not saved status when project is not configured", () => {
      render(<Header />);
      expect(screen.getByText("Not saved")).toBeInTheDocument();
    });
  });

  describe("Configured Project State", () => {
    beforeEach(() => {
      mockUseWorkflowStore.mockImplementation((selector) =>
        selector(createDefaultState({ workflowName: "My Project", workflowId: "project-123", saveDirectoryPath: "/path/to/project" }))
      );
    });

    it("should show project name when configured", () => {
      render(<Header />);
      expect(screen.getByText("My Project")).toBeInTheDocument();
    });

    it("should show Not saved when no lastSavedAt timestamp", () => {
      render(<Header />);
      expect(screen.getByText("Not saved")).toBeInTheDocument();
    });
  });

  describe("Project Dropdown", () => {
    beforeEach(() => {
      mockUseWorkflowStore.mockImplementation((selector) =>
        selector(createDefaultState({ workflowName: "My Project", workflowId: "project-123", saveDirectoryPath: "/path/to/project" }))
      );
    });

    it("should open dropdown when project pill is clicked", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("My Project"));
      expect(screen.getByText("Rename project")).toBeInTheDocument();
      expect(screen.getByText("Duplicate project")).toBeInTheDocument();
    });

    it("should open ProjectSetupModal in settings mode when Rename project clicked", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("My Project"));
      fireEvent.click(screen.getByText("Rename project"));
      const modal = screen.getByTestId("project-setup-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("data-mode", "settings");
    });

    it("should open ProjectSetupModal in duplicate mode when Duplicate project clicked", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("My Project"));
      fireEvent.click(screen.getByText("Duplicate project"));
      const modal = screen.getByTestId("project-setup-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("data-mode", "duplicate");
    });

    it("should show Open project in dropdown", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("My Project"));
      expect(screen.getByText("Open project")).toBeInTheDocument();
    });
  });

  describe("Unconfigured Project Dropdown", () => {
    it("should show New project instead of Rename when unconfigured", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("Untitled Project"));
      expect(screen.getByText("New project")).toBeInTheDocument();
      expect(screen.queryByText("Rename project")).not.toBeInTheDocument();
      expect(screen.queryByText("Duplicate project")).not.toBeInTheDocument();
    });

    it("should open ProjectSetupModal in new mode when New project clicked", () => {
      render(<Header />);
      fireEvent.click(screen.getByText("Untitled Project"));
      fireEvent.click(screen.getByText("New project"));
      const modal = screen.getByTestId("project-setup-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("data-mode", "new");
    });
  });

  describe("Save State Display", () => {
    it("should show Saving... when isSaving is true", () => {
      mockUseWorkflowStore.mockImplementation((selector) =>
        selector(createDefaultState({ workflowName: "My Project", workflowId: "project-123", saveDirectoryPath: "/path/to/project", isSaving: true }))
      );
      render(<Header />);
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    it("should show formatted save time when lastSavedAt is set", () => {
      const timestamp = new Date("2024-01-15T14:30:00").getTime();
      mockUseWorkflowStore.mockImplementation((selector) =>
        selector(createDefaultState({ workflowName: "My Project", workflowId: "project-123", saveDirectoryPath: "/path/to/project", lastSavedAt: timestamp }))
      );
      render(<Header />);
      expect(screen.getByText(/Saved/)).toBeInTheDocument();
    });
  });

  describe("File Loading", () => {
    it("should have hidden file input for loading workflows", () => {
      const { container } = render(<Header />);
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute("accept", ".json");
      expect(fileInput).toHaveClass("hidden");
    });
  });

});
