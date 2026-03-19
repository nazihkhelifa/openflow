/**
 * Node Types
 *
 * Types for workflow nodes including all node data interfaces,
 * handle types, and workflow node definitions.
 */

import { Node } from "@xyflow/react";
import type {
  AnnotationNodeData,
  AnnotationShape,
  BaseNodeData,
} from "./annotation";

// Re-export types from annotation for convenience
export type { AnnotationNodeData, BaseNodeData };

// Import from domain files to avoid circular dependencies
import type { AspectRatio, Resolution, ModelType } from "./models";
import type { LLMProvider, LLMModelType, SelectedModel, ProviderType } from "./providers";

/**
 * All available node types in the workflow editor
 */
export type MediaInputMode = "image" | "audio" | "video" | "3d";

/**
 * Unified media input node - image, audio, video, or 3D (GLB)
 */
export interface MediaInputNodeData extends BaseNodeData {
  mode: MediaInputMode;
  // Image mode
  image: string | null;
  imageRef?: string;
  dimensions: { width: number; height: number } | null;
  // Audio mode
  audioFile: string | null;
  duration: number | null;
  format: string | null;
  // Video mode
  videoFile: string | null;
  // 3D mode
  glbUrl: string | null;
  capturedImage: string | null;
  // Shared
  filename: string | null;
}

export type NodeType =
  | "mediaInput"
  | "imageInput"
  | "audioInput"
  | "annotation"
  | "comment"
  | "prompt"
  | "generateImage"
  | "generateVideo"
  | "generateAudio"
  | "imageCompare"
  | "easeCurve"
  | "videoFrameGrab"
  | "router"
  | "switch"
  | "conditionalSwitch"
  | "generate3d"
  | "glbViewer";

/**
 * Node execution status
 */
export type NodeStatus = "idle" | "loading" | "complete" | "error";

/**
 * Image input node - loads/uploads images into the workflow
 */
export interface ImageInputNodeData extends BaseNodeData {
  image: string | null;
  imageRef?: string; // External image reference for storage optimization
  filename: string | null;
  dimensions: { width: number; height: number } | null;
}

/**
 * Audio input node - loads/uploads audio files into the workflow
 */
export interface AudioInputNodeData extends BaseNodeData {
  audioFile: string | null;      // Base64 data URL of the audio file
  filename: string | null;       // Original filename for display
  duration: number | null;       // Duration in seconds
  format: string | null;         // MIME type (audio/mp3, audio/wav, etc.)
}

/**
 * Prompt node - unified text/LLM node (combines prompt, promptConstructor, llmGenerate)
 * - instructions: manual prompt or template with @variables from connected Prompt nodes
 * - outputText: resolved text (after @var substitution) or LLM-generated text
 */
export interface PromptNodeData extends BaseNodeData {
  /** Manual instructions or template with @variables */
  prompt: string;
  /** Resolved/generated text output (for downstream nodes) */
  outputText: string | null;
  /** Optional variable name when used as @var source */
  variableName?: string;
  /** LLM generation */
  inputPrompt?: string | null;
  inputImages?: string[];
  inputImageRefs?: string[];
  provider?: LLMProvider;
  model?: LLMModelType;
  temperature?: number;
  maxTokens?: number;
  parametersExpanded?: boolean;
  status?: NodeStatus;
  error?: string | null;
}

/**
 * Available variable from connected Prompt nodes (for PromptConstructor autocomplete)
 */
export interface AvailableVariable {
  name: string;
  value: string;
  nodeId: string;
}

/**
 * Image history item for tracking generated images
 */
export interface ImageHistoryItem {
  id: string;
  image: string; // Base64 data URL
  timestamp: number; // For display & sorting
  prompt: string; // The prompt used
  aspectRatio: AspectRatio;
  model: ModelType;
}

/**
 * Carousel image item for per-node history (IDs only, images stored externally)
 */
export interface CarouselImageItem {
  id: string;
  timestamp: number;
  prompt: string;
  aspectRatio: AspectRatio;
  model: ModelType;
}

/**
 * Carousel video item for per-node video history
 */
export interface CarouselVideoItem {
  id: string;
  timestamp: number;
  prompt: string;
  model: string; // Model ID for video (not ModelType since external providers)
}

/**
 * Model input definition for dynamic handles
 */
export interface ModelInputDef {
  name: string;
  type: "image" | "text";
  required: boolean;
  label: string;
  description?: string;
}

/**
 * Nano Banana node - AI image generation
 */
