import { NodeType, WorkflowNode, WorkflowNodeData } from "@/types";
import { WorkflowEdge } from "@/types/workflow";
import { createDefaultNodeData } from "@/store/utils/nodeDefaults";
import { defaultNodeDimensions } from "@/store/utils/nodeDefaults";

/**
 * Edit operation types for workflow modifications.
 * Each operation represents a single atomic change to the workflow.
 */
export type EditOperation =
  | {
      type: "addNode";
      nodeType: NodeType;
      position?: { x: number; y: number };
      data?: Record<string, unknown>;
    }
  | { type: "removeNode"; nodeId: string }
  | { type: "updateNode"; nodeId: string; data: Record<string, unknown> }
  | {
      type: "addEdge";
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | { type: "removeEdge"; edgeId: string };

/**
 * Result of applying edit operations to the workflow.
 */
export interface ApplyEditResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  applied: number;
  skipped: string[];
}

/**
 * Applies a batch of edit operations to the current workflow state.
 * Uses immutable updates (single pass, not individual setState calls).
 * Invalid operations are skipped with reasons tracked.
 *
 * @param operations - List of edit operations to apply
 * @param storeState - Current workflow state (nodes and edges)
 * @returns Updated nodes, edges, count of applied operations, and skipped operations with reasons
 */
export function applyEditOperations(
  operations: EditOperation[],
  storeState: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }
): ApplyEditResult {
  let nodes = [...storeState.nodes];
  let edges = [...storeState.edges];
  const skipped: string[] = [];
  let applied = 0;

  for (const [index, operation] of operations.entries()) {
    switch (operation.type) {
      case "addNode": {
        // Generate unique ID with timestamp and index
        const nodeId = `${operation.nodeType}-ai-${Date.now()}-${index}`;

        // Get default position and data
        const position = operation.position ?? { x: 200, y: 200 };
        const defaultData = createDefaultNodeData(operation.nodeType);
        const dimensions = defaultNodeDimensions[operation.nodeType];

        // Merge provided data with defaults
        const nodeData = {
          ...defaultData,
          ...operation.data,
        } as WorkflowNodeData;

        // Create new node
        const newNode: WorkflowNode = {
          id: nodeId,
          type: operation.nodeType,
          position,
          data: nodeData,
          measured: dimensions,
        };

        nodes.push(newNode);
        applied++;
        break;
      }

      case "removeNode": {
        const nodeExists = nodes.find((n) => n.id === operation.nodeId);
        if (!nodeExists) {
          skipped.push(
            `removeNode: node "${operation.nodeId}" not found`
          );
          break;
        }

        // Remove node and its connected edges
        nodes = nodes.filter((n) => n.id !== operation.nodeId);
        edges = edges.filter(
          (e) => e.source !== operation.nodeId && e.target !== operation.nodeId
        );
        applied++;
        break;
      }

      case "updateNode": {
        const nodeIndex = nodes.findIndex((n) => n.id === operation.nodeId);
        if (nodeIndex === -1) {
          skipped.push(
            `updateNode: node "${operation.nodeId}" not found`
          );
          break;
        }

        // Update node data immutably
        nodes = nodes.map((n) =>
          n.id === operation.nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...operation.data,
                } as WorkflowNodeData,
              }
            : n
        );
        applied++;
        break;
      }

      case "addEdge": {
        // Validate source and target nodes exist
        const sourceExists = nodes.find((n) => n.id === operation.source);
        const targetExists = nodes.find((n) => n.id === operation.target);

        if (!sourceExists) {
          skipped.push(
            `addEdge: source node "${operation.source}" not found`
          );
          break;
        }
        if (!targetExists) {
          skipped.push(
            `addEdge: target node "${operation.target}" not found`
          );
          break;
        }

        // Generate edge ID
        const handleSuffix = operation.sourceHandle
          ? `-${operation.sourceHandle}`
          : "";
        const edgeId = `edge-ai-${operation.source}-${operation.target}${handleSuffix}`;

        // Create new edge
        const newEdge: WorkflowEdge = {
          id: edgeId,
          source: operation.source,
          target: operation.target,
          sourceHandle: operation.sourceHandle,
          targetHandle: operation.targetHandle,
        };

        edges.push(newEdge);
        applied++;
        break;
      }

      case "removeEdge": {
        const edgeExists = edges.find((e) => e.id === operation.edgeId);
        if (!edgeExists) {
          skipped.push(
            `removeEdge: edge "${operation.edgeId}" not found`
          );
          break;
        }

        edges = edges.filter((e) => e.id !== operation.edgeId);
        applied++;
        break;
      }
    }
  }

  return {
    nodes,
    edges,
    applied,
    skipped,
  };
}

/**
 * Generates a human-readable summary of what operations were applied.
 *
 * @param operations - List of edit operations
 * @returns Human-readable summary string
 */
export function narrateOperations(operations: EditOperation[]): string {
  const narratives = operations.map((op) => {
    switch (op.type) {
      case "addNode":
        return `Added a ${op.nodeType} node`;
      case "removeNode":
        return `Removed node ${op.nodeId}`;
      case "updateNode":
        return `Updated ${op.nodeId} settings`;
      case "addEdge":
        return `Connected ${op.source} to ${op.target}`;
      case "removeEdge":
        return `Removed connection ${op.edgeId}`;
    }
  });

  return narratives.join("\n");
}
