import { describe, it, expect } from "vitest";
import { optimizeOpsForApply } from "../route";
import type { EditOperation } from "@/lib/chat/editOperations";

describe("optimizeOpsForApply", () => {
  it("deduplicates identical addEdge operations", () => {
    const ops: EditOperation[] = [
      { type: "addEdge", source: "a", target: "b", sourceHandle: "text", targetHandle: "text" },
      { type: "addEdge", source: "a", target: "b", sourceHandle: "text", targetHandle: "text" },
    ];
    const optimized = optimizeOpsForApply(ops, { nodes: [], edges: [] });
    expect(optimized).toHaveLength(1);
    expect(optimized[0].type).toBe("addEdge");
  });

  it("merges sequential updateNode operations by nodeId", () => {
    const ops: EditOperation[] = [
      { type: "updateNode", nodeId: "prompt-1", data: { prompt: "hello" } },
      { type: "updateNode", nodeId: "prompt-1", data: { temperature: 0.4 } as any },
    ];
    const optimized = optimizeOpsForApply(ops, { nodes: [], edges: [] });
    expect(optimized).toHaveLength(1);
    expect(optimized[0].type).toBe("updateNode");
    const data = (optimized[0] as any).data;
    expect(data.prompt).toBe("hello");
    expect(data.temperature).toBe(0.4);
  });

  it("drops no-op updateNode when data already matches current state", () => {
    const ops: EditOperation[] = [
      { type: "updateNode", nodeId: "prompt-1", data: { prompt: "same" } },
    ];
    const optimized = optimizeOpsForApply(ops, {
      nodes: [
        { id: "prompt-1", data: { prompt: "same" } } as any,
      ],
      edges: [],
    });
    expect(optimized).toHaveLength(0);
  });

  it("flushes pending updates before clearCanvas and resets edge dedupe so the same edge can repeat after clear", () => {
    const ops: EditOperation[] = [
      { type: "updateNode", nodeId: "a", data: { prompt: "x" } },
      { type: "addEdge", source: "a", target: "b", sourceHandle: "text", targetHandle: "text" },
      { type: "clearCanvas" },
      { type: "addEdge", source: "a", target: "b", sourceHandle: "text", targetHandle: "text" },
      { type: "addEdge", source: "a", target: "b", sourceHandle: "text", targetHandle: "text" },
    ];
    const optimized = optimizeOpsForApply(ops, {
      nodes: [
        { id: "a", data: {} },
        { id: "b", data: {} },
      ] as any,
      edges: [],
    });
    expect(optimized.map((o) => o.type)).toEqual([
      "updateNode",
      "addEdge",
      "clearCanvas",
      "addEdge",
    ]);
  });
});