export interface NanoBananaNodeData extends BaseNodeData {
  inputImages: string[]; // Now supports multiple images
  inputImageRefs?: string[]; // External image references for storage optimization
  inputPrompt: string | null;
  outputImage: string | null;
  outputImageRef?: string; // External image reference for storage optimization
  aspectRatio: AspectRatio;
  resolution: Resolution; // Only used by Nano Banana Pro
  model: ModelType;
  selectedModel?: SelectedModel; // Multi-provider model selection (optional for backward compat)
  useGoogleSearch: boolean; // Only available for Nano Banana Pro and Nano Banana 2
  useImageSearch: boolean; // Only available for Nano Banana 2
  parameters?: Record<string, unknown>; // Model-specific parameters for external providers
  inputSchema?: ModelInputDef[]; // Model's input schema for dynamic handles
  parametersExpanded?: boolean; // Collapse state for inline parameter display
  status: NodeStatus;
  error: string | null;
  imageHistory: CarouselImageItem[]; // Carousel history (IDs only)
  selectedHistoryIndex: number; // Currently selected image in carousel
}

/**
 * Generate Video node - AI video generation
 */
export interface GenerateVideoNodeData extends BaseNodeData {
  inputImages: string[];
  inputImageRefs?: string[]; // External image references for storage optimization
  inputPrompt: string | null;
  outputVideo: string | null; // Video data URL or URL
  outputVideoRef?: string; // External video reference for storage optimization
  selectedModel?: SelectedModel; // Required for video generation (no legacy fallback)
  parameters?: Record<string, unknown>; // Model-specific parameters
  inputSchema?: ModelInputDef[]; // Model's input schema for dynamic handles
  parametersExpanded?: boolean; // Collapse state for inline parameter display
  status: NodeStatus;
  error: string | null;
  videoHistory: CarouselVideoItem[]; // Carousel history (IDs only)
  selectedVideoHistoryIndex: number; // Currently selected video in carousel
}

/**
 * Generate 3D node - AI 3D model generation
 */
export interface Generate3DNodeData extends BaseNodeData {
  inputImages: string[];
  inputImageRefs?: string[];
  inputPrompt: string | null;
  output3dUrl: string | null;
  /** Base64 PNG snapshot of the 3D viewport (same as GLB Viewer capture) */
  capturedImage: string | null;
  savedFilename: string | null;
  savedFilePath: string | null;
  selectedModel?: SelectedModel;
  parameters?: Record<string, unknown>;
  inputSchema?: ModelInputDef[];
  parametersExpanded?: boolean; // Collapse state for inline parameter display
  status: NodeStatus;
  error: string | null;
}

/**
 * Carousel audio item for per-node audio history
 */
export interface CarouselAudioItem {
  id: string;
  timestamp: number;
  prompt: string;
  model: string; // Model ID for audio (not ModelType since external providers)
}

/**
 * Generate Audio node - AI audio/TTS generation
 */
export interface GenerateAudioNodeData extends BaseNodeData {
  inputPrompt: string | null;
  outputAudio: string | null; // Audio data URL
  outputAudioRef?: string; // External audio reference for storage optimization
  selectedModel?: SelectedModel; // Required for audio generation
  parameters?: Record<string, unknown>; // Model-specific parameters (voice, speed, etc.)
  inputSchema?: ModelInputDef[]; // Model's input schema for dynamic handles
  parametersExpanded?: boolean; // Collapse state for inline parameter display
  status: NodeStatus;
  error: string | null;
  audioHistory: CarouselAudioItem[]; // Carousel history (IDs only)
  selectedAudioHistoryIndex: number; // Currently selected audio in carousel
  duration: number | null; // Duration in seconds
  format: string | null; // MIME type (audio/mp3, audio/wav, etc.)
}

/**
 * LLM Generate node - AI text generation
 */
export interface LLMGenerateNodeData extends BaseNodeData {
  inputPrompt: string | null;
  inputImages: string[];
  inputImageRefs?: string[]; // External image references for storage optimization
  outputText: string | null;
  provider: LLMProvider;
  model: LLMModelType;
  temperature: number;
  maxTokens: number;
  parametersExpanded?: boolean; // Collapse state for inline parameter display
  status: NodeStatus;
  error: string | null;
}

/**
 * Image Compare node - side-by-side image comparison with draggable slider
 */
export interface ImageCompareNodeData extends BaseNodeData {
  imageA: string | null;
  imageB: string | null;
}

/**
 * Ease Curve node - applies speed curve to video using easing functions
 */
export interface EaseCurveNodeData extends BaseNodeData {
  bezierHandles: [number, number, number, number];
  easingPreset: string | null;
  inheritedFrom: string | null;
  outputDuration: number;
  outputVideo: string | null;
  status: NodeStatus;
  error: string | null;
  progress: number;
  encoderSupported: boolean | null;
}

/**
 * Video Frame Grab node - extracts the first or last frame from a video as a full-resolution PNG image
 */
export interface VideoFrameGrabNodeData extends BaseNodeData {
  framePosition: "first" | "last";   // Which frame to extract
  outputImage: string | null;        // Extracted frame as base64 PNG data URL
  status: NodeStatus;
  error: string | null;
}

/**
 * Router node - pure passthrough routing node with dynamic multi-type handles
 */
export interface RouterNodeData extends BaseNodeData {
  // No internal state - all routing is derived from edge connections
}

