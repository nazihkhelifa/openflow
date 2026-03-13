/**
 * Model Types
 *
 * Types for image generation model configuration including
 * aspect ratios, resolutions, and model identifiers.
 */

// Aspect Ratios (all models support the base 10; Nano Banana 2 adds 1:4, 1:8, 4:1, 8:1)
export type AspectRatio =
  | "1:1"
  | "1:4"
  | "1:8"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:1"
  | "4:3"
  | "4:5"
  | "5:4"
  | "8:1"
  | "9:16"
  | "16:9"
  | "21:9";

// Resolution Options (supported by Nano Banana Pro and Nano Banana 2)
export type Resolution = "512" | "1K" | "2K" | "4K";

// Image Generation Model Options
export type ModelType = "nano-banana" | "nano-banana-pro" | "nano-banana-2";

// Display names for image generation models
export const MODEL_DISPLAY_NAMES: Record<ModelType, string> = {
  "nano-banana": "Nano Banana",
  "nano-banana-pro": "Nano Banana Pro",
  "nano-banana-2": "Nano Banana 2",
};
