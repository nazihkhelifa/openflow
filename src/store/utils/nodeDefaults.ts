import {
  NodeType,
  ModelType,
  MediaInputNodeData,
  ImageInputNodeData,
  AudioInputNodeData,
  AnnotationNodeData,
  CommentNodeData,
  PromptNodeData,
  NanoBananaNodeData,
  GenerateVideoNodeData,
  Generate3DNodeData,
  GenerateAudioNodeData,
  ImageCompareNodeData,
  EaseCurveNodeData,
  VideoFrameGrabNodeData,
  RouterNodeData,
  SwitchNodeData,
  ConditionalSwitchNodeData,
  GLBViewerNodeData,
  WorkflowNodeData,
  GroupColor,
  SelectedModel,
  MODEL_DISPLAY_NAMES,
} from "@/types";
import { SQUARE_SIZE } from "@/utils/nodeDimensions";
import { loadGenerateImageDefaults, loadNodeDefaults, getLLMDefaults } from "./localStorage";

/**
 * Default dimensions for each node type.
 * Used in addNode and createGroup for consistent sizing.
 */
export const defaultNodeDimensions: Record<NodeType, { width: number; height: number }> = {
  mediaInput: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  imageInput: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  audioInput: { width: 300, height: 200 },
  annotation: { width: 300, height: 280 },
  comment: { width: 420, height: 60 },
  prompt: { width: 329, height: 371 },
  generateImage: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  generateVideo: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  generate3d: { width: 300, height: 300 },
  generateAudio: { width: 300, height: 280 },
  imageCompare: { width: 400, height: 360 },
  easeCurve: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  videoFrameGrab: { width: SQUARE_SIZE, height: SQUARE_SIZE },
  router: { width: 200, height: 80 },
  switch: { width: 220, height: 120 },
  conditionalSwitch: { width: 260, height: 180 },
  glbViewer: { width: SQUARE_SIZE, height: SQUARE_SIZE },
};

/**
 * Group color palette (dark mode tints).
 */
export const GROUP_COLORS: Record<GroupColor, string> = {
  neutral: "#262626",
  blue: "#1e3a5f",
  green: "#1a3d2e",
  purple: "#2d2458",
  orange: "#3d2a1a",
  red: "#3d1a1a",
};

/**
 * Order in which group colors are assigned.
 */
export const GROUP_COLOR_ORDER: GroupColor[] = [
  "neutral", "blue", "green", "purple", "orange", "red"
];

/**
 * Creates default data for a node based on its type.
 */
