import { describe, it, expect } from "vitest";
import type { WorkflowNode } from "@/types";
import type { WorkflowEdge } from "@/types/workflow";
import {
  stripBinaryData,
  buildWorkflowContext,
  formatContextForPrompt,
} from "./contextBuilder";

// Test helpers
const FAKE_BASE64_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const FAKE_BASE64_VIDEO = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAZBtZGF0";

function createTestNode(
  id: string,
  type: string,
  data: Record<string, unknown>,
  position = { x: 100, y: 200 }
): WorkflowNode {
  return {
    id,
    type: type as WorkflowNode["type"],
    position,
    data: data as WorkflowNode["data"],
  };
}

function createTestEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle = "image",
  targetHandle = "image"
): WorkflowEdge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

describe("stripBinaryData", () => {
  describe("imageInput nodes", () => {
    it("replaces base64 image with metadata placeholder", () => {
      const node = createTestNode("img-1", "imageInput", {
        image: FAKE_BASE64_PNG,
        filename: "photo.png",
        dimensions: { width: 1024, height: 768 },
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(stripped.data.filename).toBe("photo.png");
      expect(stripped.data.dimensions).toEqual({ width: 1024, height: 768 });
      expect(stripped.data.image).toMatch(/\[image:.*1024x768.*KB\]/);
    });

    it("omits null image field", () => {
      const node = createTestNode("img-1", "imageInput", {
        image: null,
        filename: null,
        dimensions: null,
      });

      const [stripped] = stripBinaryData([node]);

      expect(stripped.data.image).toBeNull();
    });
  });

  describe("annotation nodes", () => {
    it("strips sourceImage and outputImage", () => {
      const node = createTestNode("ann-1", "annotation", {
        sourceImage: FAKE_BASE64_PNG,
        outputImage: FAKE_BASE64_PNG,
        annotations: [{ id: "shape-1", type: "rectangle" }],
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(stripped.data.annotations).toEqual([{ id: "shape-1", type: "rectangle" }]);
      expect(stripped.data.sourceImage).toMatch(/\[image:.*KB\]/);
      expect(stripped.data.outputImage).toMatch(/\[image:.*KB\]/);
    });
  });

  describe("nanoBanana nodes", () => {
    it("strips inputImages array and outputImage, preserves parameters", () => {
      const node = createTestNode("gen-1", "nanoBanana", {
        inputImages: [FAKE_BASE64_PNG, FAKE_BASE64_PNG],
        outputImage: FAKE_BASE64_PNG,
        aspectRatio: "16:9",
        resolution: "2K",
        model: "nano-banana-pro",
        selectedModel: {
          provider: "gemini",
          modelId: "gemini-3-pro-image-preview",
          displayName: "Gemini 3 Pro Image",
        },
        useGoogleSearch: true,
        parameters: { seed: 42, steps: 30 },
        status: "complete",
        error: null,
        imageHistory: [
          { id: "h1", timestamp: 123, prompt: "test", aspectRatio: "16:9", model: "nano-banana-pro" },
        ],
        selectedHistoryIndex: 0,
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(stripped.data.aspectRatio).toBe("16:9");
      expect(stripped.data.resolution).toBe("2K");
      expect(stripped.data.useGoogleSearch).toBe(true);
      expect(stripped.data.parameters).toEqual({ seed: 42, steps: 30 });
      expect(stripped.data.status).toBe("complete");
      expect(stripped.data.inputImages).toMatch(/\[2 image\(s\)\]/);
      expect(stripped.data.outputImage).toMatch(/\[image:.*Gemini 3 Pro Image.*KB\]/);
      expect(stripped.data.imageHistory).toBeUndefined();
      expect(stripped.data.selectedHistoryIndex).toBeUndefined();
    });

    it("handles empty inputImages array", () => {
      const node = createTestNode("gen-1", "nanoBanana", {
        inputImages: [],
        outputImage: null,
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana",
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      });

      const [stripped] = stripBinaryData([node]);

      expect(stripped.data.inputImages).toBe("[no images]");
      expect(stripped.data.outputImage).toBeNull();
    });

    it("removes imageRef and inputImageRefs fields", () => {
      const node = createTestNode("gen-1", "nanoBanana", {
        inputImages: [],
        inputImageRefs: ["ref-1", "ref-2"],
        outputImage: null,
        outputImageRef: "ref-3",
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana",
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      });

      const [stripped] = stripBinaryData([node]);

      expect(stripped.data.inputImageRefs).toBeUndefined();
      expect(stripped.data.outputImageRef).toBeUndefined();
    });
  });

  describe("generateVideo nodes", () => {
    it("strips inputImages and outputVideo, preserves parameters", () => {
      const node = createTestNode("vid-1", "generateVideo", {
        inputImages: [FAKE_BASE64_PNG],
        outputVideo: FAKE_BASE64_VIDEO,
        selectedModel: {
          provider: "replicate",
          modelId: "stability-ai/stable-video-diffusion",
          displayName: "Stable Video Diffusion",
        },
        parameters: { fps: 24, duration: 3 },
        status: "complete",
        error: null,
        videoHistory: [
          { id: "v1", timestamp: 456, prompt: "test", model: "svd" },
        ],
        selectedVideoHistoryIndex: 0,
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(json).not.toContain("data:video");
      expect(stripped.data.parameters).toEqual({ fps: 24, duration: 3 });
      expect(stripped.data.inputImages).toMatch(/\[1 image\(s\)\]/);
      expect(stripped.data.outputVideo).toMatch(/\[video:.*KB\]/);
      expect(stripped.data.videoHistory).toBeUndefined();
      expect(stripped.data.selectedVideoHistoryIndex).toBeUndefined();
    });
  });

  describe("prompt nodes with inputImages", () => {
    it("strips inputImages, preserves outputText and parameters", () => {
      const node = createTestNode("p-1", "prompt", {
        prompt: "Describe this image",
        inputImages: [FAKE_BASE64_PNG, FAKE_BASE64_PNG],
        outputText: "A beautiful landscape",
        provider: "google",
        model: "gemini-2.5-flash",
        temperature: 0.7,
        maxTokens: 1000,
        status: "complete",
        error: null,
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(stripped.data.outputText).toBe("A beautiful landscape");
      expect(stripped.data.provider).toBe("google");
      expect(stripped.data.model).toBe("gemini-2.5-flash");
      expect(stripped.data.temperature).toBe(0.7);
      expect(stripped.data.maxTokens).toBe(1000);
      expect(stripped.data.inputImages).toMatch(/\[2 image\(s\)\]/);
    });
  });

  describe("splitGrid nodes", () => {
    it("strips sourceImage, preserves settings", () => {
      const node = createTestNode("split-1", "splitGrid", {
        sourceImage: FAKE_BASE64_PNG,
        targetCount: 4,
        defaultPrompt: "enhance",
        generateSettings: {
          aspectRatio: "1:1",
          resolution: "1K",
          model: "nano-banana",
          useGoogleSearch: false,
          useImageSearch: false,
        },
        childNodeIds: [],
        gridRows: 2,
        gridCols: 2,
        isConfigured: true,
        status: "idle",
        error: null,
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(stripped.data.targetCount).toBe(4);
      expect(stripped.data.generateSettings).toEqual({
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana",
        useGoogleSearch: false,
        useImageSearch: false,
      });
      expect(stripped.data.sourceImage).toMatch(/\[image:.*KB\]/);
    });
  });

  describe("output nodes", () => {
    it("strips image and video fields", () => {
      const node = createTestNode("out-1", "output", {
        image: FAKE_BASE64_PNG,
        video: FAKE_BASE64_VIDEO,
        contentType: "image",
        outputFilename: "result",
      });

      const [stripped] = stripBinaryData([node]);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(json).not.toContain("data:video");
      expect(stripped.data.contentType).toBe("image");
      expect(stripped.data.outputFilename).toBe("result");
      expect(stripped.data.image).toMatch(/\[image:.*KB\]/);
      expect(stripped.data.video).toMatch(/\[video:.*KB\]/);
    });
  });

  describe("prompt nodes", () => {
    it("has no binary fields to strip", () => {
      const node = createTestNode("prompt-1", "prompt", {
        prompt: "A sunset over mountains",
      });

      const [stripped] = stripBinaryData([node]);

      expect(stripped.data.prompt).toBe("A sunset over mountains");
    });
  });

  describe("common fields", () => {
    it("preserves customTitle and comment", () => {
      const node = createTestNode("img-1", "imageInput", {
        customTitle: "My Custom Title",
        comment: "This is a test",
        image: null,
        filename: null,
        dimensions: null,
      });

      const [stripped] = stripBinaryData([node]);

      expect(stripped.data.customTitle).toBe("My Custom Title");
      expect(stripped.data.comment).toBe("This is a test");
    });

    it("preserves node position", () => {
      const node = createTestNode(
        "img-1",
        "imageInput",
        { image: null, filename: null, dimensions: null },
        { x: 250, y: 350 }
      );

      const [stripped] = stripBinaryData([node]);

      expect(stripped.position).toEqual({ x: 250, y: 350 });
    });
  });

  describe("exhaustive binary stripping", () => {
    it("produces no base64 strings across all node types", () => {
      const nodes: WorkflowNode[] = [
        createTestNode("img-1", "imageInput", {
          image: FAKE_BASE64_PNG,
          filename: "test.png",
          dimensions: { width: 100, height: 100 },
        }),
        createTestNode("ann-1", "annotation", {
          sourceImage: FAKE_BASE64_PNG,
          outputImage: FAKE_BASE64_PNG,
          annotations: [],
        }),
        createTestNode("gen-1", "nanoBanana", {
          inputImages: [FAKE_BASE64_PNG],
          outputImage: FAKE_BASE64_PNG,
          aspectRatio: "1:1",
          resolution: "1K",
          model: "nano-banana",
          status: "complete",
          error: null,
          imageHistory: [],
          selectedHistoryIndex: -1,
        }),
        createTestNode("vid-1", "generateVideo", {
          inputImages: [FAKE_BASE64_PNG],
          outputVideo: FAKE_BASE64_VIDEO,
          status: "complete",
          error: null,
          videoHistory: [],
          selectedVideoHistoryIndex: -1,
        }),
        createTestNode("p-1", "prompt", {
          inputImages: [FAKE_BASE64_PNG],
          prompt: "test",
          outputText: "result",
          provider: "google",
          model: "gemini-2.5-flash",
          temperature: 0.5,
          maxTokens: 500,
          status: "complete",
          error: null,
        }),
        createTestNode("split-1", "splitGrid", {
          sourceImage: FAKE_BASE64_PNG,
          targetCount: 4,
          defaultPrompt: "test",
          generateSettings: { aspectRatio: "1:1", resolution: "1K", model: "nano-banana", useGoogleSearch: false, useImageSearch: false },
          childNodeIds: [],
          gridRows: 2,
          gridCols: 2,
          isConfigured: true,
          status: "idle",
          error: null,
        }),
        createTestNode("out-1", "output", {
          image: FAKE_BASE64_PNG,
          video: FAKE_BASE64_VIDEO,
        }),
        createTestNode("prompt-1", "prompt", {
          prompt: "test",
        }),
      ];

      const stripped = stripBinaryData(nodes);
      const json = JSON.stringify(stripped);

      expect(json).not.toContain("data:image");
      expect(json).not.toContain("data:video");
    });
  });
});

describe("buildWorkflowContext", () => {
  it("returns isEmpty true for empty workflow", () => {
    const context = buildWorkflowContext([], []);

    expect(context.isEmpty).toBe(true);
    expect(context.nodeCount).toBe(0);
    expect(context.nodes).toEqual([]);
    expect(context.connections).toEqual([]);
  });

  it("includes full node parameters in context", () => {
    const nodes: WorkflowNode[] = [
      createTestNode("gen-1", "nanoBanana", {
        aspectRatio: "16:9",
        resolution: "2K",
        model: "nano-banana-pro",
        selectedModel: {
          provider: "gemini",
          modelId: "gemini-3-pro-image-preview",
          displayName: "Gemini 3 Pro",
        },
        useGoogleSearch: true,
        parameters: { seed: 123 },
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      }),
    ];

    const context = buildWorkflowContext(nodes, []);

    expect(context.isEmpty).toBe(false);
    expect(context.nodeCount).toBe(1);
    expect(context.nodes[0].data.aspectRatio).toBe("16:9");
    expect(context.nodes[0].data.resolution).toBe("2K");
    expect(context.nodes[0].data.useGoogleSearch).toBe(true);
    expect(context.nodes[0].data.parameters).toEqual({ seed: 123 });
  });

  it("includes node positions", () => {
    const nodes: WorkflowNode[] = [
      createTestNode(
        "prompt-1",
        "prompt",
        { prompt: "test" },
        { x: 100, y: 200 }
      ),
    ];

    const context = buildWorkflowContext(nodes, []);

    expect(context.nodes[0].position).toEqual({ x: 100, y: 200 });
  });

  it("includes connection details with source/target handles", () => {
    const nodes: WorkflowNode[] = [
      createTestNode("prompt-1", "prompt", { prompt: "test" }),
      createTestNode("gen-1", "nanoBanana", {
        inputImages: [],
        outputImage: null,
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana",
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      }),
    ];
    const edges: WorkflowEdge[] = [
      createTestEdge("e1", "prompt-1", "gen-1", "text", "text"),
    ];

    const context = buildWorkflowContext(nodes, edges);

    expect(context.connections).toEqual([
      {
        from: "prompt-1",
        to: "gen-1",
        sourceHandle: "text",
        targetHandle: "text",
      },
    ]);
  });

  it("strips binary data from all nodes", () => {
    const nodes: WorkflowNode[] = [
      createTestNode("img-1", "imageInput", {
        image: FAKE_BASE64_PNG,
        filename: "test.png",
        dimensions: { width: 100, height: 100 },
      }),
    ];

    const context = buildWorkflowContext(nodes, []);
    const json = JSON.stringify(context);

    expect(json).not.toContain("data:image");
  });
});

describe("formatContextForPrompt", () => {
  it("returns empty message for empty workflow", () => {
    const context = buildWorkflowContext([], []);
    const formatted = formatContextForPrompt(context);

    expect(formatted).toBe("The canvas is currently empty.");
  });

  it("formats nodes with parameters", () => {
    const nodes: WorkflowNode[] = [
      createTestNode("prompt-1", "prompt", {
        customTitle: "My Prompt",
        prompt: "sunset",
      }),
      createTestNode("gen-1", "nanoBanana", {
        customTitle: "Generator",
        aspectRatio: "16:9",
        resolution: "2K",
        model: "nano-banana-pro",
        inputImages: [],
        outputImage: null,
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      }),
    ];

    const context = buildWorkflowContext(nodes, []);
    const formatted = formatContextForPrompt(context);

    expect(formatted).toContain("Current workflow has 2 node(s):");
    expect(formatted).toContain("prompt-1");
    expect(formatted).toContain("My Prompt");
    expect(formatted).toContain("gen-1");
    expect(formatted).toContain("Generator");
  });

  it("includes connection information", () => {
    const nodes: WorkflowNode[] = [
      createTestNode("prompt-1", "prompt", { prompt: "test" }),
      createTestNode("gen-1", "nanoBanana", {
        inputImages: [],
        outputImage: null,
        aspectRatio: "1:1",
        resolution: "1K",
        model: "nano-banana",
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: -1,
      }),
    ];
    const edges: WorkflowEdge[] = [
      createTestEdge("e1", "prompt-1", "gen-1", "text", "text"),
    ];

    const context = buildWorkflowContext(nodes, edges);
    const formatted = formatContextForPrompt(context);

    expect(formatted).toContain("Connections:");
    expect(formatted).toContain("prompt-1 → gen-1");
  });
});
