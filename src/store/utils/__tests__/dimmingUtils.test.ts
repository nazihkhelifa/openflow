import { describe, it, expect } from "vitest";
import { computeDimmedNodes } from "../dimmingUtils";
import type { WorkflowNode, WorkflowEdge } from "@/types";

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): WorkflowNode {
  return { id, type, position: { x: 0, y: 0 }, data } as WorkflowNode;
}

function makeEdge(
  source: string,
  target: string,
  opts: { sourceHandle?: string; targetHandle?: string } = {}
): WorkflowEdge {
  return {
    id: `${source}-${target}-${opts.sourceHandle ?? "out"}-${opts.targetHandle ?? "in"}`,
    source,
    target,
    sourceHandle: opts.sourceHandle ?? "image",
    targetHandle: opts.targetHandle ?? "image",
  } as WorkflowEdge;
}

function makeSwitchNode(
  id: string,
  switches: Array<{ id: string; enabled: boolean }>
): WorkflowNode {
  return makeNode(id, "switch", {
    switches: switches.map(s => ({ ...s, label: s.id })),
  });
}

function makeConditionalSwitchNode(
  id: string,
  rules: Array<{ id: string; isMatched: boolean }>,
  opts: { evaluationPaused?: boolean } = {}
): WorkflowNode {
  return makeNode(id, "conditionalSwitch", {
    rules: rules.map(r => ({ ...r, label: r.id })),
    evaluationPaused: opts.evaluationPaused ?? false,
  });
}

