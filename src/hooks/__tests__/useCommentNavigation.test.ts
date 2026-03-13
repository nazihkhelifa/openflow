import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCommentNavigation } from "../useCommentNavigation";
import { useWorkflowStore } from "@/store/workflowStore";
import type { WorkflowNode } from "@/types";

// Mock the Toast hook
vi.mock("@/components/Toast", () => ({
  useToast: {
    getState: () => ({
      show: vi.fn(),
    }),
  },
}));

// Mock the logger
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    getCurrentSession: vi.fn().mockReturnValue(null),
  },
}));

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
  }),
});

// Helper to reset store state between tests
function resetStore() {
  const store = useWorkflowStore.getState();
  store.clearWorkflow();
}

// Helper to create a test node
function createTestNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  position = { x: 0, y: 0 }
): WorkflowNode {
  return {
    id,
    type: type as WorkflowNode["type"],
    position,
    data: data as WorkflowNode["data"],
  };
}

describe("useCommentNavigation", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStore();
  });

  describe("when node has no comment", () => {
    it("should return null", () => {
      useWorkflowStore.setState({
        nodes: [createTestNode("node-1", "prompt", { prompt: "test" })],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      expect(result.current).toBeNull();
    });

    it("should return null for empty comment", () => {
      useWorkflowStore.setState({
        nodes: [createTestNode("node-1", "prompt", { prompt: "test", comment: "" })],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      expect(result.current).toBeNull();
    });

    it("should return null for whitespace-only comment", () => {
      useWorkflowStore.setState({
        nodes: [createTestNode("node-1", "prompt", { prompt: "test", comment: "   " })],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      expect(result.current).toBeNull();
    });
  });

  describe("when node has a comment", () => {
    it("should return navigation props with correct index and count", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First comment" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second comment" }, { x: 100, y: 0 }),
          createTestNode("node-3", "prompt", { prompt: "test" }, { x: 200, y: 0 }), // No comment
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      expect(result.current).not.toBeNull();
      expect(result.current?.currentIndex).toBe(1); // 1-based index
      expect(result.current?.totalCount).toBe(2);
    });

    it("should return correct index for second node with comment", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First comment" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second comment" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-2"));

      expect(result.current?.currentIndex).toBe(2);
      expect(result.current?.totalCount).toBe(2);
    });
  });

  describe("onPrevious navigation", () => {
    it("should navigate to previous comment node", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-2"));

      act(() => {
        result.current?.onPrevious();
      });

      const store = useWorkflowStore.getState();
      expect(store.navigationTarget?.nodeId).toBe("node-1");
    });

    it("should wrap from first to last when navigating previous", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      act(() => {
        result.current?.onPrevious();
      });

      const store = useWorkflowStore.getState();
      expect(store.navigationTarget?.nodeId).toBe("node-2");
    });

    it("should mark target comment as viewed", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-2"));

      act(() => {
        result.current?.onPrevious();
      });

      const store = useWorkflowStore.getState();
      expect(store.viewedCommentNodeIds.has("node-1")).toBe(true);
    });
  });

  describe("onNext navigation", () => {
    it("should navigate to next comment node", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      act(() => {
        result.current?.onNext();
      });

      const store = useWorkflowStore.getState();
      expect(store.navigationTarget?.nodeId).toBe("node-2");
    });

    it("should wrap from last to first when navigating next", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-2"));

      act(() => {
        result.current?.onNext();
      });

      const store = useWorkflowStore.getState();
      expect(store.navigationTarget?.nodeId).toBe("node-1");
    });

    it("should mark target comment as viewed", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-1", "prompt", { prompt: "test", comment: "First" }, { x: 0, y: 0 }),
          createTestNode("node-2", "prompt", { prompt: "test", comment: "Second" }, { x: 100, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-1"));

      act(() => {
        result.current?.onNext();
      });

      const store = useWorkflowStore.getState();
      expect(store.viewedCommentNodeIds.has("node-2")).toBe(true);
    });
  });

  describe("comment sorting by position", () => {
    it("should sort by Y position (top to bottom)", () => {
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-bottom", "prompt", { prompt: "test", comment: "Bottom" }, { x: 0, y: 200 }),
          createTestNode("node-top", "prompt", { prompt: "test", comment: "Top" }, { x: 0, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-top"));

      expect(result.current?.currentIndex).toBe(1); // Top should be first
      expect(result.current?.totalCount).toBe(2);
    });

    it("should sort by X position within same row (left to right)", () => {
      // Within 50px Y threshold, should sort by X
      useWorkflowStore.setState({
        nodes: [
          createTestNode("node-right", "prompt", { prompt: "test", comment: "Right" }, { x: 200, y: 10 }),
          createTestNode("node-left", "prompt", { prompt: "test", comment: "Left" }, { x: 0, y: 0 }),
        ],
      });

      const { result } = renderHook(() => useCommentNavigation("node-left"));

      expect(result.current?.currentIndex).toBe(1); // Left should be first
      expect(result.current?.totalCount).toBe(2);
    });
  });
});
