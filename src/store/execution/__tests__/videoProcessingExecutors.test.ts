import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeVideoStitch, executeEaseCurve } from "../videoProcessingExecutors";
import type { NodeExecutionContext } from "../types";
import type { WorkflowNode } from "@/types";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock URL methods
vi.stubGlobal("URL", {
  ...URL,
  createObjectURL: vi.fn().mockReturnValue("blob:http://localhost/mock"),
  revokeObjectURL: vi.fn(),
});

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

function makeCtx(
  node: WorkflowNode,
  overrides: Partial<NodeExecutionContext> = {}
): NodeExecutionContext {
  return {
    node,
    getConnectedInputs: vi.fn().mockReturnValue({
      images: [],
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

describe("executeVideoStitch", () => {
  function makeStitchNode(data: Record<string, unknown> = {}): WorkflowNode {
    return {
      id: "vs-1",
      type: "videoStitch",
      position: { x: 0, y: 0 },
      data: {
        outputVideo: null,
        status: null,
        error: null,
        progress: 0,
        encoderSupported: true,
        loopCount: 1,
        ...data,
      },
    } as WorkflowNode;
  }

  it("should error when encoder not supported", async () => {
    const node = makeStitchNode({ encoderSupported: false });
    const ctx = makeCtx(node);

    await expect(executeVideoStitch(ctx)).rejects.toThrow("Browser does not support video encoding");

    expect(ctx.updateNodeData).toHaveBeenCalledWith("vs-1", expect.objectContaining({
      status: "error",
      error: "Browser does not support video encoding",
    }));
  });

  it("should error when fewer than 2 videos", async () => {
    const node = makeStitchNode();
    const ctx = makeCtx(node, {
      getConnectedInputs: vi.fn().mockReturnValue({
        images: [],
        videos: ["single-video"],
        audio: [],
        text: null,
        dynamicInputs: {},
        easeCurve: null,
      }),
    });

    await expect(executeVideoStitch(ctx)).rejects.toThrow("Need at least 2 video clips to stitch");

    expect(ctx.updateNodeData).toHaveBeenCalledWith("vs-1", expect.objectContaining({
      status: "error",
      error: "Need at least 2 video clips to stitch",
    }));
  });

  it("should set loading status with 0 progress", async () => {
    const node = makeStitchNode();
    const ctx = makeCtx(node, {
      getConnectedInputs: vi.fn().mockReturnValue({
        images: [],
        videos: ["video1", "video2"],
        audio: [],
        text: null,
        dynamicInputs: {},
        easeCurve: null,
      }),
    });

    // Will fail at fetch but we only care about the loading call
    await executeVideoStitch(ctx).catch(() => {});

    const calls = (ctx.updateNodeData as ReturnType<typeof vi.fn>).mock.calls;
    const loadingCall = calls.find(
      (c: unknown[]) =>
        (c[1] as Record<string, unknown>).status === "loading" &&
        (c[1] as Record<string, unknown>).progress === 0
    );
    expect(loadingCall).toBeDefined();
  });
});

describe("executeEaseCurve", () => {
  function makeEaseNode(data: Record<string, unknown> = {}): WorkflowNode {
    return {
      id: "ec-1",
      type: "easeCurve",
      position: { x: 0, y: 0 },
      data: {
        outputVideo: null,
        status: null,
        error: null,
        progress: 0,
        encoderSupported: true,
        bezierHandles: [0.25, 0.1, 0.25, 1.0],
        easingPreset: "ease-in-out",
        outputDuration: 5,
        ...data,
      },
    } as WorkflowNode;
  }

  it("should error when encoder not supported", async () => {
    const node = makeEaseNode({ encoderSupported: false });
    const ctx = makeCtx(node);

    await expect(executeEaseCurve(ctx)).rejects.toThrow("Browser does not support video encoding");

    expect(ctx.updateNodeData).toHaveBeenCalledWith("ec-1", expect.objectContaining({
      status: "error",
      error: "Browser does not support video encoding",
    }));
  });

  it("should error when no video connected", async () => {
    const node = makeEaseNode();
    const ctx = makeCtx(node);

    await expect(executeEaseCurve(ctx)).rejects.toThrow("Connect a video input to apply ease curve");

    expect(ctx.updateNodeData).toHaveBeenCalledWith("ec-1", expect.objectContaining({
      status: "error",
      error: "Connect a video input to apply ease curve",
    }));
  });

  it("should set loading status with 0 progress", async () => {
    const node = makeEaseNode();
    const ctx = makeCtx(node, {
      getConnectedInputs: vi.fn().mockReturnValue({
        images: [],
        videos: ["video1"],
        audio: [],
        text: null,
        dynamicInputs: {},
        easeCurve: null,
      }),
    });

    // Will fail at fetch but we only care about the loading call
    await executeEaseCurve(ctx).catch(() => {});

    const calls = (ctx.updateNodeData as ReturnType<typeof vi.fn>).mock.calls;
    const loadingCall = calls.find(
      (c: unknown[]) =>
        (c[1] as Record<string, unknown>).status === "loading" &&
        (c[1] as Record<string, unknown>).progress === 0
    );
    expect(loadingCall).toBeDefined();
  });

  it("should propagate parent easeCurve settings", async () => {
    const node = makeEaseNode({
      bezierHandles: [0, 0, 1, 1],
      easingPreset: null,
    });
    const ctx = makeCtx(node, {
      getConnectedInputs: vi.fn().mockReturnValue({
        images: [],
        videos: ["video1"],
        audio: [],
        text: null,
        dynamicInputs: {},
        easeCurve: {
          bezierHandles: [0.42, 0, 0.58, 1],
          easingPreset: "ease-in-out",
        },
      }),
      getEdges: vi.fn().mockReturnValue([
        { id: "e1", source: "parent-ec", target: "ec-1", targetHandle: "easeCurve" },
      ]),
    });

    // Will fail at fetch but we only care about the easeCurve propagation
    await executeEaseCurve(ctx).catch(() => {});

    expect(ctx.updateNodeData).toHaveBeenCalledWith("ec-1", expect.objectContaining({
      bezierHandles: [0.42, 0, 0.58, 1],
      easingPreset: "ease-in-out",
      inheritedFrom: "parent-ec",
    }));
  });
});