describe("computeDimmedNodes", () => {
  it("returns empty set when there are no switch nodes", () => {
    const nodes = [makeNode("a", "prompt"), makeNode("b", "nanoBanana")];
    const edges = [makeEdge("a", "b", { sourceHandle: "text", targetHandle: "text" })];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.size).toBe(0);
  });

  it("dims nodes downstream of a disabled switch output", () => {
    // switch --[disabled]--> gen --> output
    const nodes = [
      makeSwitchNode("sw", [{ id: "out1", enabled: false }]),
      makeNode("gen", "nanoBanana"),
      makeNode("out", "output"),
    ];
    const edges = [
      makeEdge("sw", "gen", { sourceHandle: "out1" }),
      makeEdge("gen", "out"),
    ];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("gen")).toBe(true);
    expect(dimmed.has("out")).toBe(true);
  });

  it("does not dim nodes downstream of an enabled switch output", () => {
    const nodes = [
      makeSwitchNode("sw", [{ id: "out1", enabled: true }]),
      makeNode("gen", "nanoBanana"),
    ];
    const edges = [makeEdge("sw", "gen", { sourceHandle: "out1" })];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.size).toBe(0);
  });

  it("rescues a node that has an active input replacing the blocked type (convergence)", () => {
    // Two paths from a switch converge on "merge":
    //   switch --[out1:disabled]--> dimmedPath --> merge
    //   switch --[out2:enabled]---> activePath --> merge
    const nodes = [
      makeSwitchNode("sw", [
        { id: "out1", enabled: false },
        { id: "out2", enabled: true },
      ]),
      makeNode("dimmedPath", "nanoBanana"),
      makeNode("activePath", "nanoBanana"),
      makeNode("merge", "nanoBanana"),
    ];
    const edges = [
      makeEdge("sw", "dimmedPath", { sourceHandle: "out1" }),
      makeEdge("sw", "activePath", { sourceHandle: "out2" }),
      makeEdge("dimmedPath", "merge"),
      makeEdge("activePath", "merge"),
    ];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("dimmedPath")).toBe(true);
    expect(dimmed.has("activePath")).toBe(false);
    expect(dimmed.has("merge")).toBe(false);
  });

  it("keeps nodes downstream of a rescued convergence node active (the main bug)", () => {
    // switch --[out1:disabled]--> A --> converge --> downstream
    // switch --[out2:enabled]---> B --> converge --> downstream
    //
    // "converge" is rescued because it has active input from B.
    // "downstream" must also stay active — it was dimmed before this fix.
    const nodes = [
      makeSwitchNode("sw", [
        { id: "out1", enabled: false },
        { id: "out2", enabled: true },
      ]),
      makeNode("A", "nanoBanana"),
      makeNode("B", "nanoBanana"),
      makeNode("converge", "nanoBanana"),
      makeNode("downstream", "output"),
    ];
    const edges = [
      makeEdge("sw", "A", { sourceHandle: "out1" }),
      makeEdge("sw", "B", { sourceHandle: "out2" }),
      makeEdge("A", "converge"),
      makeEdge("B", "converge"),
      makeEdge("converge", "downstream"),
    ];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("A")).toBe(true);
    expect(dimmed.has("B")).toBe(false);
    expect(dimmed.has("converge")).toBe(false);
    expect(dimmed.has("downstream")).toBe(false);
  });

  it("keeps a chain of nodes downstream of rescued convergence active", () => {
    // switch --[disabled]--> A --> converge --> D1 --> D2 --> D3
    // switch --[enabled]---> B --> converge
    const nodes = [
      makeSwitchNode("sw", [
        { id: "out1", enabled: false },
        { id: "out2", enabled: true },
      ]),
      makeNode("A", "nanoBanana"),
      makeNode("B", "nanoBanana"),
      makeNode("converge", "nanoBanana"),
      makeNode("D1", "nanoBanana"),
      makeNode("D2", "nanoBanana"),
      makeNode("D3", "output"),
    ];
    const edges = [
      makeEdge("sw", "A", { sourceHandle: "out1" }),
      makeEdge("sw", "B", { sourceHandle: "out2" }),
      makeEdge("A", "converge"),
      makeEdge("B", "converge"),
      makeEdge("converge", "D1"),
      makeEdge("D1", "D2"),
      makeEdge("D2", "D3"),
    ];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("A")).toBe(true);
    expect(dimmed.has("B")).toBe(false);
    expect(dimmed.has("converge")).toBe(false);
    expect(dimmed.has("D1")).toBe(false);
    expect(dimmed.has("D2")).toBe(false);
    expect(dimmed.has("D3")).toBe(false);
  });

  describe("ConditionalSwitch", () => {
    it("dims downstream of non-matching rule outputs", () => {
      const nodes = [
        makeConditionalSwitchNode("cs", [
          { id: "rule1", isMatched: true },
          { id: "rule2", isMatched: false },
        ]),
        makeNode("active", "nanoBanana"),
        makeNode("dimmed", "nanoBanana"),
      ];
      const edges = [
        makeEdge("cs", "active", { sourceHandle: "rule1" }),
        makeEdge("cs", "dimmed", { sourceHandle: "rule2" }),
      ];
      const dimmed = computeDimmedNodes(nodes, edges);
      expect(dimmed.has("active")).toBe(false);
      expect(dimmed.has("dimmed")).toBe(true);
    });

    it("dims default output when a rule matches", () => {
      const nodes = [
        makeConditionalSwitchNode("cs", [{ id: "rule1", isMatched: true }]),
        makeNode("defaultTarget", "nanoBanana"),
      ];
      const edges = [
        makeEdge("cs", "defaultTarget", { sourceHandle: "default" }),
      ];
      const dimmed = computeDimmedNodes(nodes, edges);
      expect(dimmed.has("defaultTarget")).toBe(true);
    });

    it("keeps downstream of rescued convergence active (conditionalSwitch variant)", () => {
      // condSwitch --[rule1:matched]--> B --> converge --> downstream
      // condSwitch --[rule2:unmatched]--> A --> converge --> downstream
      const nodes = [
        makeConditionalSwitchNode("cs", [
          { id: "rule1", isMatched: true },
          { id: "rule2", isMatched: false },
        ]),
        makeNode("A", "nanoBanana"),
        makeNode("B", "nanoBanana"),
        makeNode("converge", "nanoBanana"),
        makeNode("downstream", "output"),
      ];
      const edges = [
        makeEdge("cs", "A", { sourceHandle: "rule2" }),
        makeEdge("cs", "B", { sourceHandle: "rule1" }),
        makeEdge("A", "converge"),
        makeEdge("B", "converge"),
        makeEdge("converge", "downstream"),
      ];
      const dimmed = computeDimmedNodes(nodes, edges);
      expect(dimmed.has("A")).toBe(true);
      expect(dimmed.has("B")).toBe(false);
      expect(dimmed.has("converge")).toBe(false);
      expect(dimmed.has("downstream")).toBe(false);
    });

    it("skips dimming entirely when evaluationPaused is true", () => {
      const nodes = [
        makeConditionalSwitchNode(
          "cs",
          [{ id: "rule1", isMatched: false }],
          { evaluationPaused: true }
        ),
        makeNode("target", "nanoBanana"),
      ];
      const edges = [
        makeEdge("cs", "target", { sourceHandle: "rule1" }),
      ];
      const dimmed = computeDimmedNodes(nodes, edges);
      expect(dimmed.size).toBe(0);
    });
  });

  it("dims nodes downstream of a dimmed switch's enabled output", () => {
    // ConditionalSwitch --[unmatched]--> gen1 --> Switch --[enabled]--> gen2
    // gen1 is dimmed (unmatched output), Switch is dimmed (input from dimmed gen1),
    // gen2 should be dimmed too even though the Switch output is enabled.
    const nodes = [
      makeConditionalSwitchNode("cs", [
        { id: "rule1", isMatched: false },
      ]),
      makeNode("gen1", "nanoBanana"),
      makeSwitchNode("sw", [{ id: "out1", enabled: true }]),
      makeNode("gen2", "nanoBanana"),
    ];
    const edges = [
      makeEdge("cs", "gen1", { sourceHandle: "rule1" }),
      makeEdge("gen1", "sw"),
      makeEdge("sw", "gen2", { sourceHandle: "out1" }),
    ];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("gen1")).toBe(true);
    expect(dimmed.has("sw")).toBe(true);
    expect(dimmed.has("gen2")).toBe(true);
  });

  it("does not dim the switch node itself", () => {
    const nodes = [
      makeSwitchNode("sw", [{ id: "out1", enabled: false }]),
      makeNode("target", "nanoBanana"),
    ];
    const edges = [makeEdge("sw", "target", { sourceHandle: "out1" })];
    const dimmed = computeDimmedNodes(nodes, edges);
    expect(dimmed.has("sw")).toBe(false);
  });
});
