import type { WorkflowNode, WorkflowEdge, SwitchNodeData, ConditionalSwitchNodeData } from "@/types";

/**
 * Compute set of node IDs that should be visually dimmed.
 * A node is dimmed if ALL its input paths trace back to disabled Switch outputs.
 * Smart cascade: if a node has at least one active input from a non-disabled source, it stays active.
 */
export function computeDimmedNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Set<string> {
  // Step 1: Find all nodes that are downstream of disabled Switch outputs
  const potentiallyDimmed = new Set<string>();

  nodes.forEach(node => {
    if (node.type === "switch") {
      const switchData = node.data as SwitchNodeData;
      if (!switchData.switches) return;

      switchData.switches.forEach(sw => {
        if (sw.enabled) return; // Only process disabled switches

        // Find edges from this disabled output handle
        const disabledEdges = edges.filter(
          e => e.source === node.id && e.sourceHandle === sw.id
        );

        // DFS traverse downstream from each disabled edge target
        disabledEdges.forEach(edge => {
          traverseDownstream(edge.target, edges, potentiallyDimmed);
        });
      });
    }

    if (node.type === "conditionalSwitch") {
      const condData = node.data as ConditionalSwitchNodeData;
      if (!condData.rules) return;

      // When evaluation is paused, skip dimming entirely — all paths stay active
      if (condData.evaluationPaused) return;

      // Non-matching rules: their downstream should be dimmed
      condData.rules.forEach(rule => {
        if (rule.isMatched) return; // Only process non-matching rules

        const disabledEdges = edges.filter(
          e => e.source === node.id && e.sourceHandle === rule.id
        );

        disabledEdges.forEach(edge => {
          traverseDownstream(edge.target, edges, potentiallyDimmed);
        });
      });

      // Default output: dimmed when ANY rule matches (because default only active when NO rules match)
      const anyRuleMatches = condData.rules.some(r => r.isMatched);
      if (anyRuleMatches) {
        const defaultEdges = edges.filter(
          e => e.source === node.id && e.sourceHandle === "default"
        );
        defaultEdges.forEach(edge => {
          traverseDownstream(edge.target, edges, potentiallyDimmed);
        });
      }
    }
  });

  // Step 2: Type-aware smart cascade — only un-dim if an active input replaces
  // the SAME data type that was blocked by the disabled Switch output.
  // e.g. a Prompt (text) does NOT rescue a node whose image input is disabled.
  //
  // Process nodes in topological order (upstream first) so that by the time we
  // evaluate a node, all its sources have already been resolved into finalDimmed.
  // This fixes the convergence bug where a rescued node's downstream was still
  // treated as dimmed due to arbitrary iteration order.
  const finalDimmed = new Set<string>();
  const sortedDimmed = topologicalSort(potentiallyDimmed, edges);

  sortedDimmed.forEach(nodeId => {
    const incomingEdges = edges.filter(e => e.target === nodeId);

    // Collect which handle types are blocked on this node
    // (from disabled Switch outputs, non-matching ConditionalSwitch outputs, or from transitively dimmed sources)
    const blockedTypes = new Set<string>();
    incomingEdges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (sourceNode?.type === "switch") {
        const switchData = sourceNode.data as SwitchNodeData;
        const switchEntry = switchData.switches?.find(s => s.id === edge.sourceHandle);
        if (switchEntry && !switchEntry.enabled && edge.targetHandle) {
          blockedTypes.add(edge.targetHandle);
        }
      } else if (sourceNode?.type === "conditionalSwitch") {
        const condData = sourceNode.data as ConditionalSwitchNodeData;

        // When evaluation is paused, outputs are not inactive
        if (!condData.evaluationPaused) {
          const rule = condData.rules?.find(r => r.id === edge.sourceHandle);
          const isDefaultHandle = edge.sourceHandle === "default";

          // Check if this output is inactive
          let isInactive = false;
          if (rule) {
            isInactive = !rule.isMatched;
          } else if (isDefaultHandle) {
            // Default is inactive when any rule matches
            isInactive = condData.rules?.some(r => r.isMatched) ?? false;
          }

          if (isInactive && edge.targetHandle) {
            blockedTypes.add(edge.targetHandle);
          }
        }
      }
      // Standalone: if source node itself is dimmed, block regardless of output state
      if (finalDimmed.has(edge.source) && edge.targetHandle) {
        blockedTypes.add(edge.targetHandle);
      }
    });

    // If no handle types are blocked, this node has no reason to be dimmed
    if (blockedTypes.size === 0) return;

    // Check if any active input provides the same type as a blocked type
    const hasReplacementInput = incomingEdges.some(edge => {
      // Skip dimmed sources
      if (finalDimmed.has(edge.source)) return false;
      // Skip disabled Switch outputs
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (sourceNode?.type === "switch") {
        const switchData = sourceNode.data as SwitchNodeData;
        const switchEntry = switchData.switches?.find(s => s.id === edge.sourceHandle);
        if (switchEntry && !switchEntry.enabled) return false;
      }
      // Skip non-matching ConditionalSwitch outputs (but not when paused — all outputs active)
      if (sourceNode?.type === "conditionalSwitch") {
        const condData = sourceNode.data as ConditionalSwitchNodeData;
        if (!condData.evaluationPaused) {
          const rule = condData.rules?.find(r => r.id === edge.sourceHandle);
          const isDefaultHandle = edge.sourceHandle === "default";

          // Check if this output is inactive
          let isInactive = false;
          if (rule) {
            isInactive = !rule.isMatched;
          } else if (isDefaultHandle) {
            // Default is inactive when any rule matches
            isInactive = condData.rules?.some(r => r.isMatched) ?? false;
          }

          if (isInactive) return false;
        }
      }
      // Active input — only counts if it provides a blocked type
      return edge.targetHandle ? blockedTypes.has(edge.targetHandle) : false;
    });

    if (!hasReplacementInput) {
      finalDimmed.add(nodeId);
    }
  });

  return finalDimmed;
}

/**
 * Topological sort of a subset of nodes using Kahn's algorithm.
 * Only considers edges between nodes in the subset.
 * Returns nodes ordered upstream-first.
 */
function topologicalSort(
  nodeIds: Set<string>,
  edges: WorkflowEdge[]
): string[] {
  // Build in-degree map considering only edges within the subset
  const inDegree = new Map<string, number>();
  nodeIds.forEach(id => inDegree.set(id, 0));

  const relevantEdges = edges.filter(
    e => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  relevantEdges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  });

  // Start with nodes that have no incoming edges from within the subset
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    relevantEdges
      .filter(e => e.source === current)
      .forEach(e => {
        const newDeg = (inDegree.get(e.target) ?? 1) - 1;
        inDegree.set(e.target, newDeg);
        if (newDeg === 0) queue.push(e.target);
      });
  }

  // Append any remaining nodes (cycles) to ensure all are processed
  nodeIds.forEach(id => {
    if (!sorted.includes(id)) sorted.push(id);
  });

  return sorted;
}

/**
 * DFS traversal to find all downstream nodes from a starting node.
 * Uses visited set for cycle detection.
 */
function traverseDownstream(
  nodeId: string,
  edges: WorkflowEdge[],
  visited: Set<string>
): void {
  if (visited.has(nodeId)) return; // Cycle detection
  visited.add(nodeId);

  edges
    .filter(e => e.source === nodeId)
    .forEach(edge => traverseDownstream(edge.target, edges, visited));
}
