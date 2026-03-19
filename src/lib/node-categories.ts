import type { NodeType } from "@/types";

export const ALL_NODES_CATEGORIES: {
  label: string;
  nodes: { type: NodeType; label: string }[];
}[] = [
  {
    label: "Input",
    nodes: [
      { type: "mediaInput", label: "Upload" },
    ],
  },
  {
    label: "Text",
    nodes: [
      { type: "prompt", label: "Prompt" },
    ],
  },
  {
    label: "Generate",
    nodes: [
      { type: "generateImage", label: "Generate Image" },
      { type: "generateVideo", label: "Generate Video" },
      { type: "generate3d", label: "Generate 3D" },
      { type: "generateAudio", label: "Generate Audio" },
    ],
  },
  {
    label: "Process",
    nodes: [
      { type: "annotation", label: "Layer Editor" },
      { type: "easeCurve", label: "Ease Curve" },
      { type: "videoFrameGrab", label: "Frame Grab" },
      { type: "imageCompare", label: "Image Compare" },
    ],
  },
  {
    label: "Route",
    nodes: [
      { type: "router", label: "Router" },
      { type: "switch", label: "Switch" },
      { type: "conditionalSwitch", label: "Conditional Switch" },
    ],
  },
];
