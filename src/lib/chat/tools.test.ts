/**
 * Tests for tools.ts
 *
 * Validates buildEditSystemPrompt (basic structure, with context,
 * with/without selection scope) and createChatTools (structure,
 * execute behavior for all 3 tools).
 */

import { describe, it, expect, vi } from "vitest";
import type { WorkflowNode } from "@/types";
import type { WorkflowEdge } from "@/types/workflow";

// Mock nodeDefaults (transitively imported via editOperations)
vi.mock("@/store/utils/nodeDefaults", () => ({
  createDefaultNodeData: (type: string): Record<string, unknown> => {
    switch (type) {
      case "prompt":
        return { prompt: "" };
      case "nanoBanana":
        return { inputImages: [], status: "idle" };
      default:
        return {};
    }
  },
  defaultNodeDimensions: {
    imageInput: { width: 300, height: 280 },
    annotation: { width: 300, height: 280 },
    prompt: { width: 329, height: 371 },
    nanoBanana: { width: 300, height: 300 },
    generateVideo: { width: 300, height: 300 },
    splitGrid: { width: 300, height: 320 },
    output: { width: 320, height: 320 },
    outputGallery: { width: 320, height: 360 },
    imageCompare: { width: 400, height: 360 },
  },
}));

import { buildEditSystemPrompt, createChatTools } from "./tools";
import { buildWorkflowContext, WorkflowContext } from "./contextBuilder";
import type { SubgraphResult } from "./subgraphExtractor";

// --- Test helpers ---

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
  return { id, source, target, sourceHandle, targetHandle };
}

function buildSimpleContext(): WorkflowContext {
  const nodes: WorkflowNode[] = [
    createTestNode("prompt-1", "prompt", { prompt: "sunset" }),
    createTestNode("gen-1", "nanoBanana", {
      inputImages: [],
      outputImage: null,
      aspectRatio: "1:1",
      resolution: "1K",
      status: "idle",
      error: null,
      imageHistory: [],
      selectedHistoryIndex: -1,
    }),
  ];
  const edges: WorkflowEdge[] = [
    createTestEdge("e1", "prompt-1", "gen-1", "text", "text"),
  ];
  return buildWorkflowContext(nodes, edges);
}

// --- Tests ---

describe("buildEditSystemPrompt", () => {
  describe("basic prompt structure", () => {
    it("returns string containing Openflows domain expertise", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("Openflows");
    });

    it("contains CURRENT WORKFLOW section", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("## CURRENT WORKFLOW");
    });

    it("contains TOOL USAGE RULES section", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("## TOOL USAGE RULES");
    });

    it("contains EDITABLE NODE PROPERTIES section", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("## EDITABLE NODE PROPERTIES");
    });

    it("contains node type descriptions", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("### Image Input");
      expect(prompt).toContain("### Prompt");
      expect(prompt).toContain("### Generate Image");
      expect(prompt).toContain("### LLM Text Generation");
      expect(prompt).toContain("### Split Grid");
      expect(prompt).toContain("### Annotation");
      expect(prompt).toContain("### Output");
    });
  });

  describe("with workflow context (no selection)", () => {
    it("includes formatted workflow context for non-empty workflow", () => {
      const context = buildSimpleContext();
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("prompt-1");
      expect(prompt).toContain("gen-1");
      expect(prompt).toContain("2 node(s)");
    });

    it("includes binary data metadata note when no restSummary", () => {
      const context = buildSimpleContext();
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("Binary data (images, videos) has been replaced with metadata descriptions");
    });

    it("shows empty canvas message when workflow is empty", () => {
      const context = buildWorkflowContext([], []);
      const prompt = buildEditSystemPrompt(context);

      expect(prompt).toContain("The canvas is currently empty.");
    });
  });

  describe("with scoped selection (restSummary provided)", () => {
    it("includes SELECTED SUBSET section when restSummary has nodes", () => {
      const context = buildSimpleContext();
      const restSummary: SubgraphResult["restSummary"] = {
        nodeCount: 3,
        typeBreakdown: { prompt: 1, nanoBanana: 2 },
        boundaryConnections: [
          {
            direction: "incoming",
            selectedNodeId: "gen-1",
            otherNodeId: "prompt-2",
            handleType: "text",
          },
        ],
      };

      const prompt = buildEditSystemPrompt(context, restSummary);

      expect(prompt).toContain("SELECTED SUBSET");
    });

    it("mentions rest node count and type breakdown", () => {
      const context = buildSimpleContext();
      const restSummary: SubgraphResult["restSummary"] = {
        nodeCount: 5,
        typeBreakdown: { imageInput: 2, output: 3 },
        boundaryConnections: [],
      };

      const prompt = buildEditSystemPrompt(context, restSummary);

      expect(prompt).toContain("5 other node(s)");
      expect(prompt).toContain("2 imageInput");
      expect(prompt).toContain("3 output");
    });

    it("mentions boundary connections when present", () => {
      const context = buildSimpleContext();
      const restSummary: SubgraphResult["restSummary"] = {
        nodeCount: 2,
        typeBreakdown: { output: 2 },
        boundaryConnections: [
          {
            direction: "outgoing",
            selectedNodeId: "gen-1",
            otherNodeId: "out-1",
            handleType: "image",
          },
          {
            direction: "incoming",
            selectedNodeId: "gen-1",
            otherNodeId: "img-1",
            handleType: "image",
          },
        ],
      };

      const prompt = buildEditSystemPrompt(context, restSummary);

      expect(prompt).toContain("Connections to selected nodes");
      expect(prompt).toContain("Output to out-1");
      expect(prompt).toContain("Input from img-1");
    });
  });

  describe("with empty restSummary", () => {
    it("does NOT show SELECTED SUBSET section when nodeCount is 0", () => {
      const context = buildSimpleContext();
      const restSummary: SubgraphResult["restSummary"] = {
        nodeCount: 0,
        typeBreakdown: {},
        boundaryConnections: [],
      };

      const prompt = buildEditSystemPrompt(context, restSummary);

      expect(prompt).not.toContain("SELECTED SUBSET");
    });
  });
});

