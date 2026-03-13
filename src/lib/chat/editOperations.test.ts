/**
 * Tests for editOperations.ts
 *
 * Validates applyEditOperations (all 5 operation types with happy paths
 * and skip scenarios) and narrateOperations formatting.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkflowNode, WorkflowNodeData } from "@/types";
import type { WorkflowEdge } from "@/types/workflow";

// Mock nodeDefaults before importing the module under test
vi.mock("@/store/utils/nodeDefaults", () => ({
  createDefaultNodeData: (type: string): Record<string, unknown> => {
    switch (type) {
      case "prompt":
        return { prompt: "" };
      case "nanoBanana":
        return {
          inputImages: [],
          inputPrompt: null,
          outputImage: null,
          aspectRatio: "1:1",
          resolution: "1K",
          model: "nano-banana",
          useGoogleSearch: false,
          useImageSearch: false,
          status: "idle",
          error: null,
          imageHistory: [],
          selectedHistoryIndex: 0,
        };
      case "imageInput":
        return { image: null, filename: null, dimensions: null };
      case "output":
        return { image: null, outputFilename: "" };
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

import {
  applyEditOperations,
  narrateOperations,
  EditOperation,
} from "./editOperations";

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
    data: data as WorkflowNodeData,
  };
}

function createTestEdge(
  id: string,
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): WorkflowEdge {
  return { id, source, target, sourceHandle, targetHandle };
}

// --- Tests ---

describe("applyEditOperations", () => {
  let baseNodes: WorkflowNode[];
  let baseEdges: WorkflowEdge[];

  beforeEach(() => {
    baseNodes = [
      createTestNode("prompt-1", "prompt", { prompt: "sunset photo" }),
      createTestNode("gen-1", "nanoBanana", {
        inputImages: [],
        outputImage: null,
        status: "idle",
      }),
      createTestNode("out-1", "output", { image: null }),
    ];
    baseEdges = [
      createTestEdge("e1", "prompt-1", "gen-1", "text", "text"),
      createTestEdge("e2", "gen-1", "out-1", "image", "image"),
    ];
  });

  // --- addNode ---

  describe("addNode operations", () => {
    it("adds a node with correct type and generated ID pattern", () => {
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "prompt" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.applied).toBe(1);
      expect(result.skipped).toHaveLength(0);

      const added = result.nodes[3];
      expect(added.type).toBe("prompt");
      // ID pattern: ${type}-ai-${timestamp}-${index}
      expect(added.id).toMatch(/^prompt-ai-\d+-0$/);
    });

    it("uses provided position or defaults to {x:200, y:200}", () => {
      const opsWithPos: EditOperation[] = [
        { type: "addNode", nodeType: "output", position: { x: 500, y: 600 } },
      ];
      const opsNoPos: EditOperation[] = [
        { type: "addNode", nodeType: "output" },
      ];

      const withPos = applyEditOperations(opsWithPos, {
        nodes: [],
        edges: [],
      });
      const noPos = applyEditOperations(opsNoPos, { nodes: [], edges: [] });

      expect(withPos.nodes[0].position).toEqual({ x: 500, y: 600 });
      expect(noPos.nodes[0].position).toEqual({ x: 200, y: 200 });
    });

    it("merges provided data with createDefaultNodeData output", () => {
      const ops: EditOperation[] = [
        {
          type: "addNode",
          nodeType: "prompt",
          data: { prompt: "custom text", customTitle: "My Prompt" },
        },
      ];

      const result = applyEditOperations(ops, { nodes: [], edges: [] });

      const added = result.nodes[0];
      // Default prompt ("") should be overridden by provided data
      expect(added.data).toHaveProperty("prompt", "custom text");
      expect(added.data).toHaveProperty("customTitle", "My Prompt");
    });

    it("sets measured dimensions from defaultNodeDimensions", () => {
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "nanoBanana" },
      ];

      const result = applyEditOperations(ops, { nodes: [], edges: [] });

      expect(result.nodes[0].measured).toEqual({ width: 300, height: 300 });
    });

    it("increments applied count", () => {
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "prompt" },
        { type: "addNode", nodeType: "output" },
      ];

      const result = applyEditOperations(ops, { nodes: [], edges: [] });

      expect(result.applied).toBe(2);
      expect(result.nodes).toHaveLength(2);
    });
  });

  // --- removeNode ---

  describe("removeNode operations", () => {
    it("removes existing node from nodes array", () => {
      const ops: EditOperation[] = [
        { type: "removeNode", nodeId: "out-1" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.find((n) => n.id === "out-1")).toBeUndefined();
      expect(result.applied).toBe(1);
    });

    it("also removes all edges connected to that node (source and target)", () => {
      const ops: EditOperation[] = [
        { type: "removeNode", nodeId: "gen-1" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      // gen-1 was source of e2 and target of e1 -- both should be removed
      expect(result.edges).toHaveLength(0);
      expect(result.nodes).toHaveLength(2);
    });

    it("skips with message when nodeId not found", () => {
      const ops: EditOperation[] = [
        { type: "removeNode", nodeId: "nonexistent-42" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toContain("nonexistent-42");
      expect(result.skipped[0]).toContain("not found");
    });

    it("adds skip reason to skipped array", () => {
      const ops: EditOperation[] = [
        { type: "removeNode", nodeId: "ghost-node" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.skipped[0]).toBe(
        'removeNode: node "ghost-node" not found'
      );
    });
  });

  // --- updateNode ---

  describe("updateNode operations", () => {
    it("merges data into existing node data (spread, not replace)", () => {
      const ops: EditOperation[] = [
        {
          type: "updateNode",
          nodeId: "prompt-1",
          data: { prompt: "mountain landscape" },
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      const updated = result.nodes.find((n) => n.id === "prompt-1");
      expect(updated!.data).toHaveProperty("prompt", "mountain landscape");
      expect(result.applied).toBe(1);
    });

    it("preserves other node data fields not in update", () => {
      // Add a node with multiple data fields
      const nodesWithExtra = [
        createTestNode("gen-1", "nanoBanana", {
          inputImages: [],
          outputImage: null,
          aspectRatio: "16:9",
          resolution: "2K",
          status: "idle",
        }),
      ];

      const ops: EditOperation[] = [
        {
          type: "updateNode",
          nodeId: "gen-1",
          data: { aspectRatio: "1:1" },
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: nodesWithExtra,
        edges: [],
      });

      const updated = result.nodes.find((n) => n.id === "gen-1");
      expect(updated!.data).toHaveProperty("aspectRatio", "1:1");
      expect(updated!.data).toHaveProperty("resolution", "2K");
      expect(updated!.data).toHaveProperty("status", "idle");
    });

    it("skips with message when nodeId not found", () => {
      const ops: EditOperation[] = [
        {
          type: "updateNode",
          nodeId: "missing-node",
          data: { prompt: "anything" },
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(
        'updateNode: node "missing-node" not found'
      );
    });
  });

  // --- addEdge ---

  describe("addEdge operations", () => {
    it("creates edge with generated ID pattern", () => {
      const ops: EditOperation[] = [
        { type: "addEdge", source: "prompt-1", target: "out-1" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.edges).toHaveLength(3);
      const newEdge = result.edges[2];
      expect(newEdge.id).toBe("edge-ai-prompt-1-out-1");
      expect(newEdge.source).toBe("prompt-1");
      expect(newEdge.target).toBe("out-1");
      expect(result.applied).toBe(1);
    });

    it("includes sourceHandle/targetHandle when provided", () => {
      const ops: EditOperation[] = [
        {
          type: "addEdge",
          source: "prompt-1",
          target: "gen-1",
          sourceHandle: "text",
          targetHandle: "text",
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: [],
      });

      const newEdge = result.edges[0];
      expect(newEdge.id).toBe("edge-ai-prompt-1-gen-1-text");
      expect(newEdge.sourceHandle).toBe("text");
      expect(newEdge.targetHandle).toBe("text");
    });

    it("generates edge ID with handle suffix when sourceHandle provided", () => {
      const ops: EditOperation[] = [
        {
          type: "addEdge",
          source: "gen-1",
          target: "out-1",
          sourceHandle: "image",
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: [],
      });

      expect(result.edges[0].id).toBe("edge-ai-gen-1-out-1-image");
    });

    it("skips with message when source node not found", () => {
      const ops: EditOperation[] = [
        { type: "addEdge", source: "ghost-src", target: "out-1" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(
        'addEdge: source node "ghost-src" not found'
      );
    });

    it("skips with message when target node not found", () => {
      const ops: EditOperation[] = [
        { type: "addEdge", source: "prompt-1", target: "ghost-tgt" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(
        'addEdge: target node "ghost-tgt" not found'
      );
    });
  });

  // --- removeEdge ---

  describe("removeEdge operations", () => {
    it("removes existing edge", () => {
      const ops: EditOperation[] = [{ type: "removeEdge", edgeId: "e1" }];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].id).toBe("e2");
      expect(result.applied).toBe(1);
    });

    it("skips with message when edgeId not found", () => {
      const ops: EditOperation[] = [
        { type: "removeEdge", edgeId: "nonexistent-edge" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toBe(
        'removeEdge: edge "nonexistent-edge" not found'
      );
    });
  });

  // --- Batch operations ---

  describe("batch operations", () => {
    it("applies multiple operations in sequence (addNode then addEdge referencing new node)", () => {
      // We need to add a node, then connect to it.
      // Since addNode generates IDs with Date.now(), we can't predict the exact ID
      // for the edge. Instead, test that both ops run and counts are correct.
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "imageInput" },
        {
          type: "addEdge",
          source: "prompt-1",
          target: "gen-1",
          sourceHandle: "text",
          targetHandle: "text",
        },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: [],
      });

      expect(result.applied).toBe(2);
      expect(result.nodes).toHaveLength(4); // 3 base + 1 added
      expect(result.edges).toHaveLength(1);
    });

    it("correctly counts applied vs skipped across batch", () => {
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "prompt" }, // applied (0)
        { type: "removeNode", nodeId: "nonexistent" }, // skipped
        { type: "updateNode", nodeId: "prompt-1", data: { prompt: "new" } }, // applied
        { type: "addEdge", source: "ghost", target: "out-1" }, // skipped
        { type: "removeEdge", edgeId: "e1" }, // applied
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.applied).toBe(3);
      expect(result.skipped).toHaveLength(2);
    });

    it("returns correct totals in ApplyEditResult", () => {
      const ops: EditOperation[] = [
        { type: "addNode", nodeType: "output" },
        { type: "removeEdge", edgeId: "e2" },
      ];

      const result = applyEditOperations(ops, {
        nodes: baseNodes,
        edges: baseEdges,
      });

      expect(result.nodes).toHaveLength(4);
      expect(result.edges).toHaveLength(1);
      expect(result.applied).toBe(2);
      expect(result.skipped).toEqual([]);
    });
  });
});

describe("narrateOperations", () => {
  it("produces expected narrative for addNode", () => {
    const ops: EditOperation[] = [
      { type: "addNode", nodeType: "prompt" },
    ];
    expect(narrateOperations(ops)).toBe("Added a prompt node");
  });

  it("produces expected narrative for removeNode", () => {
    const ops: EditOperation[] = [
      { type: "removeNode", nodeId: "gen-1" },
    ];
    expect(narrateOperations(ops)).toBe("Removed node gen-1");
  });

  it("produces expected narrative for updateNode", () => {
    const ops: EditOperation[] = [
      { type: "updateNode", nodeId: "gen-1", data: { aspectRatio: "1:1" } },
    ];
    expect(narrateOperations(ops)).toBe("Updated gen-1 settings");
  });

  it("produces expected narrative for addEdge", () => {
    const ops: EditOperation[] = [
      { type: "addEdge", source: "prompt-1", target: "gen-1" },
    ];
    expect(narrateOperations(ops)).toBe("Connected prompt-1 to gen-1");
  });

  it("produces expected narrative for removeEdge", () => {
    const ops: EditOperation[] = [
      { type: "removeEdge", edgeId: "edge-42" },
    ];
    expect(narrateOperations(ops)).toBe("Removed connection edge-42");
  });

  it("joins multiple operations with newlines", () => {
    const ops: EditOperation[] = [
      { type: "addNode", nodeType: "nanoBanana" },
      { type: "addEdge", source: "img-1", target: "gen-1" },
      { type: "removeNode", nodeId: "old-node" },
    ];

    const result = narrateOperations(ops);
    const lines = result.split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Added a nanoBanana node");
    expect(lines[1]).toBe("Connected img-1 to gen-1");
    expect(lines[2]).toBe("Removed node old-node");
  });
});