/**
 * Switch node - toggle-controlled routing with named outputs
 */
export interface SwitchNodeData extends BaseNodeData {
  inputType: HandleType | null;  // Derived from connected input edge, null when disconnected
  switches: Array<{
    id: string;        // Unique identifier for handle mapping
    name: string;      // User-editable label
    enabled: boolean;  // Toggle state
  }>;
}

/**
 * Match mode for conditional switch rules
 */
export type MatchMode = "exact" | "contains" | "starts-with" | "ends-with";

/**
 * Conditional switch rule for text-based routing
 */
export interface ConditionalSwitchRule {
  id: string;           // Unique handle ID, prefixed with "rule-" to avoid collision with reserved "default" keyword
  value: string;        // Comma-separated match values
  mode: MatchMode;      // Match strategy
  label: string;        // User-editable display name
  isMatched: boolean;   // Computed match state
}

/**
 * Conditional Switch node - text-based routing with multi-mode matching
 */
export interface ConditionalSwitchNodeData extends BaseNodeData {
  incomingText: string | null;  // Upstream text for evaluation and display
  rules: ConditionalSwitchRule[]; // User-defined rules
  evaluationPaused?: boolean;   // When true, skips rule evaluation and downstream dimming
}

/**
 * Comment node - canvas annotations/notes (non-executable)
 */
export interface CommentNodeData extends BaseNodeData {
  content?:
    | {
        id: string;
        text: string;
        author: string;
        authorAvatar?: string;
        date: string;
      }
    | Array<{
        id: string;
        text: string;
        author: string;
        authorAvatar?: string;
        date: string;
      }>;
  updatedAt?: string;
}

/**
 * GLB 3D Viewer node - loads and displays 3D models, captures viewport as image
 */
export interface GLBViewerNodeData extends BaseNodeData {
  glbUrl: string | null;       // Object URL for the loaded GLB file
  filename: string | null;     // Original filename for display
  capturedImage: string | null; // Base64 PNG snapshot of the 3D viewport
}

/**
 * Union of all node data types
 */
export type WorkflowNodeData =
  | MediaInputNodeData
  | ImageInputNodeData
  | AudioInputNodeData
  | AnnotationNodeData
  | CommentNodeData
  | PromptNodeData
  | NanoBananaNodeData
  | GenerateVideoNodeData
  | Generate3DNodeData
  | GenerateAudioNodeData
  | ImageCompareNodeData
  | EaseCurveNodeData
  | VideoFrameGrabNodeData
  | RouterNodeData
  | SwitchNodeData
  | ConditionalSwitchNodeData
  | GLBViewerNodeData;

/**
 * Workflow node with typed data (extended with optional groupId)
 */
export type WorkflowNode = Node<WorkflowNodeData, NodeType> & {
  groupId?: string;
};

/**
 * Handle types for node connections
 */
export type HandleType = "image" | "text" | "audio" | "video" | "3d" | "easeCurve";

/**
 * Default settings for node types - stored in localStorage
 */
export interface GenerateImageNodeDefaults {
  selectedModel?: SelectedModel;
  /** Multiple models per node type - used when creating new nodes */
  selectedModels?: SelectedModel[];
  /** Index of model to auto-select when creating new nodes (default 0) */
  defaultModelIndex?: number;
  aspectRatio?: string;
  resolution?: string;
  useGoogleSearch?: boolean;
  useImageSearch?: boolean;
}

export interface GenerateVideoNodeDefaults {
  selectedModel?: SelectedModel;
  selectedModels?: SelectedModel[];
  defaultModelIndex?: number;
}

export interface Generate3DNodeDefaults {
  selectedModel?: SelectedModel;
  selectedModels?: SelectedModel[];
  defaultModelIndex?: number;
}

export interface GenerateAudioNodeDefaults {
  selectedModel?: SelectedModel;
  selectedModels?: SelectedModel[];
  defaultModelIndex?: number;
}

export interface LLMNodeDefaults {
  provider?: LLMProvider;
  model?: LLMModelType;
  temperature?: number;
  maxTokens?: number;
}

export interface NodeDefaultsConfig {
  generateImage?: GenerateImageNodeDefaults;
  generateVideo?: GenerateVideoNodeDefaults;
  generate3d?: Generate3DNodeDefaults;
  generateAudio?: GenerateAudioNodeDefaults;
  llm?: LLMNodeDefaults;
  /** Default LLM provider/model used by "Generate workflow with AI" (quickstart). */
  quickstart?: LLMNodeDefaults;
  /**
   * Optional extra instructions appended to the system prompt used by /api/quickstart.
   * This lets users add guardrails or formatting requirements without replacing
   * the built-in node schema description.
   */
  quickstartSystemInstructionExtra?: string;
  /** Multiple LLM presets - user can pick when creating new nodes */
  llmPresets?: LLMNodeDefaults[];
  /** Index of LLM preset to auto-select when creating new nodes (default 0) */
  defaultLlmPresetIndex?: number;
}
