import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  groupNodesByLevel,
  chunk,
  revokeBlobUrl,
  clearNodeImageRefs,
  loadConcurrencySetting,
  saveConcurrencySetting,
  DEFAULT_MAX_CONCURRENT_CALLS,
  CONCURRENCY_SETTINGS_KEY,
} from "../executionUtils";
import type { WorkflowNode, WorkflowEdge } from "@/types";

function makeNode(id: string, type = "prompt"): WorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  } as WorkflowNode;
}

function makeEdge(source: string, target: string): WorkflowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle: "text",
    targetHandle: "text",
  } as WorkflowEdge;
}

describe("groupNodesByLevel", () => {
  it("should put all nodes at level 0 when there are no edges", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const result = groupNodesByLevel(nodes, []);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe(0);
    expect(result[0].nodeIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("should handle a linear chain", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const result = groupNodesByLevel(nodes, edges);
    expect(result).toHaveLength(3);
    expect(result[0].nodeIds).toEqual(["a"]);
    expect(result[1].nodeIds).toEqual(["b"]);
    expect(result[2].nodeIds).toEqual(["c"]);
  });

  it("should group parallel nodes at the same level", () => {
    // a -> b, a -> c (b and c are parallel)
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("a", "b"), makeEdge("a", "c")];
    const result = groupNodesByLevel(nodes, edges);
    expect(result).toHaveLength(2);
    expect(result[0].nodeIds).toEqual(["a"]);
    expect(result[1].nodeIds.sort()).toEqual(["b", "c"]);
  });

  it("should handle diamond dependencies", () => {
    // a -> b, a -> c, b -> d, c -> d
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [
      makeEdge("a", "b"),
      makeEdge("a", "c"),
      makeEdge("b", "d"),
      makeEdge("c", "d"),
    ];
    const result = groupNodesByLevel(nodes, edges);
    expect(result).toHaveLength(3);
    expect(result[0].nodeIds).toEqual(["a"]);
    expect(result[1].nodeIds.sort()).toEqual(["b", "c"]);
    expect(result[2].nodeIds).toEqual(["d"]);
  });

  it("should handle empty inputs", () => {
    const result = groupNodesByLevel([], []);
    expect(result).toEqual([]);
  });
});

describe("chunk", () => {
  it("should split array into chunks of specified size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("should handle array smaller than chunk size", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("should handle empty array", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("should handle chunk size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it("should handle exact multiples", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("should throw on size 0", () => {
    expect(() => chunk([1, 2], 0)).toThrow("Invalid chunk size: must be a positive integer");
  });

  it("should throw on negative size", () => {
    expect(() => chunk([1, 2], -1)).toThrow("Invalid chunk size: must be a positive integer");
  });

  it("should throw on NaN size", () => {
    expect(() => chunk([1, 2], NaN)).toThrow("Invalid chunk size: must be a positive integer");
  });

  it("should throw on Infinity size", () => {
    expect(() => chunk([1, 2], Infinity)).toThrow("Invalid chunk size: must be a positive integer");
  });
});

describe("revokeBlobUrl", () => {
  it("should revoke blob URLs", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeBlobUrl("blob:http://localhost/abc");
    expect(spy).toHaveBeenCalledWith("blob:http://localhost/abc");
    spy.mockRestore();
  });

  it("should not revoke non-blob URLs", () => {
    const spy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokeBlobUrl("http://example.com/image.png");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("should handle null", () => {
    expect(() => revokeBlobUrl(null)).not.toThrow();
  });

  it("should handle undefined", () => {
    expect(() => revokeBlobUrl(undefined)).not.toThrow();
  });
});

describe("clearNodeImageRefs", () => {
  it("should clear imageRef fields", () => {
    const nodes = [
      {
        ...makeNode("a"),
        data: {
          imageRef: "some-ref",
          sourceImageRef: "src-ref",
          outputImageRef: "out-ref",
          inputImageRefs: ["ref1"],
          prompt: "keep this",
        },
      },
    ] as unknown as WorkflowNode[];

    const result = clearNodeImageRefs(nodes);
    const data = result[0].data as Record<string, unknown>;
    expect(data.imageRef).toBeUndefined();
    expect(data.sourceImageRef).toBeUndefined();
    expect(data.outputImageRef).toBeUndefined();
    expect(data.inputImageRefs).toBeUndefined();
    expect(data.prompt).toBe("keep this");
  });

  it("should not mutate original nodes", () => {
    const original = [
      {
        ...makeNode("a"),
        data: { imageRef: "ref" },
      },
    ] as unknown as WorkflowNode[];

    clearNodeImageRefs(original);
    expect((original[0].data as Record<string, unknown>).imageRef).toBe("ref");
  });
});

describe("concurrency settings", () => {
  let mockStorage: Record<string, string>;

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value; },
    });
  });

  it("should return default when no setting stored", () => {
    expect(loadConcurrencySetting()).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
  });

  it("should load stored setting", () => {
    mockStorage[CONCURRENCY_SETTINGS_KEY] = "5";
    expect(loadConcurrencySetting()).toBe(5);
  });

  it("should reject out-of-range values", () => {
    mockStorage[CONCURRENCY_SETTINGS_KEY] = "0";
    expect(loadConcurrencySetting()).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
    mockStorage[CONCURRENCY_SETTINGS_KEY] = "11";
    expect(loadConcurrencySetting()).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
  });

  it("should reject invalid values", () => {
    mockStorage[CONCURRENCY_SETTINGS_KEY] = "abc";
    expect(loadConcurrencySetting()).toBe(DEFAULT_MAX_CONCURRENT_CALLS);
  });

  it("should save setting", () => {
    saveConcurrencySetting(7);
    expect(mockStorage[CONCURRENCY_SETTINGS_KEY]).toBe("7");
  });
});