export const createDefaultNodeData = (type: NodeType): WorkflowNodeData => {
  switch (type) {
    case "mediaInput":
      return {
        mode: "image",
        image: null,
        filename: null,
        dimensions: null,
        audioFile: null,
        duration: null,
        format: null,
        videoFile: null,
        glbUrl: null,
        capturedImage: null,
      } as MediaInputNodeData;
    case "imageInput":
      return {
        image: null,
        filename: null,
        dimensions: null,
      } as ImageInputNodeData;
    case "audioInput":
      return {
        audioFile: null,
        filename: null,
        duration: null,
        format: null,
      } as AudioInputNodeData;
    case "annotation":
      return {
        sourceImage: null,
        annotations: [],
        outputImage: null,
      } as AnnotationNodeData;
    case "comment":
      return {} as CommentNodeData;
    case "prompt": {
      const llmDefaults = getLLMDefaults();
      return {
        prompt: "",
        outputText: null,
        provider: llmDefaults?.provider ?? "google",
        model: llmDefaults?.model ?? "gemini-2.5-flash",
        temperature: llmDefaults?.temperature ?? 0.7,
        maxTokens: llmDefaults?.maxTokens ?? 2048,
        status: "idle",
        error: null,
      } as PromptNodeData;
    }
    case "generateImage": {
      const nodeDefaults = loadNodeDefaults();
      const legacyDefaults = loadGenerateImageDefaults();

      // Determine selectedModel: use defaultModelIndex, else selectedModels[0], then selectedModel, fallback to legacy
      let selectedModel: SelectedModel;
      const imgDefaults = nodeDefaults.generateImage;
      const models = imgDefaults?.selectedModels ?? (imgDefaults?.selectedModel ? [imgDefaults.selectedModel] : []);
      const imgIdx = imgDefaults?.defaultModelIndex ?? 0;
      if (models.length > 0) {
        selectedModel = models[imgIdx] ?? models[0];
      } else if (imgDefaults?.selectedModel) {
        selectedModel = imgDefaults.selectedModel;
      } else {
        const modelDisplayName = MODEL_DISPLAY_NAMES[legacyDefaults.model as ModelType] || legacyDefaults.model;
        selectedModel = {
          provider: "gemini",
          modelId: legacyDefaults.model,
          displayName: modelDisplayName,
        };
      }

      // Merge settings: new nodeDefaults override legacy defaults
      const aspectRatio = imgDefaults?.aspectRatio ?? legacyDefaults.aspectRatio;
      const resolution = imgDefaults?.resolution ?? legacyDefaults.resolution;
      const useGoogleSearch = imgDefaults?.useGoogleSearch ?? legacyDefaults.useGoogleSearch;
      const useImageSearch = imgDefaults?.useImageSearch ?? legacyDefaults.useImageSearch;

      return {
        inputImages: [],
        inputPrompt: null,
        outputImage: null,
        aspectRatio,
        resolution,
        model: legacyDefaults.model, // Keep legacy model field for backward compat
        selectedModel,
        useGoogleSearch,
        useImageSearch,
        status: "idle",
        error: null,
        imageHistory: [],
        selectedHistoryIndex: 0,
      } as NanoBananaNodeData;
    }
    case "generateVideo": {
      const nodeDefaults = loadNodeDefaults();
      const vidDefaults = nodeDefaults.generateVideo;
      const vidModels = vidDefaults?.selectedModels ?? (vidDefaults?.selectedModel ? [vidDefaults.selectedModel] : []);
      const vidIdx = vidDefaults?.defaultModelIndex ?? 0;
      return {
        inputImages: [],
        inputPrompt: null,
        outputVideo: null,
        selectedModel: vidModels[vidIdx] ?? vidModels[0] ?? vidDefaults?.selectedModel,
        status: "idle",
        error: null,
        videoHistory: [],
        selectedVideoHistoryIndex: 0,
      } as GenerateVideoNodeData;
    }
    case "generate3d": {
      const nodeDefaults = loadNodeDefaults();
      const d3Defaults = nodeDefaults.generate3d;
      const d3Models = d3Defaults?.selectedModels ?? (d3Defaults?.selectedModel ? [d3Defaults.selectedModel] : []);
      const d3Idx = d3Defaults?.defaultModelIndex ?? 0;
      return {
        inputImages: [],
        inputPrompt: null,
        output3dUrl: null,
        capturedImage: null,
        savedFilename: null,
        savedFilePath: null,
        selectedModel: d3Models[d3Idx] ?? d3Models[0] ?? d3Defaults?.selectedModel,
        status: "idle",
        error: null,
      } as Generate3DNodeData;
    }
    case "generateAudio": {
      const nodeDefaults = loadNodeDefaults();
      const audDefaults = nodeDefaults.generateAudio;
      const audModels = audDefaults?.selectedModels ?? (audDefaults?.selectedModel ? [audDefaults.selectedModel] : []);
      const audIdx = audDefaults?.defaultModelIndex ?? 0;
      return {
        inputPrompt: null,
        outputAudio: null,
        selectedModel: audModels[audIdx] ?? audModels[0] ?? audDefaults?.selectedModel,
        status: "idle",
        error: null,
        audioHistory: [],
        selectedAudioHistoryIndex: 0,
        duration: null,
        format: null,
      } as GenerateAudioNodeData;
    }
    case "imageCompare":
      return {
        imageA: null,
        imageB: null,
      } as ImageCompareNodeData;
    case "easeCurve":
      return {
        bezierHandles: [0.445, 0.05, 0.55, 0.95], // easeInOutSine preset
        easingPreset: "easeInOutSine",
        inheritedFrom: null,
        outputDuration: 1.5,
        outputVideo: null,
        status: "idle",
        error: null,
        progress: 0,
        encoderSupported: null,
      } as EaseCurveNodeData;
    case "videoFrameGrab":
      return {
        framePosition: "first",
        outputImage: null,
        status: "idle",
        error: null,
      } as VideoFrameGrabNodeData;
    case "router":
      return {} as RouterNodeData;
    case "switch":
      return {
        inputType: null,
        switches: [
          { id: Math.random().toString(36).slice(2, 9), name: "Output 1", enabled: true }
        ]
      } as SwitchNodeData;
    case "conditionalSwitch":
      return {
        incomingText: null,
        rules: [
          {
            id: "rule-" + Math.random().toString(36).slice(2, 9),
            value: "",
            mode: "contains",
            label: "Rule 1",
            isMatched: false,
          }
        ]
      } as ConditionalSwitchNodeData;
    case "glbViewer":
      return {
        glbUrl: null,
        filename: null,
        capturedImage: null,
      } as GLBViewerNodeData;
  }
};
