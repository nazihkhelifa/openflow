/**
 * Canvas aspect ratio presets for the Layer Editor.
 * Defines the output frame dimensions for the final flattened image.
 */

export interface CanvasPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  ratio: string;
}

const BASE_SIZE = 1080;

export const CANVAS_PRESETS: { group: string; presets: CanvasPreset[] }[] = [
  {
    group: "SQUARE",
    presets: [{ id: "1:1", label: "1:1", width: BASE_SIZE, height: BASE_SIZE, ratio: "1:1" }],
  },
  {
    group: "HORIZONTAL",
    presets: [
      { id: "4:3", label: "4:3", width: 1440, height: 1080, ratio: "4:3" },
      { id: "3:2", label: "3:2", width: 1620, height: 1080, ratio: "3:2" },
      { id: "16:9", label: "16:9", width: 1920, height: 1080, ratio: "16:9" },
      { id: "2:1", label: "2:1", width: 2160, height: 1080, ratio: "2:1" },
    ],
  },
  {
    group: "VERTICAL",
    presets: [
      { id: "3:4", label: "3:4", width: 810, height: 1080, ratio: "3:4" },
      { id: "2:3", label: "2:3", width: 720, height: 1080, ratio: "2:3" },
      { id: "9:16", label: "9:16", width: 608, height: 1080, ratio: "9:16" },
      { id: "1:2", label: "1:2", width: 540, height: 1080, ratio: "1:2" },
    ],
  },
  {
    group: "SOCIAL",
    presets: [
      { id: "instagram-post", label: "Instagram Post", width: 1080, height: 1080, ratio: "1:1" },
      { id: "instagram-story", label: "Instagram Story", width: 1080, height: 1920, ratio: "9:16" },
      { id: "presentation", label: "Presentation", width: 1920, height: 1080, ratio: "16:9" },
      { id: "facebook-post", label: "Facebook Post", width: 1200, height: 630, ratio: "1.91:1" },
      { id: "linkedin-post", label: "LinkedIn Post", width: 1200, height: 627, ratio: "1.91:1" },
      { id: "youtube-thumbnail", label: "YouTube Thumbnail", width: 1280, height: 720, ratio: "16:9" },
    ],
  },
];

export const DEFAULT_PRESET_ID = "1:1";

export function getPresetById(id: string): CanvasPreset | undefined {
  for (const { presets } of CANVAS_PRESETS) {
    const found = presets.find((p) => p.id === id);
    if (found) return found;
  }
  return undefined;
}

export function getPresetForDimensions(width: number, height: number): CanvasPreset | undefined {
  const ratio = width / height;
  for (const { presets } of CANVAS_PRESETS) {
    const found = presets.find((p) => Math.abs(p.width / p.height - ratio) < 0.01);
    if (found) return found;
  }
  return undefined;
}
