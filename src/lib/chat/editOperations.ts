import { GroupColor, NodeGroup, NodeType, WorkflowNode, WorkflowNodeData } from "@/types";
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
      /**
       * Optional deterministic node ID.
       * When supplied, the apply step will use it instead of generating one.
       */
      nodeId?: string;
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
  | { type: "removeEdge"; edgeId: string }
  | { type: "moveNode"; nodeId: string; position: { x: number; y: number } }
  | {
      type: "createGroup";
      nodeIds: string[];
      groupId?: string;
      name?: string;
      color?: GroupColor;
    }
  | { type: "deleteGroup"; groupId: string }
  | {
      type: "updateGroup";
      groupId: string;
      updates: Partial<
        Pick<NodeGroup, "name" | "color" | "locked" | "position" | "size">
      >;
    }
  | { type: "setNodeGroup"; nodeId: string; groupId?: string }
  /** Removes all nodes, edges, and groups (full canvas reset). */
  | { type: "clearCanvas" };

/**
 * Result of applying edit operations to the workflow.
 */
export interface ApplyEditResult {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: Record<string, NodeGroup>;
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
  storeState: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    groups?: Record<string, NodeGroup>;
  }
): ApplyEditResult {
  let nodes = [...storeState.nodes];
  let edges = [...storeState.edges];
  let groups: Record<string, NodeGroup> = { ...(storeState.groups ?? {}) };
  const skipped: string[] = [];
  let applied = 0;
  let localGroupCounter = Object.keys(groups).length;

  for (const [index, operation] of operations.entries()) {
    switch (operation.type) {
      case "addNode": {
        // Use caller-provided ID when available (agent planning), otherwise generate one.
        const nodeId =
          operation.nodeId ?? `${operation.nodeType}-ai-${Date.now()}-${index}`;

        // Avoid duplicate IDs when caller supplies deterministic IDs.
        if (nodes.some((n) => n.id === nodeId)) {
          skipped.push(`addNode: node "${nodeId}" already exists`);
          break;
        }

        // Get default position and data
        const position = operation.position ?? { x: 200, y: 200 };
        const defaultData = createDefaultNodeData(operation.nodeType);
        const dimensions = defaultNodeDimensions[operation.nodeType];

        // Merge provided data with defaults
        const nodeData = {
          ...defaultData,
          ...operation.data,
        } as WorkflowNodeData;

        const newNode: WorkflowNode = {
          id: nodeId,
          type: operation.nodeType,
          position,
          data: {
            ...nodeData,
            _agentTouched: Date.now(),
          } as WorkflowNodeData,
          style: { width: dimensions.width, height: dimensions.height },
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

      case "clearCanvas": {
        nodes = [];
        edges = [];
        groups = {};
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

        nodes = nodes.map((n) =>
          n.id === operation.nodeId
            ? {
                ...n,
                data: {
                  ...n.data,
                  ...operation.data,
                  _agentTouched: Date.now(),
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
      case "moveNode": {
        const nodeExists = nodes.find((n) => n.id === operation.nodeId);
        if (!nodeExists) {
          skipped.push(`moveNode: node "${operation.nodeId}" not found`);
          break;
        }
        nodes = nodes.map((n) =>
          n.id === operation.nodeId ? { ...n, position: operation.position } : n
        );
        applied++;
        break;
      }
      case "createGroup": {
        const nodeIds = Array.from(new Set(operation.nodeIds ?? []));
        const nodesToGroup = nodes.filter((n) => nodeIds.includes(n.id));
        if (nodesToGroup.length === 0) {
          skipped.push("createGroup: no valid nodeIds provided");
          break;
        }

        const requestedId =
          operation.groupId && operation.groupId.trim().length > 0
            ? operation.groupId.trim()
            : `group-ai-${++localGroupCounter}`;
        const groupId = groups[requestedId]
          ? `${requestedId}-${Date.now()}`
          : requestedId;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const node of nodesToGroup) {
          const defaults = defaultNodeDimensions[node.type as NodeType] ?? {
            width: 300,
            height: 280,
          };
          const width =
            (node.style?.width as number | undefined) ??
            (node.measured?.width as number | undefined) ??
            defaults.width;
          const height =
            (node.style?.height as number | undefined) ??
            (node.measured?.height as number | undefined) ??
            defaults.height;
          minX = Math.min(minX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxX = Math.max(maxX, node.position.x + width);
          maxY = Math.max(maxY, node.position.y + height);
        }
        const padding = 20;
        const newGroup: NodeGroup = {
          id: groupId,
          name: operation.name?.trim() || `Group ${Object.keys(groups).length + 1}`,
          color: operation.color ?? "neutral",
          position: { x: minX - padding, y: minY - padding },
          size: { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 },
          locked: false,
        };
        groups = { ...groups, [groupId]: newGroup };
        nodes = nodes.map((n) =>
          nodeIds.includes(n.id) ? { ...n, groupId } : n
        ) as WorkflowNode[];
        applied++;
        break;
      }
      case "deleteGroup": {
        if (!groups[operation.groupId]) {
          skipped.push(`deleteGroup: group "${operation.groupId}" not found`);
          break;
        }
        const { [operation.groupId]: _, ...rest } = groups;
        groups = rest;
        nodes = nodes.map((n) =>
          n.groupId === operation.groupId ? { ...n, groupId: undefined } : n
        ) as WorkflowNode[];
        applied++;
        break;
      }
      case "updateGroup": {
        const existing = groups[operation.groupId];
        if (!existing) {
          skipped.push(`updateGroup: group "${operation.groupId}" not found`);
          break;
        }
        groups = {
          ...groups,
          [operation.groupId]: { ...existing, ...operation.updates },
        };
        applied++;
        break;
      }
      case "setNodeGroup": {
        const nodeExists = nodes.find((n) => n.id === operation.nodeId);
        if (!nodeExists) {
          skipped.push(`setNodeGroup: node "${operation.nodeId}" not found`);
          break;
        }
        if (operation.groupId && !groups[operation.groupId]) {
          skipped.push(`setNodeGroup: group "${operation.groupId}" not found`);
          break;
        }
        nodes = nodes.map((n) =>
          n.id === operation.nodeId ? { ...n, groupId: operation.groupId } : n
        ) as WorkflowNode[];
        applied++;
        break;
      }
    }
  }

  return {
    nodes,
    edges,
    groups,
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
      case "moveNode":
        return `Moved node ${op.nodeId}`;
      case "createGroup":
        return `Created group for ${op.nodeIds.length} nodes`;
      case "deleteGroup":
        return `Deleted group ${op.groupId}`;
      case "updateGroup":
        return `Updated group ${op.groupId}`;
      case "setNodeGroup":
        return `Updated group membership for ${op.nodeId}`;
      case "clearCanvas":
        return "Cleared canvas (all nodes, edges, groups)";
    }
  });

  return narratives.join("\n");
}
