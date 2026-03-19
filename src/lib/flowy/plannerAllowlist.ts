/**
 * Flowy canvas planner allowlists.
 *
 * `FLOWY_PLANNER_NODE_TYPES` must list every `NodeType` exactly once
 * (compiler-enforced). Keep `planner_schema.json` in sync — run tests.
 */
import type { NodeType } from "@/types/nodes";

export const FLOWY_PLANNER_NODE_TYPES = [
  "mediaInput",
  "imageInput",
  "audioInput",
  "annotation",
  "comment",
  "prompt",
  "generateImage",
  "generateVideo",
  "generateAudio",
  "imageCompare",
  "videoStitch",
  "easeCurve",
  "videoTrim",
  "videoFrameGrab",
  "router",
  "switch",
  "conditionalSwitch",
  "generate3d",
  "glbViewer",
] as const satisfies readonly NodeType[];

/** True when every NodeType appears in FLOWY_PLANNER_NODE_TYPES */
type AllNodeTypesInPlanner = Exclude<
  NodeType,
  (typeof FLOWY_PLANNER_NODE_TYPES)[number]
> extends never
  ? true
  : false;

const _exhaustiveNodeTypes: AllNodeTypesInPlanner = true;

void _exhaustiveNodeTypes;
