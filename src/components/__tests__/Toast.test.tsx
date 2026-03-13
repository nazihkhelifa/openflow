import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { Toast, useToast } from "@/components/Toast";

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset toast state before each test
    act(() => {
      useToast.getState().hide();
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Basic Rendering", () => {
    it("should not render when message is null", () => {
      render(<Toast />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("should render with message text", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      render(<Toast />);

      expect(screen.getByText("Test message")).toBeInTheDocument();
    });

    it("should render close button", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      render(<Toast />);

      // Close button should be present (the X button)
      const closeButton = screen.getAllByRole("button")[0];
      expect(closeButton).toBeInTheDocument();
    });
  });

  describe("Type Styling", () => {
    it("should apply info styling by default", () => {
      act(() => {
        useToast.getState().show("Info message");
      });

      const { container } = render(<Toast />);

      const toastContainer = container.querySelector(".bg-neutral-800");
      expect(toastContainer).toBeInTheDocument();
    });

    it("should apply success styling", () => {
      act(() => {
        useToast.getState().show("Success message", "success");
      });

      const { container } = render(<Toast />);

      const toastContainer = container.querySelector(".bg-green-900");
      expect(toastContainer).toBeInTheDocument();
    });

    it("should apply warning styling", () => {
      act(() => {
        useToast.getState().show("Warning message", "warning");
      });

      const { container } = render(<Toast />);

      const toastContainer = container.querySelector(".bg-orange-900");
      expect(toastContainer).toBeInTheDocument();
    });

    it("should apply error styling", () => {
      act(() => {
        useToast.getState().show("Error message", "error");
      });

      const { container } = render(<Toast />);

      const toastContainer = container.querySelector(".bg-red-900");
      expect(toastContainer).toBeInTheDocument();
    });
  });

  describe("Type Icons", () => {
    it("should display info icon for info type", () => {
      act(() => {
        useToast.getState().show("Info message", "info");
      });

      const { container } = render(<Toast />);

      // Info icon has specific path
      const icon = container.querySelector("svg.w-5.h-5");
      expect(icon).toBeInTheDocument();
    });

    it("should display success icon for success type", () => {
      act(() => {
        useToast.getState().show("Success message", "success");
      });

      const { container } = render(<Toast />);

      const icon = container.querySelector("svg.w-5.h-5");
      expect(icon).toBeInTheDocument();
    });

    it("should display warning icon for warning type", () => {
      act(() => {
        useToast.getState().show("Warning message", "warning");
      });

      const { container } = render(<Toast />);

      const icon = container.querySelector("svg.w-5.h-5");
      expect(icon).toBeInTheDocument();
    });

    it("should display error icon for error type", () => {
      act(() => {
        useToast.getState().show("Error message", "error");
      });

      const { container } = render(<Toast />);

      const icon = container.querySelector("svg.w-5.h-5");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Close Button", () => {
    it("should call hide() when close button is clicked", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      render(<Toast />);

      expect(screen.getByText("Test message")).toBeInTheDocument();

      const closeButton = screen.getByTitle("Dismiss");
      fireEvent.click(closeButton);

      expect(screen.queryByText("Test message")).not.toBeInTheDocument();
    });
  });

  describe("Auto-hide Behavior", () => {
    it("should auto-hide after 4 seconds when not persistent", () => {
      act(() => {
        useToast.getState().show("Auto-hide message", "info", false);
      });

      render(<Toast />);

      expect(screen.getByText("Auto-hide message")).toBeInTheDocument();

      // Fast-forward 4 seconds
      act(() => {
        vi.advanceTimersByTime(4000);
      });

      expect(screen.queryByText("Auto-hide message")).not.toBeInTheDocument();
    });

    it("should not auto-hide before 4 seconds", () => {
      act(() => {
        useToast.getState().show("Auto-hide message", "info", false);
      });

      render(<Toast />);

      expect(screen.getByText("Auto-hide message")).toBeInTheDocument();

      // Fast-forward 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(screen.getByText("Auto-hide message")).toBeInTheDocument();
    });
  });

  describe("Persistent Toast", () => {
    it("should stay visible when persistent is true", () => {
      act(() => {
        useToast.getState().show("Persistent message", "info", true);
      });

      render(<Toast />);

      expect(screen.getByText("Persistent message")).toBeInTheDocument();

      // Fast-forward well past 4 seconds
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // Should still be visible
      expect(screen.getByText("Persistent message")).toBeInTheDocument();
    });
  });

  describe("Details Section", () => {
    it("should show 'Show details' button when details are provided", () => {
      act(() => {
        useToast.getState().show("Message with details", "error", false, "Error details here");
      });

      render(<Toast />);

      expect(screen.getByText("Show details")).toBeInTheDocument();
    });

    it("should not show details section when no details are provided", () => {
      act(() => {
        useToast.getState().show("Message without details", "info");
      });

      render(<Toast />);

      expect(screen.queryByText("Show details")).not.toBeInTheDocument();
    });

    it("should be collapsed by default", () => {
      act(() => {
        useToast.getState().show("Message", "error", false, "Error details");
      });

      render(<Toast />);

      // Details content should not be visible
      expect(screen.queryByText("Error details")).not.toBeInTheDocument();
    });

    it("should expand when 'Show details' is clicked", () => {
      act(() => {
        useToast.getState().show("Message", "error", false, "Error details");
      });

      render(<Toast />);

      const showDetailsButton = screen.getByText("Show details");
      fireEvent.click(showDetailsButton);

      expect(screen.getByText("Error details")).toBeInTheDocument();
    });

    it("should collapse when 'Hide details' is clicked", () => {
      act(() => {
        useToast.getState().show("Message", "error", false, "Error details");
      });

      render(<Toast />);

      // Expand
      fireEvent.click(screen.getByText("Show details"));
      expect(screen.getByText("Error details")).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByText("Hide details"));
      expect(screen.queryByText("Error details")).not.toBeInTheDocument();
    });

    it("should reset expanded state when message changes", () => {
      act(() => {
        useToast.getState().show("First message", "error", false, "First details");
      });

      const { rerender } = render(<Toast />);

      // Expand
      fireEvent.click(screen.getByText("Show details"));
      expect(screen.getByText("First details")).toBeInTheDocument();

      // Show new message
      act(() => {
        useToast.getState().show("Second message", "error", false, "Second details");
      });

      rerender(<Toast />);

      // Should be collapsed again (we see Show details, not Hide details)
      expect(screen.getByText("Show details")).toBeInTheDocument();
      expect(screen.queryByText("Second details")).not.toBeInTheDocument();
    });
  });
});

