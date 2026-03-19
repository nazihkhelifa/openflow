import { describe, expect, it } from "vitest";
import { FLOWY_PLANNER_NODE_TYPES } from "./plannerAllowlist";
import plannerSchema from "./planner_schema.json";

describe("planner_schema.json ↔ plannerAllowlist", () => {
  it("nodeTypes match FLOWY_PLANNER_NODE_TYPES exactly", () => {
    expect(plannerSchema.nodeTypes).toEqual([...FLOWY_PLANNER_NODE_TYPES]);
  });

  it("handle and operation lists are non-empty", () => {
    expect(plannerSchema.handleTypes.length).toBeGreaterThan(0);
    expect(plannerSchema.operationTypes.length).toBeGreaterThan(0);
  });
});
