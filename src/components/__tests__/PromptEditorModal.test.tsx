import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptEditorModal } from "@/components/modals/PromptEditorModal";

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("PromptEditorModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Visibility", () => {
    it("should not render when isOpen is false", () => {
      render(
        <PromptEditorModal
          isOpen={false}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.queryByText("Edit Prompt")).not.toBeInTheDocument();
    });

    it("should render with title when isOpen is true", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Edit Prompt")).toBeInTheDocument();
    });
  });

  describe("Textarea", () => {
    it("should display textarea with initial prompt value", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Initial test prompt"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      expect(textarea).toHaveValue("Initial test prompt");
    });

    it("should update textarea value on typing", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "New prompt text" } });

      expect(textarea).toHaveValue("New prompt text");
    });

    it("should update local state when initialPrompt prop changes", () => {
      const { rerender } = render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="First prompt"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      expect(textarea).toHaveValue("First prompt");

      rerender(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Updated prompt"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(textarea).toHaveValue("Updated prompt");
    });
  });

  describe("Submit Button", () => {
    it("should render Submit button", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Submit")).toBeInTheDocument();
    });

    it("should call onSubmit with updated prompt when Submit is clicked", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Modified prompt" } });

      fireEvent.click(screen.getByText("Submit"));

      expect(onSubmit).toHaveBeenCalledWith("Modified prompt");
      expect(onClose).toHaveBeenCalled();
    });

    it("should call onSubmit with unchanged prompt if no edits made", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Same prompt"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByText("Submit"));

      expect(onSubmit).toHaveBeenCalledWith("Same prompt");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Cancel Button", () => {
    it("should render Cancel button", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("should call onClose without saving when Cancel is clicked and no changes", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      fireEvent.click(screen.getByText("Cancel"));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("should show confirmation dialog when Cancel is clicked with unsaved changes", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Modified prompt" } });

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
    });
  });

  describe("Unsaved Changes Confirmation Dialog", () => {
    it("should show Discard and Submit buttons in confirmation dialog", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
      expect(screen.getByText("Discard")).toBeInTheDocument();
      // Submit button is in both the main form and the confirmation dialog
      const submitButtons = screen.getAllByText("Submit");
      expect(submitButtons.length).toBe(2);
    });

    it("should close without saving when Discard is clicked", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      fireEvent.click(screen.getByText("Cancel"));
      fireEvent.click(screen.getByText("Discard"));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("should save and close when Submit is clicked in confirmation dialog", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      fireEvent.click(screen.getByText("Cancel"));

      // Click the Submit button in the confirmation dialog
      const submitButtons = screen.getAllByText("Submit");
      fireEvent.click(submitButtons[1]); // Second Submit button is in the confirmation dialog

      expect(onSubmit).toHaveBeenCalledWith("Changed");
      expect(onClose).toHaveBeenCalled();
    });

    it("should dismiss confirmation dialog when close button is clicked", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();

      // Click the X button to close the confirmation
      const closeButton = screen.getByLabelText("Close");
      fireEvent.click(closeButton);

      expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
    });

    it("should dismiss confirmation dialog when clicking outside of it", async () => {
      const { container } = render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      fireEvent.click(screen.getByText("Cancel"));

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();

      // Click on the confirmation backdrop
      const confirmationBackdrop = container.querySelector(".absolute.inset-0.flex.items-center.justify-center.bg-black\\/60");
      fireEvent.click(confirmationBackdrop!);

      await waitFor(() => {
        expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
      });
    });
  });

  describe("Escape Key", () => {
    it("should close modal without saving when Escape is pressed and no changes", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={onSubmit}
          onClose={onClose}
        />
      );

      fireEvent.keyDown(window, { key: "Escape" });

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it("should show confirmation dialog when Escape is pressed with unsaved changes", () => {
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={vi.fn()}
          onClose={onClose}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed prompt" } });

      fireEvent.keyDown(window, { key: "Escape" });

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Backdrop Click", () => {
    it("should close modal when backdrop is clicked and no changes", () => {
      const onClose = vi.fn();

      const { container } = render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original prompt"
          onSubmit={vi.fn()}
          onClose={onClose}
        />
      );

      // Click on the backdrop (outer div with bg-black/50)
      const backdrop = container.querySelector(".fixed.inset-0");
      fireEvent.click(backdrop!);

      expect(onClose).toHaveBeenCalled();
    });

    it("should show confirmation when backdrop is clicked with unsaved changes", () => {
      const onClose = vi.fn();

      const { container } = render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Original"
          onSubmit={vi.fn()}
          onClose={onClose}
        />
      );

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      fireEvent.change(textarea, { target: { value: "Changed" } });

      const backdrop = container.querySelector(".fixed.inset-0");
      fireEvent.click(backdrop!);

      expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("should not close when clicking inside the dialog", () => {
      const onClose = vi.fn();

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt="Test"
          onSubmit={vi.fn()}
          onClose={onClose}
        />
      );

      // Click on the title (inside the dialog)
      fireEvent.click(screen.getByText("Edit Prompt"));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Font Size", () => {
    it("should render font size dropdown", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      // Look for a select element with font size options
      const fontSizeSelect = screen.getByRole("combobox");
      expect(fontSizeSelect).toBeInTheDocument();
    });

    it("should use default font size of 14px", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      expect(fontSizeSelect).toHaveValue("14");
    });

    it("should load saved font size from localStorage", () => {
      mockLocalStorage.getItem.mockReturnValue("18");

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      expect(fontSizeSelect).toHaveValue("18");
    });

    it("should update font size when selection changes", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      fireEvent.change(fontSizeSelect, { target: { value: "20" } });

      expect(fontSizeSelect).toHaveValue("20");
    });

    it("should save font size to localStorage when changed", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      fireEvent.change(fontSizeSelect, { target: { value: "20" } });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        "prompt-editor-font-size",
        "20"
      );
    });

    it("should render all font size options", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      expect(screen.getByText("10px")).toBeInTheDocument();
      expect(screen.getByText("12px")).toBeInTheDocument();
      expect(screen.getByText("14px")).toBeInTheDocument();
      expect(screen.getByText("16px")).toBeInTheDocument();
      expect(screen.getByText("18px")).toBeInTheDocument();
      expect(screen.getByText("20px")).toBeInTheDocument();
      expect(screen.getByText("24px")).toBeInTheDocument();
    });

    it("should apply font size to textarea", () => {
      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      fireEvent.change(fontSizeSelect, { target: { value: "20" } });

      const textarea = screen.getByPlaceholderText("Describe what to generate...");
      expect(textarea).toHaveStyle({ fontSize: "20px" });
    });

    it("should fall back to default if localStorage has invalid value", () => {
      mockLocalStorage.getItem.mockReturnValue("invalid");

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      expect(fontSizeSelect).toHaveValue("14");
    });

    it("should fall back to default if localStorage value is out of range", () => {
      mockLocalStorage.getItem.mockReturnValue("5"); // Below MIN_FONT_SIZE

      render(
        <PromptEditorModal
          isOpen={true}
          initialPrompt=""
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      );

      const fontSizeSelect = screen.getByRole("combobox");
      expect(fontSizeSelect).toHaveValue("14");
    });
  });
});
