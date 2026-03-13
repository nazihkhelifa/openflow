/**
 * Execution Utilities
 *
 * Pure utility functions used by the workflow execution engine.
 * Extracted from workflowStore.ts for testability and reuse.
 */

import { WorkflowNode, WorkflowEdge, WorkflowNodeData } from "@/types";

// Concurrency settings
export const CONCURRENCY_SETTINGS_KEY = "openflows-concurrency-limit";
export const DEFAULT_MAX_CONCURRENT_CALLS = 3;

/**
 * Load concurrency setting from localStorage
 */
export const loadConcurrencySetting = (): number => {
  if (typeof window === "undefined") return DEFAULT_MAX_CONCURRENT_CALLS;
  const stored = localStorage.getItem(CONCURRENCY_SETTINGS_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
      return parsed;
    }
  }
  return DEFAULT_MAX_CONCURRENT_CALLS;
};

/**
 * Save concurrency setting to localStorage
 */
export const saveConcurrencySetting = (value: number): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONCURRENCY_SETTINGS_KEY, String(value));
};

/**
 * Level grouping for parallel execution
 */
export interface LevelGroup {
  level: number;
  nodeIds: string[];
}

/**
 * Groups nodes by dependency level using Kahn's algorithm variant.
 * Nodes at the same level can be executed in parallel.
 * Level 0 = nodes with no incoming edges (roots)
 * Level N = nodes whose dependencies are all at levels < N
 */
export function groupNodesByLevel(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): LevelGroup[] {
  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    adjList.set(n.id, []);
  });

  edges.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    adjList.get(e.source)?.push(e.target);
  });

  // BFS with level tracking (Kahn's algorithm variant)
  const levels: LevelGroup[] = [];
  let currentLevel = nodes
    .filter((n) => inDegree.get(n.id) === 0)
    .map((n) => n.id);

  let levelNum = 0;
  while (currentLevel.length > 0) {
    levels.push({ level: levelNum, nodeIds: [...currentLevel] });

    const nextLevel: string[] = [];
    for (const nodeId of currentLevel) {
      for (const child of adjList.get(nodeId) || []) {
        if (!inDegree.has(child)) continue; // skip orphan edge targets
        const newDegree = inDegree.get(child)! - 1;
        inDegree.set(child, newDegree);
        if (newDegree === 0) {
          nextLevel.push(child);
        }
      }
    }

    currentLevel = nextLevel;
    levelNum++;
  }

  return levels;
}

/**
 * Chunk an array into smaller arrays of specified size
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size < 1) {
    throw new Error("Invalid chunk size: must be a positive integer");
  }
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Revoke a blob URL if the value is one, to free the underlying memory.
 */
export function revokeBlobUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}

/**
 * Clear all imageRefs from nodes (used when saving to a different directory)
 */
export function clearNodeImageRefs(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map(node => {
    const data = { ...node.data } as Record<string, unknown>;

    // Revoke blob URLs for video/3D outputs before clearing
    revokeBlobUrl(data.outputVideo as string | undefined);
    revokeBlobUrl(data.glbUrl as string | undefined);

    // Clear all ref fields regardless of node type
    delete data.imageRef;
    delete data.sourceImageRef;
    delete data.outputImageRef;
    delete data.inputImageRefs;

    return { ...node, data: data as WorkflowNodeData } as WorkflowNode;
  });
}
