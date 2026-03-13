/**
 * Annotation Types
 *
 * Types for the annotation/drawing system including shapes, tools, and node data.
 * Used by the annotation node and Konva-based canvas drawing.
 */

/**
 * Base node data - using Record to satisfy React Flow's type constraints.
 * Defined here to avoid circular dependencies (nodes.ts imports from annotation.ts).
 */
export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  customTitle?: string;
  comment?: string;
}

// Shape type discriminator
export type ShapeType = "rectangle" | "circle" | "arrow" | "freehand" | "text";

/**
 * Base shape properties shared by all annotation shapes
 */
/** Konva globalCompositeOperation values for blend modes */
export type BlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export interface BaseShape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  /** Layer visibility - hidden layers are not rendered. Default true. */
  visible?: boolean;
  /** Locked layers cannot be selected or edited. Default false. */
  locked?: boolean;
  /** Custom layer name. Optional. */
  name?: string;
  /** Blend mode for compositing. Default "source-over". */
  blendMode?: BlendMode;
}

/**
 * Rectangle shape for box annotations
 */
export interface RectangleShape extends BaseShape {
  type: "rectangle";
  width: number;
  height: number;
  fill: string | null;
}

/**
 * Circle/ellipse shape for circular annotations
 */
export interface CircleShape extends BaseShape {
  type: "circle";
  radiusX: number;
  radiusY: number;
  fill: string | null;
}

/**
 * Arrow shape for directional annotations
 */
export interface ArrowShape extends BaseShape {
  type: "arrow";
  points: number[];
}

/**
 * Freehand drawing shape
 */
export interface FreehandShape extends BaseShape {
  type: "freehand";
  points: number[];
}

/**
 * Text annotation shape
 */
export interface TextShape extends BaseShape {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily?: string;
  fill: string;
}

/**
 * Union of all annotation shape types
 */
export type AnnotationShape =
  | RectangleShape
  | CircleShape
  | ArrowShape
  | FreehandShape
  | TextShape;

/**
 * Image layer - each image is a layer with position and scale
 */
export interface ImageLayer {
  id: string;
  type: "image";
  url: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** Layer visibility - hidden layers are not rendered. Default true. */
  visible?: boolean;
  /** Locked layers cannot be selected or edited. Default false. */
  locked?: boolean;
  /** Custom layer name. Optional. */
  name?: string;
  /** Blend mode for compositing. Default "source-over". */
  blendMode?: BlendMode;
}

/**
 * Unified layer - every component on the canvas (images, shapes, text, drawings)
 */
export type LayerItem = ImageLayer | AnnotationShape;

export function isImageLayer(item: LayerItem): item is ImageLayer {
  return item.type === "image";
}

export function isAnnotationShape(item: LayerItem): item is AnnotationShape {
  return item.type !== "image";
}

export function isLayerVisible(item: LayerItem): boolean {
  return item.visible !== false;
}

export function isLayerLocked(item: LayerItem): boolean {
  return item.locked === true;
}

/** Transform for an image layer (position and scale) */
export interface ImageLayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

/**
 * Annotation node data - stores image(s) with drawn annotations
 */
export interface AnnotationNodeData extends BaseNodeData {
  sourceImage: string | null;
  sourceImageRef?: string; // External image reference for storage optimization
  /** Ordered image layers (0 = back, last = front). When present, overrides sourceImage for multi-layer editing. */
  layers?: string[];
  /** Position and scale for each image layer, matched by index to layers[]. Preserved when re-editing. */
  imageLayerTransforms?: ImageLayerTransform[];
  annotations: AnnotationShape[];
  outputImage: string | null;
  outputImageRef?: string; // External image reference for storage optimization
}

// Tool type for annotation editor
export type ToolType =
  | "select"
  | "rectangle"
  | "circle"
  | "arrow"
  | "freehand"
  | "text";

/**
 * Tool options for annotation drawing
 */
export interface ToolOptions {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
  fontSize: number;
  fontFamily: string;
  opacity: number;
}
