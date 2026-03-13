/**
 * Tests for subgraphExtractor.ts
 *
 * Validates selection-aware subgraph extraction for context scoping.
 */

import { describe, it, expect } from "vitest";
import type { WorkflowNode } from "@/types/nodes";
import type { WorkflowEdge } from "@/types/workflow";
import { extractSubgraph, SubgraphResult } from "./subgraphExtractor";

// Helper to create test nodes
function createNode(id: string, type: string, selected = false): WorkflowNode {
  return {
    id,
    type: type as any,
    position: { x: 0, y: 0 },
    data: {},
    selected,
  };
}

// Helper to create test edges
function createEdge(
  source: string,
  target: string,
  sourceHandle = "image",
  targetHandle = "image"
): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  };
}

describe("extractSubgraph", () => {
  describe("No selection (empty array)", () => {
    it("returns all nodes and edges when selectedNodeIds is empty", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("B", "C", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, []);

      expect(result.isScoped).toBe(false);
      expect(result.selectedNodes).toHaveLength(3);
      expect(result.selectedEdges).toHaveLength(2);
      expect(result.restSummary).toBeNull();
    });
  });

  describe("Select all nodes", () => {
    it("returns all nodes with isScoped=true and empty restSummary", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("B", "C", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["A", "B", "C"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(3);
      expect(result.selectedEdges).toHaveLength(2);
      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(0);
      expect(result.restSummary!.boundaryConnections).toHaveLength(0);
    });
  });

  describe("Select one node in chain", () => {
    it("selects middle node with incoming and outgoing boundary connections", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("B", "C", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["B"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(1);
      expect(result.selectedNodes[0].id).toBe("B");
      expect(result.selectedEdges).toHaveLength(0); // No edges fully within selection

      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(2);
      expect(result.restSummary!.boundaryConnections).toHaveLength(2);

      const incoming = result.restSummary!.boundaryConnections.find(
        (c) => c.direction === "incoming"
      );
      expect(incoming).toBeDefined();
      expect(incoming!.selectedNodeId).toBe("B");
      expect(incoming!.otherNodeId).toBe("A");
      expect(incoming!.handleType).toBe("text");

      const outgoing = result.restSummary!.boundaryConnections.find(
        (c) => c.direction === "outgoing"
      );
      expect(outgoing).toBeDefined();
      expect(outgoing!.selectedNodeId).toBe("B");
      expect(outgoing!.otherNodeId).toBe("C");
      expect(outgoing!.handleType).toBe("image");
    });
  });

  describe("Select two connected nodes", () => {
    it("includes edge between selected nodes", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("B", "C", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["A", "B"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(2);
      expect(result.selectedEdges).toHaveLength(1);
      expect(result.selectedEdges[0].id).toBe("A-B");

      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(1);
      expect(result.restSummary!.boundaryConnections).toHaveLength(1);

      const boundary = result.restSummary!.boundaryConnections[0];
      expect(boundary.direction).toBe("outgoing");
      expect(boundary.selectedNodeId).toBe("B");
      expect(boundary.otherNodeId).toBe("C");
    });
  });

  describe("Select subset of chain", () => {
    it("correctly identifies boundary connections for middle segment", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "annotation"),
        createNode("D", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("B", "C", "image", "image"),
        createEdge("C", "D", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["B", "C"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(2);
      expect(result.selectedEdges).toHaveLength(1);
      expect(result.selectedEdges[0].id).toBe("B-C");

      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(2);
      expect(result.restSummary!.boundaryConnections).toHaveLength(2);

      const incoming = result.restSummary!.boundaryConnections.find(
        (c) => c.direction === "incoming" && c.selectedNodeId === "B"
      );
      expect(incoming).toBeDefined();
      expect(incoming!.otherNodeId).toBe("A");

      const outgoing = result.restSummary!.boundaryConnections.find(
        (c) => c.direction === "outgoing" && c.selectedNodeId === "C"
      );
      expect(outgoing).toBeDefined();
      expect(outgoing!.otherNodeId).toBe("D");
    });
  });

  describe("Type breakdown", () => {
    it("correctly counts node types in unselected nodes", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "prompt"),
        createNode("C", "nanoBanana"),
        createNode("D", "nanoBanana"),
        createNode("E", "nanoBanana"),
        createNode("F", "output"),
      ];
      const edges: WorkflowEdge[] = [];

      const result = extractSubgraph(nodes, edges, ["A"]);

      expect(result.isScoped).toBe(true);
      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(5);
      expect(result.restSummary!.typeBreakdown).toEqual({
        prompt: 1,
        nanoBanana: 3,
        output: 1,
      });
    });
  });

  describe("Disconnected selected nodes", () => {
    it("handles selection with no edges between selected nodes", () => {
      const nodes: WorkflowNode[] = [
        createNode("A", "prompt"),
        createNode("B", "nanoBanana"),
        createNode("C", "prompt"),
        createNode("D", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("A", "B", "text", "text"),
        createEdge("C", "D", "text", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["A", "C"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(2);
      expect(result.selectedEdges).toHaveLength(0); // No edges between A and C

      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(2);
      expect(result.restSummary!.boundaryConnections).toHaveLength(2);

      // Both are outgoing since A->B and C->D
      const outgoingConnections = result.restSummary!.boundaryConnections.filter(
        (c) => c.direction === "outgoing"
      );
      expect(outgoingConnections).toHaveLength(2);
    });
  });

  describe("Complex multi-handle scenario", () => {
    it("handles multiple connections to same node with different handle types", () => {
      const nodes: WorkflowNode[] = [
        createNode("prompt1", "prompt"),
        createNode("prompt2", "prompt"),
        createNode("img1", "imageInput"),
        createNode("gen", "nanoBanana"),
        createNode("out", "output"),
      ];
      const edges: WorkflowEdge[] = [
        createEdge("prompt1", "gen", "text", "text"),
        createEdge("prompt2", "gen", "text", "text"),
        createEdge("img1", "gen", "image", "image"),
        createEdge("gen", "out", "image", "image"),
      ];

      const result = extractSubgraph(nodes, edges, ["gen"]);

      expect(result.isScoped).toBe(true);
      expect(result.selectedNodes).toHaveLength(1);
      expect(result.selectedEdges).toHaveLength(0);

      expect(result.restSummary).not.toBeNull();
      expect(result.restSummary!.nodeCount).toBe(4);
      expect(result.restSummary!.boundaryConnections).toHaveLength(4);

      // 3 incoming (2 text from prompts, 1 image from img1)
      const incoming = result.restSummary!.boundaryConnections.filter(
        (c) => c.direction === "incoming"
      );
      expect(incoming).toHaveLength(3);

      // 1 outgoing (to out)
      const outgoing = result.restSummary!.boundaryConnections.filter(
        (c) => c.direction === "outgoing"
      );
      expect(outgoing).toHaveLength(1);
    });
  });
});
