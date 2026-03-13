import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickstartBackButton } from "@/components/quickstart/QuickstartBackButton";

describe("QuickstartBackButton", () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render the back button with text", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      expect(screen.getByText("Back")).toBeInTheDocument();
    });

    it("should render as a button element", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      const button = screen.getByRole("button");
      expect(button).toBeInTheDocument();
    });

    it("should render back arrow icon (svg element)", () => {
      const { container } = render(<QuickstartBackButton onClick={mockOnClick} />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });
  });

  describe("Click Behavior", () => {
    it("should call onClick when clicked", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      fireEvent.click(screen.getByText("Back"));

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it("should call onClick when button is clicked via role", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      fireEvent.click(screen.getByRole("button"));

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Disabled State", () => {
    it("should not be disabled by default", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });

    it("should be disabled when disabled prop is true", () => {
      render(<QuickstartBackButton onClick={mockOnClick} disabled={true} />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should have disabled styling when disabled", () => {
      render(<QuickstartBackButton onClick={mockOnClick} disabled={true} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("opacity-50");
      expect(button).toHaveClass("cursor-not-allowed");
    });

    it("should not call onClick when disabled and clicked", () => {
      render(<QuickstartBackButton onClick={mockOnClick} disabled={true} />);

      fireEvent.click(screen.getByRole("button"));

      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should be focusable when not disabled", () => {
      render(<QuickstartBackButton onClick={mockOnClick} />);

      const button = screen.getByRole("button");
      button.focus();

      expect(document.activeElement).toBe(button);
    });

    it("should not be focusable when disabled", () => {
      render(<QuickstartBackButton onClick={mockOnClick} disabled={true} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("disabled");
    });
  });
});
