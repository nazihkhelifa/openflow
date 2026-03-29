import type { NodeType } from "@/types";

export const CANVAS_MENU_SECTIONS: Array<{
  label: string;
  nodes: Array<{ type: NodeType; label: string; description: string }>;
}> = [
  {
    label: "Add Node",
    nodes: [
      { type: "prompt", label: "Text", description: "Generate and edit" },
      { type: "generateImage", label: "Image", description: "Generate, edit, and enhance" },
      { type: "generateVideo", label: "Video", description: "Generate, edit, and enhance" },
      { type: "generate3d", label: "3D", description: "Generate and edit 3D scenes" },
      { type: "generateAudio", label: "Audio", description: "Music, effects, and sounds" },
    ],
  },
  {
    label: "Add Source",
    nodes: [{ type: "mediaInput", label: "Upload", description: "Add media from your computer" }],
  },
];