describe("useToast Store", () => {
  beforeEach(() => {
    act(() => {
      useToast.getState().hide();
    });
  });

  describe("show()", () => {
    it("should set message", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      const state = useToast.getState();
      expect(state.message).toBe("Test message");
    });

    it("should set type to info by default", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      const state = useToast.getState();
      expect(state.type).toBe("info");
    });

    it("should set custom type", () => {
      act(() => {
        useToast.getState().show("Test message", "error");
      });

      const state = useToast.getState();
      expect(state.type).toBe("error");
    });

    it("should set persistent to false by default", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      const state = useToast.getState();
      expect(state.persistent).toBe(false);
    });

    it("should set persistent when specified", () => {
      act(() => {
        useToast.getState().show("Test message", "info", true);
      });

      const state = useToast.getState();
      expect(state.persistent).toBe(true);
    });

    it("should set details to null by default", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      const state = useToast.getState();
      expect(state.details).toBe(null);
    });

    it("should set details when specified", () => {
      act(() => {
        useToast.getState().show("Test message", "error", false, "Error details");
      });

      const state = useToast.getState();
      expect(state.details).toBe("Error details");
    });
  });

  describe("hide()", () => {
    it("should clear message", () => {
      act(() => {
        useToast.getState().show("Test message");
      });

      expect(useToast.getState().message).toBe("Test message");

      act(() => {
        useToast.getState().hide();
      });

      expect(useToast.getState().message).toBe(null);
    });

    it("should reset persistent to false", () => {
      act(() => {
        useToast.getState().show("Test message", "info", true);
      });

      expect(useToast.getState().persistent).toBe(true);

      act(() => {
        useToast.getState().hide();
      });

      expect(useToast.getState().persistent).toBe(false);
    });

    it("should reset details to null", () => {
      act(() => {
        useToast.getState().show("Test message", "error", false, "Details");
      });

      expect(useToast.getState().details).toBe("Details");

      act(() => {
        useToast.getState().hide();
      });

      expect(useToast.getState().details).toBe(null);
    });
  });
});
