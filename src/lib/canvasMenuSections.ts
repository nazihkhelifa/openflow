import type { NodeType } from "@/types";

export const CANVAS_MENU_SECTIONS: Array<{
  label: string;
  nodes: Array<{ type: NodeType; label: string }>;
}> = [
  {
    label: "Add Node",
    nodes: [
      { type: "prompt", label: "Text" },
      { type: "generateImage", label: "Image" },
      { type: "generateVideo", label: "Video" },
      { type: "generate3d", label: "3D" },
      { type: "generateAudio", label: "Audio" },
    ],
  },
  {
    label: "Add Source",
    nodes: [{ type: "mediaInput", label: "Upload" }],
  },
];
