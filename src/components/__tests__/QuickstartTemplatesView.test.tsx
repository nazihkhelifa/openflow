import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QuickstartTemplatesView } from "@/components/quickstart/QuickstartTemplatesView";
import { WorkflowFile } from "@/store/workflowStore";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock templates
vi.mock("@/lib/quickstart/templates", () => ({
  getAllPresets: () => [
    {
      id: "product-shot",
      name: "Product Shot",
      description: "Place product in a new scene or environment",
      icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
      id: "model-product",
      name: "Model + Product",
      description: "Combine model, product, and scene",
      icon: "M17 20h5v-2a3 3 0 00-5.356-1.857",
    },
    {
      id: "background-swap",
      name: "Background Swap",
      description: "Place subject in a new background",
      icon: "M4 16l4.586-4.586",
    },
  ],
}));

describe("QuickstartTemplatesView", () => {
  const mockOnBack = vi.fn();
  const mockOnWorkflowSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for community workflows
    mockFetch.mockImplementation((url: string) => {
      if (url === "/api/community-workflows") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, workflows: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render header with title", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Workflow Templates")).toBeInTheDocument();
      });
    });

    it("should render back button", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Back")).toBeInTheDocument();
      });
    });

    it("should render Quick Start section header", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Quick Start")).toBeInTheDocument();
      });
    });

    it("should render Community Workflows section header", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Community Workflows")).toBeInTheDocument();
      });
    });
  });

  describe("Preset Templates", () => {
    it("should render all preset templates", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
        expect(screen.getByText("Model + Product")).toBeInTheDocument();
        expect(screen.getByText("Background Swap")).toBeInTheDocument();
      });
    });

    it("should render template descriptions", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Place product in a new scene or environment")).toBeInTheDocument();
        expect(screen.getByText("Combine model, product, and scene")).toBeInTheDocument();
        expect(screen.getByText("Place subject in a new background")).toBeInTheDocument();
      });
    });

    it("should call API when preset template is clicked", async () => {
      const mockWorkflow: WorkflowFile = {
        id: "test-id",
        version: 1,
        name: "Product Shot",
        edgeStyle: "curved",
        nodes: [],
        edges: [],
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflow: mockWorkflow }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/quickstart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: "product-shot",
            contentLevel: "full",
          }),
        });
      });
    });

    it("should call onWorkflowSelected when preset is loaded successfully", async () => {
      const mockWorkflow: WorkflowFile = {
        id: "test-id",
        version: 1,
        name: "Product Shot",
        edgeStyle: "curved",
        nodes: [],
        edges: [],
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflow: mockWorkflow }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      await waitFor(() => {
        expect(mockOnWorkflowSelected).toHaveBeenCalledWith(mockWorkflow);
      });
    });

    it("should show loading state when template is loading", async () => {
      let resolveQuickstart: ((value: unknown) => void) | undefined;
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return new Promise((resolve) => {
            resolveQuickstart = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      // Check for spinning loader (svg with animate-spin class)
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);

      // Resolve the promise to clean up
      resolveQuickstart!({
        ok: true,
        json: () => Promise.resolve({ success: true, workflow: {} }),
      });
    });

    it("should disable all buttons while loading", async () => {
      let resolveQuickstart: ((value: unknown) => void) | undefined;
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return new Promise((resolve) => {
            resolveQuickstart = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      // Other template buttons should be disabled
      const allButtons = screen.getAllByRole("button");
      // All buttons should be disabled except maybe the back button
      const templateButtons = allButtons.filter(
        (btn) => !btn.textContent?.includes("Back")
      );
      templateButtons.forEach((btn) => {
        expect(btn).toBeDisabled();
      });

      // Resolve the promise to clean up
      resolveQuickstart!({
        ok: true,
        json: () => Promise.resolve({ success: true, workflow: {} }),
      });
    });
  });

  describe("Community Workflows", () => {
    it("should show loading state while fetching community workflows", async () => {
      let resolveList: ((value: unknown) => void) | undefined;
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return new Promise((resolve) => {
            resolveList = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      // Should show loading spinner for community workflows
      const spinners = document.querySelectorAll(".animate-spin");
      expect(spinners.length).toBeGreaterThan(0);

      // Resolve to clean up
      resolveList!({
        ok: true,
        json: () => Promise.resolve({ success: true, workflows: [] }),
      });
    });

    it("should show 'No community workflows available' when list is empty", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("No community workflows available")).toBeInTheDocument();
      });
    });

    it("should render community workflows when available", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                workflows: [
                  { id: "comm-1", name: "Community Workflow 1", author: "user1" },
                  { id: "comm-2", name: "Community Workflow 2", author: "user2" },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Community Workflow 1")).toBeInTheDocument();
        expect(screen.getByText("Community Workflow 2")).toBeInTheDocument();
        expect(screen.getByText("@user1")).toBeInTheDocument();
        expect(screen.getByText("@user2")).toBeInTheDocument();
      });
    });

    it("should call API when community workflow is clicked", async () => {
      const mockWorkflow: WorkflowFile = {
        id: "comm-1",
        version: 1,
        name: "Community Workflow 1",
        edgeStyle: "curved",
        nodes: [],
        edges: [],
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                workflows: [{ id: "comm-1", name: "Community Workflow 1", author: "user1" }],
              }),
          });
        }
        if (url === "/api/community-workflows/comm-1") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, downloadUrl: "https://r2.example.com/comm-1.json" }),
          });
        }
        if (url === "https://r2.example.com/comm-1.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockWorkflow),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Community Workflow 1")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Community Workflow 1"));
      });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith("/api/community-workflows/comm-1");
      });
    });

    it("should call onWorkflowSelected when community workflow is loaded", async () => {
      const mockWorkflow: WorkflowFile = {
        id: "comm-1",
        version: 1,
        name: "Community Workflow 1",
        edgeStyle: "curved",
        nodes: [],
        edges: [],
      };

      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                workflows: [{ id: "comm-1", name: "Community Workflow 1", author: "user1" }],
              }),
          });
        }
        if (url === "/api/community-workflows/comm-1") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, downloadUrl: "https://r2.example.com/comm-1.json" }),
          });
        }
        if (url === "https://r2.example.com/comm-1.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockWorkflow),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Community Workflow 1")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Community Workflow 1"));
      });

      await waitFor(() => {
        expect(mockOnWorkflowSelected).toHaveBeenCalledWith(mockWorkflow);
      });
    });
  });

  describe("Error Handling", () => {
    it("should show error message when preset template loading fails", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: false, error: "Template not found" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      await waitFor(() => {
        expect(screen.getByText("Template not found")).toBeInTheDocument();
      });
    });

    it("should show error message when community workflow loading fails", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                success: true,
                workflows: [{ id: "comm-1", name: "Community Workflow 1", author: "user1" }],
              }),
          });
        }
        if (url === "/api/community-workflows/comm-1") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: false, error: "Workflow not found" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Community Workflow 1")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Community Workflow 1"));
      });

      await waitFor(() => {
        expect(screen.getByText("Workflow not found")).toBeInTheDocument();
      });
    });

    it("should allow dismissing error message", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: false, error: "Failed to load" }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      await waitFor(() => {
        expect(screen.getByText("Failed to load")).toBeInTheDocument();
      });

      // Click dismiss button
      fireEvent.click(screen.getByText("Dismiss"));

      await waitFor(() => {
        expect(screen.queryByText("Failed to load")).not.toBeInTheDocument();
      });
    });
  });

  describe("Back Button", () => {
    it("should call onBack when back button is clicked", async () => {
      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Back")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Back"));

      expect(mockOnBack).toHaveBeenCalled();
    });

    it("should disable back button while loading template", async () => {
      let resolveQuickstart: ((value: unknown) => void) | undefined;
      mockFetch.mockImplementation((url: string) => {
        if (url === "/api/community-workflows") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, workflows: [] }),
          });
        }
        if (url === "/api/quickstart") {
          return new Promise((resolve) => {
            resolveQuickstart = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      });

      render(
        <QuickstartTemplatesView
          onBack={mockOnBack}
          onWorkflowSelected={mockOnWorkflowSelected}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Product Shot")).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText("Product Shot"));
      });

      // Back button should be disabled via the QuickstartBackButton component
      const backButton = screen.getByText("Back").closest("button");
      expect(backButton).toBeDisabled();

      // Resolve to clean up
      resolveQuickstart!({
        ok: true,
        json: () => Promise.resolve({ success: true, workflow: {} }),
      });
    });
  });
});
