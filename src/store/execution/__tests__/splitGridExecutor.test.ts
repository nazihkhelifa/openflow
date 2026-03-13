import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeSplitGrid } from "../splitGridExecutor";
import type { NodeExecutionContext } from "../types";
import type { WorkflowNode } from "@/types";

// Mock gridSplitter
vi.mock("@/utils/gridSplitter", () => ({
  splitWithDimensions: vi.fn().mockResolvedValue({
    images: ["split-0.png", "split-1.png", "split-2.png", "split-3.png"],
  }),
}));

// Mock Image constructor for dimension loading
class MockImage {
  width = 512;
  height = 512;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src() { return this._src; }
  set src(val: string) {
    this._src = val;
    // Use queueMicrotask so onload fires after assignment
    queueMicrotask(() => this.onload?.());
  }
}
vi.stubGlobal("Image", MockImage);

const defaultProviderSettings = {
  providers: {
    gemini: { apiKey: "" },
    replicate: { apiKey: "" },
    fal: { apiKey: "" },
    kie: { apiKey: "" },
    wavespeed: { apiKey: "" },
    openai: { apiKey: "" },
  },
} as any;

function makeNode(data: Record<string, unknown> = {}): WorkflowNode {
  return {
    id: "sg-1",
    type: "splitGrid",
    position: { x: 0, y: 0 },
    data: {
      sourceImage: null,
      status: null,
      error: null,
      gridRows: 2,
      gridCols: 2,
      isConfigured: true,
      childNodeIds: [
        { imageInput: "child-0" },
        { imageInput: "child-1" },
        { imageInput: "child-2" },
        { imageInput: "child-3" },
      ],
      ...data,
    },
  } as WorkflowNode;
}

function makeCtx(
  node: WorkflowNode,
  overrides: Partial<NodeExecutionContext> = {}
): NodeExecutionContext {
  return {
    node,
    getConnectedInputs: vi.fn().mockReturnValue({
      images: ["data:image/png;base64,source"],
      videos: [],
      audio: [],
      text: null,
      dynamicInputs: {},
      easeCurve: null,
    }),
    updateNodeData: vi.fn(),
    getFreshNode: vi.fn().mockReturnValue(node),
    getEdges: vi.fn().mockReturnValue([]),
    getNodes: vi.fn().mockReturnValue([node]),
    providerSettings: defaultProviderSettings,
    addIncurredCost: vi.fn(),
    addToGlobalHistory: vi.fn(),
    generationsPath: null,
    saveDirectoryPath: null,
    trackSaveGeneration: vi.fn(),
    appendOutputGalleryImage: vi.fn(),
    get: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeSplitGrid", () => {
  it("should throw when no input image connected", async () => {
    const node = makeNode();
    const ctx = makeCtx(node, {
      getConnectedInputs: vi.fn().mockReturnValue({
        images: [],
        videos: [],
        audio: [],
        text: null,
        dynamicInputs: {},
        easeCurve: null,
      }),
    });

    await expect(executeSplitGrid(ctx)).rejects.toThrow("No input image connected");
  });

  it("should throw when not configured", async () => {
    const node = makeNode({ isConfigured: false });
    const ctx = makeCtx(node);

    await expect(executeSplitGrid(ctx)).rejects.toThrow("Node not configured");
  });

  it("should set loading status", async () => {
    const node = makeNode();
    const ctx = makeCtx(node);

    await executeSplitGrid(ctx);

    const calls = (ctx.updateNodeData as ReturnType<typeof vi.fn>).mock.calls;
    const loadingCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).status === "loading"
    );
    expect(loadingCall).toBeDefined();
  });

  it("should set complete status on success", async () => {
    const node = makeNode();
    const ctx = makeCtx(node);

    await executeSplitGrid(ctx);

    const calls = (ctx.updateNodeData as ReturnType<typeof vi.fn>).mock.calls;
    const completeCall = calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>).status === "complete"
    );
    expect(completeCall).toBeDefined();
  });

  it("should update child imageInput nodes with split images", async () => {
    const node = makeNode();
    const ctx = makeCtx(node);

    await executeSplitGrid(ctx);

    // Check that child nodes were updated
    expect(ctx.updateNodeData).toHaveBeenCalledWith("child-0", expect.objectContaining({
      image: "split-0.png",
    }));
    expect(ctx.updateNodeData).toHaveBeenCalledWith("child-1", expect.objectContaining({
      image: "split-1.png",
    }));
  });

  it("should set source image on node", async () => {
    const node = makeNode();
    const ctx = makeCtx(node);

    await executeSplitGrid(ctx);

    expect(ctx.updateNodeData).toHaveBeenCalledWith("sg-1", expect.objectContaining({
      sourceImage: "data:image/png;base64,source",
    }));
  });
});
