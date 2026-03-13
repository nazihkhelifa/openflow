/**
 * Subgraph Extractor
 *
 * Splits a workflow into a detailed selected subgraph and a summary of the rest,
 * based on React Flow's node.selected property. When users select nodes before
 * chatting, the LLM gets focused context on the selection with a lightweight
 * summary of the surrounding workflow.
 */

import type { WorkflowNode } from "@/types/nodes";
import type { WorkflowEdge } from "@/types/workflow";

/**
 * Boundary connection between selected and unselected nodes
 */
export interface BoundaryConnection {
  direction: "incoming" | "outgoing";
  selectedNodeId: string;
  otherNodeId: string;
  handleType: string;
}

/**
 * Result of subgraph extraction
 */
export interface SubgraphResult {
  // When selectedNodeIds is empty, these are ALL nodes/edges (no scoping)
  selectedNodes: WorkflowNode[];
  selectedEdges: WorkflowEdge[];
  // Summary of unselected nodes (null when no selection)
  restSummary: {
    nodeCount: number;
    typeBreakdown: Record<string, number>;
    boundaryConnections: BoundaryConnection[];
  } | null;
  isScoped: boolean; // true when selectedNodeIds is non-empty
}

/**
 * Extract subgraph based on selected node IDs
 *
 * @param nodes - All workflow nodes
 * @param edges - All workflow edges
 * @param selectedNodeIds - IDs of selected nodes
 * @returns Subgraph result with selected nodes/edges and rest summary
 */
export function extractSubgraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  selectedNodeIds: string[]
): SubgraphResult {
  // Early return for no selection - return everything
  if (selectedNodeIds.length === 0) {
    return {
      selectedNodes: nodes,
      selectedEdges: edges,
      restSummary: null,
      isScoped: false,
    };
  }

  // Build selectedSet for O(1) lookup
  const selectedSet = new Set(selectedNodeIds);

  // Filter nodes into selected vs unselected
  const selectedNodes: WorkflowNode[] = [];
  const unselectedNodes: WorkflowNode[] = [];

  for (const node of nodes) {
    if (selectedSet.has(node.id)) {
      selectedNodes.push(node);
    } else {
      unselectedNodes.push(node);
    }
  }

  // Filter edges: both endpoints in selectedSet -> selectedEdges
  const selectedEdges: WorkflowEdge[] = [];
  const boundaryEdges: WorkflowEdge[] = [];

  for (const edge of edges) {
    const sourceSelected = selectedSet.has(edge.source);
    const targetSelected = selectedSet.has(edge.target);

    if (sourceSelected && targetSelected) {
      // Both endpoints selected -> fully within selection
      selectedEdges.push(edge);
    } else if (sourceSelected || targetSelected) {
      // Exactly one endpoint selected -> boundary edge
      boundaryEdges.push(edge);
    }
    // else: neither selected -> ignore
  }

  // Build type breakdown from unselected nodes
  const typeBreakdown: Record<string, number> = {};
  for (const node of unselectedNodes) {
    const type = node.type;
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  }

  // Build boundaryConnections from boundary edges with direction
  const boundaryConnections: BoundaryConnection[] = boundaryEdges.map((edge) => {
    const sourceSelected = selectedSet.has(edge.source);
    const targetSelected = selectedSet.has(edge.target);

    if (targetSelected) {
      // Target is selected, source is not -> incoming
      return {
        direction: "incoming" as const,
        selectedNodeId: edge.target,
        otherNodeId: edge.source,
        handleType: edge.targetHandle || "unknown",
      };
    } else {
      // Source is selected, target is not -> outgoing
      return {
        direction: "outgoing" as const,
        selectedNodeId: edge.source,
        otherNodeId: edge.target,
        handleType: edge.sourceHandle || "unknown",
      };
    }
  });

  return {
    selectedNodes,
    selectedEdges,
    restSummary: {
      nodeCount: unselectedNodes.length,
      typeBreakdown,
      boundaryConnections,
    },
    isScoped: true,
  };
}