describe("createChatTools", () => {
  const nodeIds = ["prompt-1", "gen-1", "out-1"];

  describe("tool structure", () => {
    it("returns object with exactly 3 keys", () => {
      const tools = createChatTools(nodeIds);

      const keys = Object.keys(tools);
      expect(keys).toHaveLength(3);
      expect(keys).toContain("answerQuestion");
      expect(keys).toContain("createWorkflow");
      expect(keys).toContain("editWorkflow");
    });

    it("each tool has description property", () => {
      const tools = createChatTools(nodeIds);

      expect(tools.answerQuestion).toHaveProperty("description");
      expect(tools.createWorkflow).toHaveProperty("description");
      expect(tools.editWorkflow).toHaveProperty("description");
    });

    it("each tool has execute property", () => {
      const tools = createChatTools(nodeIds);

      expect(tools.answerQuestion).toHaveProperty("execute");
      expect(tools.createWorkflow).toHaveProperty("execute");
      expect(tools.editWorkflow).toHaveProperty("execute");
    });
  });

  describe("answerQuestion tool", () => {
    it("has description mentioning informational questions", () => {
      const tools = createChatTools(nodeIds);

      expect(tools.answerQuestion.description).toMatch(/question/i);
    });

    it("execute returns { answer } when called", async () => {
      const tools = createChatTools(nodeIds);

      const result = await tools.answerQuestion.execute(
        { answer: "Use the Resolution dropdown on the Generate node." },
        { toolCallId: "test", messages: [], abortSignal: undefined as any }
      );

      expect(result).toEqual({
        answer: "Use the Resolution dropdown on the Generate node.",
      });
    });
  });

  describe("createWorkflow tool", () => {
    it("has description mentioning new workflow", () => {
      const tools = createChatTools(nodeIds);

      expect(tools.createWorkflow.description).toMatch(/new.*workflow/i);
    });

    it("execute returns { description } when called", async () => {
      const tools = createChatTools(nodeIds);

      const result = await tools.createWorkflow.execute(
        { description: "A workflow for batch image processing" },
        { toolCallId: "test", messages: [], abortSignal: undefined as any }
      );

      expect(result).toEqual({
        description: "A workflow for batch image processing",
      });
    });
  });

  describe("editWorkflow tool", () => {
    it("has description mentioning edit/modify", () => {
      const tools = createChatTools(nodeIds);

      expect(tools.editWorkflow.description).toMatch(/edit|modify/i);
    });

    it("execute returns { operations, explanation } when called", async () => {
      const tools = createChatTools(nodeIds);

      const testOps = [
        { type: "addNode" as const, nodeType: "prompt" },
        { type: "removeNode" as const, nodeId: "out-1" },
      ];

      const result = await tools.editWorkflow.execute(
        {
          operations: testOps,
          explanation: "Added prompt and removed output",
        },
        { toolCallId: "test", messages: [], abortSignal: undefined as any }
      );

      expect(result).toHaveProperty("operations");
      expect(result).toHaveProperty("explanation");
      expect(result.explanation).toBe("Added prompt and removed output");
      expect(result.operations).toHaveLength(2);
    });
  });
});
