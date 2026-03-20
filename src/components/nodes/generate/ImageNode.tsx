"use client";

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps, Node, NodeToolbar, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { ModelParameters } from "../shared/ModelParameters";
import { useWorkflowStore, saveNanoBananaDefaults, useProviderApiKeys } from "@/store/workflowStore";
import { useShallow } from "zustand/shallow";
import { deduplicatedFetch } from "@/utils/deduplicatedFetch";
import { NanoBananaNodeData, AspectRatio, Resolution, ModelType, MODEL_DISPLAY_NAMES, ProviderType, SelectedModel, ModelInputDef } from "@/types";
import { ProviderModel, ModelCapability } from "@/lib/providers/types";
import { ModelSearchDialog } from "@/components/modals/ModelSearchDialog";
import { useToast } from "@/components/Toast";
import { getImageDimensions, calculateNodeSizeForFullBleed, parseAspectRatioString, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { ProviderBadge } from "../shared/ProviderBadge";
import { getModelPageUrl, getProviderDisplayName } from "@/utils/providerUrls";
import { useInlineParameters } from "@/hooks/useInlineParameters";
import { InlineParameterPanel } from "../shared/InlineParameterPanel";
import { MediaExpandButton } from "../shared/MediaExpandButton";
import { NodeRunButton } from "../shared/NodeRunButton";
import { ConnectedImageThumbnails } from "../shared/ConnectedImageThumbnails";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";
import { GenerateImageToolbar } from "./GenerateImageToolbar";

// Base 10 aspect ratios (all Gemini image models)
const BASE_ASPECT_RATIOS: AspectRatio[] = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

// Extended 14 aspect ratios (Nano Banana 2 adds extreme ratios)
const EXTENDED_ASPECT_RATIOS: AspectRatio[] = ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"];

// Resolutions per model (nano-banana-pro: 1K-4K, nano-banana-2: 512-4K)
const RESOLUTIONS_PRO: Resolution[] = ["1K", "2K", "4K"];
const RESOLUTIONS_NB2: Resolution[] = ["512", "1K", "2K", "4K"];

// Hardcoded Gemini image models (always available)
const GEMINI_IMAGE_MODELS: { value: ModelType; label: string }[] = [
  { value: "nano-banana", label: "Nano Banana" },
  { value: "nano-banana-2", label: "Nano Banana 2" },
  { value: "nano-banana-pro", label: "Nano Banana Pro" },
];

// Image generation capabilities
const IMAGE_CAPABILITIES: ModelCapability[] = ["text-to-image", "image-to-image"];

type GenerateImageNodeType = Node<NanoBananaNodeData, "generateImage">;

export function GenerateImageNode({ id, data, selected }: NodeProps<GenerateImageNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const generationsPath = useWorkflowStore((state) => state.generationsPath);
  const { hasPromptConnection, promptDisplayValue } = useWorkflowStore(
    useShallow((state) => {
      const hasConn = state.edges.some(
        (e) =>
          e.target === id &&
          (e.targetHandle === "text" || e.targetHandle?.startsWith("text-")) &&
          !e.data?.hasPause
      );
      const text = hasConn
        ? getConnectedInputsPure(
            id,
            state.nodes,
            state.edges,
            undefined,
            state.dimmedNodeIds
          ).text
        : null;
      return {
        hasPromptConnection: hasConn,
        promptDisplayValue: text,
      };
    })
  );
  // Use stable selector for API keys to prevent unnecessary re-fetches
  const { replicateApiKey, falApiKey, kieApiKey, replicateEnabled, kieEnabled } = useProviderApiKeys();
  const [isLoadingCarouselImage, setIsLoadingCarouselImage] = useState(false);
  const [externalModels, setExternalModels] = useState<ProviderModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const [isPromptFocused, setIsPromptFocused] = useState(false);

  // Inline parameters infrastructure
  const { inlineParametersEnabled } = useInlineParameters();

  // Get the current selected provider (default to gemini)
  const currentProvider: ProviderType = nodeData.selectedModel?.provider || "gemini";

  // Get enabled providers
  const enabledProviders = useMemo(() => {
    const providers: { id: ProviderType; name: string }[] = [];
    // Gemini is always available
    providers.push({ id: "gemini", name: "Gemini" });
    // fal.ai is always available (works without key but rate limited)
    providers.push({ id: "fal", name: "fal.ai" });
    // Add Replicate if configured
    if (replicateEnabled && replicateApiKey) {
      providers.push({ id: "replicate", name: "Replicate" });
    }
    // Add Kie.ai if configured
    if (kieEnabled && kieApiKey) {
      providers.push({ id: "kie", name: "Kie.ai" });
    }
    return providers;
  }, [replicateEnabled, replicateApiKey, kieEnabled, kieApiKey]);

  // Check if external providers (Replicate/Fal) are enabled
  // fal.ai is always available (works without key but rate limited)
  const hasExternalProviders = useMemo(() => {
    const hasReplicate = replicateEnabled && replicateApiKey;
    // fal.ai is always available
    return !!(hasReplicate || true);
  }, [replicateEnabled, replicateApiKey]);

  const isGeminiOnly = !hasExternalProviders;

  // Migrate legacy data: derive selectedModel from model field if missing
  useEffect(() => {
    if (nodeData.model && !nodeData.selectedModel) {
      const displayName = MODEL_DISPLAY_NAMES[nodeData.model] || nodeData.model;
      const newSelectedModel: SelectedModel = {
        provider: "gemini",
        modelId: nodeData.model,
        displayName,
      };
      updateNodeData(id, { selectedModel: newSelectedModel });
    }
  }, [id, nodeData.model, nodeData.selectedModel, updateNodeData]);

  // Fetch models from external providers when provider changes
  const fetchModels = useCallback(async () => {
    if (currentProvider === "gemini") {
      setExternalModels([]);
      setModelsFetchError(null);
      return;
    }

    setIsLoadingModels(true);
    setModelsFetchError(null);
    try {
      const capabilities = IMAGE_CAPABILITIES.join(",");
      const headers: HeadersInit = {};
      if (replicateApiKey) {
        headers["X-Replicate-Key"] = replicateApiKey;
      }
      if (falApiKey) {
        headers["X-Fal-Key"] = falApiKey;
      }
      if (kieApiKey) {
        headers["X-Kie-Key"] = kieApiKey;
      }
      const response = await deduplicatedFetch(`/api/models?provider=${currentProvider}&capabilities=${capabilities}`, { headers });
      if (response.ok) {
        const data = await response.json();
        setExternalModels(data.models || []);
        setModelsFetchError(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || `Failed to load models (${response.status})`;
        setExternalModels([]);
        setModelsFetchError(
          currentProvider === "replicate" && response.status === 401
            ? "Invalid Replicate API key. Check your settings."
            : errorMsg
        );
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
      setExternalModels([]);
      setModelsFetchError("Failed to load models. Check your connection.");
    } finally {
      setIsLoadingModels(false);
    }
  }, [currentProvider, replicateApiKey, falApiKey, kieApiKey]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Inline parameters: compute collapse state and toggle handler
  const isParamsExpanded = nodeData.parametersExpanded ?? true; // default expanded

  const handleToggleParams = useCallback(() => {
    updateNodeData(id, { parametersExpanded: !isParamsExpanded });
  }, [id, isParamsExpanded, updateNodeData]);

  // Handle provider change
  const handleProviderChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const provider = e.target.value as ProviderType;

      if (provider === "gemini") {
        // Reset to Gemini default
        const newSelectedModel: SelectedModel = {
          provider: "gemini",
          modelId: nodeData.model || "nano-banana-pro",
          displayName: GEMINI_IMAGE_MODELS.find(m => m.value === (nodeData.model || "nano-banana-pro"))?.label || "Nano Banana Pro",
        };
        // Clear parameters when switching providers (different providers have different schemas)
        updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
      } else {
        // Set placeholder for external provider
        const newSelectedModel: SelectedModel = {
          provider,
          modelId: "",
          displayName: "Select model...",
        };
        // Clear parameters when switching providers
        updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
      }
    },
    [id, nodeData.model, updateNodeData]
  );

  // Handle model change for external providers
  const handleExternalModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const modelId = e.target.value;
      const model = externalModels.find(m => m.id === modelId);
      if (model) {
        const newSelectedModel: SelectedModel = {
          provider: currentProvider,
          modelId: model.id,
          displayName: model.name,
          capabilities: model.capabilities,
        };
        // Clear parameters when changing models (different models have different schemas)
        updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
      }
    },
    [id, currentProvider, externalModels, updateNodeData]
  );

  const handleAspectRatioChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const aspectRatio = e.target.value as AspectRatio;
      updateNodeData(id, { aspectRatio });
      saveNanoBananaDefaults({ aspectRatio });
    },
    [id, updateNodeData]
  );

  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const resolution = e.target.value as Resolution;
      updateNodeData(id, { resolution });
      saveNanoBananaDefaults({ resolution });
    },
    [id, updateNodeData]
  );

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const model = e.target.value as ModelType;
      updateNodeData(id, { model });
      saveNanoBananaDefaults({ model });

      // Also update selectedModel for consistency
      const newSelectedModel: SelectedModel = {
        provider: "gemini",
        modelId: model,
        displayName: GEMINI_IMAGE_MODELS.find(m => m.value === model)?.label || model,
      };
      updateNodeData(id, { selectedModel: newSelectedModel });
    },
    [id, updateNodeData]
  );

  const handleGoogleSearchToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const useGoogleSearch = e.target.checked;
      updateNodeData(id, { useGoogleSearch });
      saveNanoBananaDefaults({ useGoogleSearch });
    },
    [id, updateNodeData]
  );

  const handleImageSearchToggle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const useImageSearch = e.target.checked;
      updateNodeData(id, { useImageSearch });
      saveNanoBananaDefaults({ useImageSearch });
    },
    [id, updateNodeData]
  );

  const handleParametersChange = useCallback(
    (parameters: Record<string, unknown>) => {
      updateNodeData(id, { parameters });
    },
    [id, updateNodeData]
  );

  // Handle inputs loaded from schema
  const handleInputsLoaded = useCallback(
    (inputs: ModelInputDef[]) => {
      updateNodeData(id, { inputSchema: inputs });
    },
    [id, updateNodeData]
  );

  // Handle parameters expand/collapse - resize node height
  const { setNodes, getNode, updateNode } = useReactFlow();
  const handleParametersExpandChange = useCallback(
    (expanded: boolean, parameterCount: number) => {
      // Each parameter row is ~24px, plus some padding
      const parameterHeight = expanded ? Math.max(parameterCount * 28 + 16, 60) : 0;
      const baseHeight = 300; // Default node height
      const newHeight = baseHeight + parameterHeight;

      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, style: { ...node.style, height: newHeight } }
            : node
        )
      );
    },
    [id, setNodes]
  );

  const handleClearImage = useCallback(() => {
    updateNodeData(id, { outputImage: null, status: "idle", error: null });
  }, [id, updateNodeData]);

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  const loadImageById = useCallback(async (imageId: string) => {
    if (!imageId) return null;

    // Some history entries may already carry a directly-usable image ref.
    if (imageId.startsWith("data:image/") || imageId.startsWith("blob:") || imageId.startsWith("http://") || imageId.startsWith("https://")) {
      return imageId;
    }

    if (!generationsPath) {
      // No configured generations directory in this project/session.
      // Avoid noisy console errors; caller will gracefully keep current image.
      return null;
    }

    try {
      const response = await fetch("/api/load-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: generationsPath,
          imageId,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        // Missing images are expected when refs point to deleted/moved files
        console.log(`Image not found: ${imageId}`);
        return null;
      }
      return result.image;
    } catch (error) {
      console.warn("Error loading image:", error);
      return null;
    }
  }, [generationsPath]);

  const handleCarouselPrevious = useCallback(async () => {
    const history = nodeData.imageHistory || [];
    if (history.length === 0 || isLoadingCarouselImage) return;

    const currentIndex = nodeData.selectedHistoryIndex || 0;
    const newIndex = currentIndex === 0 ? history.length - 1 : currentIndex - 1;
    const imageItem = history[newIndex];

    setIsLoadingCarouselImage(true);
    const image = await loadImageById(imageItem.id);
    setIsLoadingCarouselImage(false);

    if (image) {
      updateNodeData(id, {
        outputImage: image,
        selectedHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.imageHistory, nodeData.selectedHistoryIndex, isLoadingCarouselImage, loadImageById, updateNodeData]);

  const handleCarouselNext = useCallback(async () => {
    const history = nodeData.imageHistory || [];
    if (history.length === 0 || isLoadingCarouselImage) return;

    const currentIndex = nodeData.selectedHistoryIndex || 0;
    const newIndex = (currentIndex + 1) % history.length;
    const imageItem = history[newIndex];

    setIsLoadingCarouselImage(true);
    const image = await loadImageById(imageItem.id);
    setIsLoadingCarouselImage(false);

    if (image) {
      updateNodeData(id, {
        outputImage: image,
        selectedHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.imageHistory, nodeData.selectedHistoryIndex, isLoadingCarouselImage, loadImageById, updateNodeData]);

  const handleSelectHistoryIndex = useCallback(
    async (index: number) => {
      const history = nodeData.imageHistory || [];
      if (index < 0 || index >= history.length || isLoadingCarouselImage) return;
      const item = history[index];
      setIsLoadingCarouselImage(true);
      const image = await loadImageById(item.id);
      setIsLoadingCarouselImage(false);
      if (image) {
        updateNodeData(id, { outputImage: image, selectedHistoryIndex: index });
      }
    },
    [id, nodeData.imageHistory, isLoadingCarouselImage, loadImageById, updateNodeData]
  );

  // Handle model selection from browse dialog
  const handleBrowseModelSelect = useCallback((model: ProviderModel) => {
    const newSelectedModel: SelectedModel = {
      provider: model.provider,
      modelId: model.id,
      displayName: model.name,
      capabilities: model.capabilities,
    };
    updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
    setIsBrowseDialogOpen(false);
  }, [id, updateNodeData]);

  const isGeminiProvider = currentProvider === "gemini";

  // Dynamic title based on selected model - just the model name
  const displayTitle = useMemo(() => {
    if (nodeData.selectedModel?.displayName && nodeData.selectedModel.modelId) {
      return nodeData.selectedModel.displayName;
    }
    // Fallback for legacy data or no model selected
    if (nodeData.model) {
      return GEMINI_IMAGE_MODELS.find(m => m.value === nodeData.model)?.label || nodeData.model;
    }
    return "Select model...";
  }, [nodeData.selectedModel?.displayName, nodeData.selectedModel?.modelId, nodeData.model]);

  // Provider badge as title prefix
  const titlePrefix = useMemo(() => (
    <ProviderBadge provider={currentProvider} />
  ), [currentProvider]);

  // Compute model page URL for external link
  const modelPageUrl = useMemo(() => {
    if (!nodeData.selectedModel?.modelId) return null;
    return getModelPageUrl(currentProvider, nodeData.selectedModel.modelId);
  }, [currentProvider, nodeData.selectedModel?.modelId]);

  // Header action element based on provider mode
  const headerAction = useMemo(() => {
    const linkIcon = modelPageUrl && nodeData.selectedModel?.modelId ? (
      <a
        href={modelPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="nodrag nopan text-neutral-500 hover:text-neutral-300 transition-colors"
        title={`View on ${getProviderDisplayName(currentProvider)}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    ) : null;

    if (!isGeminiOnly) {
      return (
        <>
          {linkIcon}
          <button
            onClick={() => setIsBrowseDialogOpen(true)}
            className="nodrag nopan text-[10px] py-0.5 px-1.5 bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded text-neutral-300 transition-colors"
          >
            Browse
          </button>
        </>
      );
    }
    return linkIcon;
  }, [isGeminiOnly, modelPageUrl, nodeData.selectedModel?.modelId, currentProvider]);
  // Use selectedModel.modelId for Gemini models, fallback to legacy model field
  const currentModelId = isGeminiProvider ? (nodeData.selectedModel?.modelId || nodeData.model) : null;
  const supportsResolution = currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2";
  const aspectRatios = currentModelId === "nano-banana-2" ? EXTENDED_ASPECT_RATIOS : BASE_ASPECT_RATIOS;
  const resolutions = currentModelId === "nano-banana-2" ? RESOLUTIONS_NB2 : RESOLUTIONS_PRO;
  // Show history strip whenever this node has a generated image (single or multiple stored)
  const imageHistory = nodeData.imageHistory || [];
  const hasCarouselImages = imageHistory.length >= 1;
  const showHistoryStrip = !!nodeData.outputImage;

  // Track previous status to detect error transitions
  const prevStatusRef = useRef(nodeData.status);

  // Show toast when error occurs
  useEffect(() => {
    if (nodeData.status === "error" && prevStatusRef.current !== "error" && nodeData.error) {
      useToast.getState().show("Generation failed", "error", true, nodeData.error);
    }
    prevStatusRef.current = nodeData.status;
  }, [nodeData.status, nodeData.error]);

  // Auto-resize node to match generated image aspect ratio (like Upload node)
  const prevOutputImageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!nodeData.outputImage || nodeData.outputImage === prevOutputImageRef.current) {
      prevOutputImageRef.current = nodeData.outputImage ?? null;
      return;
    }
    prevOutputImageRef.current = nodeData.outputImage;

    requestAnimationFrame(() => {
      getImageDimensions(nodeData.outputImage!).then((dims) => {
        if (!dims) return;

        const node = getNode(id);
        if (!node) return;

        const aspectRatio = dims.width / dims.height;
        const currentHeight = (node.height as number) ?? (node.style?.height as number) ?? SQUARE_SIZE;
        const { width, height } = calculateNodeSizeForFullBleed(aspectRatio, currentHeight);

        const currentWidth = (node.width as number) ?? (node.style?.width as number) ?? SQUARE_SIZE;
        if (Math.abs(currentWidth - width) > 5 || Math.abs(currentHeight - height) > 5) {
          updateNode(id, {
            width,
            height,
            style: { ...node.style, width: `${width}px`, height: `${height}px` },
          });
        }
      });
    });
  }, [id, nodeData.outputImage, getNode, updateNode]);

  // Resize node when aspect ratio setting changes (from ControlPanel or inline)
  // Gemini uses nodeData.aspectRatio; external providers use nodeData.parameters (aspect_ratio/aspectRatio)
  // Must be provider-aware: when on external provider, nodeData.aspectRatio can be stale from a prior Gemini selection
  const aspectRatioFromParams =
    (nodeData.parameters?.aspect_ratio as string | undefined) ??
    (nodeData.parameters?.aspectRatio as string | undefined) ??
    (nodeData.parameters?.ratio as string | undefined);
  const effectiveAspectRatio =
    currentProvider === "gemini"
      ? (nodeData.aspectRatio ?? "1:1")
      : (aspectRatioFromParams ?? "1:1");

  const prevAspectRatioRef = useRef<string | null>(null);
  useEffect(() => {
    const aspectRatioStr = effectiveAspectRatio;
    if (aspectRatioStr === prevAspectRatioRef.current) return;
    prevAspectRatioRef.current = aspectRatioStr;

    const aspectRatioNum = parseAspectRatioString(aspectRatioStr);
    const node = getNode(id);
    if (!node) return;

    const currentHeight = (node.height as number) ?? (node.style?.height as number) ?? SQUARE_SIZE;
    const { width, height } = calculateNodeSizeForFullBleed(aspectRatioNum, currentHeight);

    const currentWidth = (node.width as number) ?? (node.style?.width as number) ?? SQUARE_SIZE;
    if (Math.abs(currentWidth - width) > 5 || Math.abs(currentHeight - height) > 5) {
      updateNode(id, {
        width,
        height,
        style: { ...node.style, width: `${width}px`, height: `${height}px` },
      });
    }
  }, [id, effectiveAspectRatio, getNode, updateNode]);

  return (
    <>
    <GenerateImageToolbar nodeId={id} />
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      fullBleed
      footerRight={<NodeRunButton nodeId={id} disabled={isRunning} />}
      settingsExpanded={inlineParametersEnabled && isParamsExpanded}
      aspectFitMedia={nodeData.outputImage}
      settingsPanel={inlineParametersEnabled ? (
        <InlineParameterPanel
          expanded={isParamsExpanded}
          onToggle={handleToggleParams}
          nodeId={id}
        >
          {/* Gemini-specific controls */}
          {isGeminiProvider && currentModelId && (
            <div className="space-y-1.5">
              {/* Model selector */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-neutral-400 shrink-0">Model</label>
                <select
                  value={currentModelId}
                  onChange={handleModelChange}
                  className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                >
                  {GEMINI_IMAGE_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Aspect Ratio */}
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-neutral-400 shrink-0">Aspect Ratio</label>
                <select
                  value={nodeData.aspectRatio || "1:1"}
                  onChange={handleAspectRatioChange}
                  className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                >
                  {aspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resolution (if supported) */}
              {supportsResolution && (
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-neutral-400 shrink-0">Resolution</label>
                  <select
                    value={nodeData.resolution || "2K"}
                    onChange={handleResolutionChange}
                    className="nodrag nopan flex-1 min-w-0 text-[11px] py-1 px-2 bg-[#1a1a1a] rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-600 text-white"
                  >
                    {resolutions.map((res) => (
                      <option key={res} value={res}>
                        {res}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Google Search toggle */}
              {(currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2") && (
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nodeData.useGoogleSearch || false}
                    onChange={handleGoogleSearchToggle}
                    className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                  />
                  Google Search
                </label>
              )}

              {/* Image Search toggle (NB2 only) */}
              {currentModelId === "nano-banana-2" && (
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nodeData.useImageSearch || false}
                    onChange={handleImageSearchToggle}
                    className="nodrag nopan w-3 h-3 rounded bg-[#1a1a1a] text-neutral-600 focus:ring-1 focus:ring-neutral-600 focus:ring-offset-0"
                  />
                  Image Search
                </label>
              )}
            </div>
          )}

          {/* External provider parameters - reuse ModelParameters component */}
          {!isGeminiProvider && nodeData.selectedModel?.modelId && (
            <ModelParameters
              modelId={nodeData.selectedModel.modelId}
              provider={currentProvider}
              parameters={nodeData.parameters || {}}
              onParametersChange={handleParametersChange}
              onInputsLoaded={handleInputsLoaded}
            />
          )}
        </InlineParameterPanel>
      ) : undefined}
    >
      {/* Input handles - ALWAYS use same IDs and positions for connection stability */}
      {/* Image input at 35%, Text input at 65% - never changes regardless of model */}
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        style={{ top: "35%", zIndex: 10 }}
        data-handletype="image"
        isConnectable={true}
      />
      {/* Image label */}
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{
          right: `calc(100% + 8px)`,
          top: "calc(35% - 18px)",
          color: "var(--handle-color-image)",
          zIndex: 10,
        }}
      >
        Image
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        style={{ top: "65%", zIndex: 10 }}
        data-handletype="text"
        isConnectable={true}
      />
      {/* Prompt label */}
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{
          right: `calc(100% + 8px)`,
          top: "calc(65% - 18px)",
          color: "var(--handle-color-text)",
          zIndex: 10,
        }}
      >
        Prompt
      </div>
      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        style={{ top: "50%", zIndex: 10 }}
        data-handletype="image"
      />
      {/* Output label */}
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: `calc(100% + 8px)`,
          top: "calc(50% - 18px)",
          color: "var(--handle-color-image)",
          zIndex: 10,
        }}
      >
        Image
      </div>

      <div className={`flex flex-col h-full w-full min-h-0 ${showHistoryStrip ? "rounded-xl overflow-hidden" : ""}`}>
        <div className={`relative flex-1 min-h-0 overflow-hidden ${showHistoryStrip ? "rounded-t-xl" : "rounded-xl"}`}>
        <div className={`relative w-full h-full min-h-0 overflow-hidden ${showHistoryStrip ? "rounded-t-xl" : "rounded-xl"}`}>
        {/* Connected image thumbnails */}
        <div className="absolute bottom-2 left-2 z-[5]">
          <ConnectedImageThumbnails nodeId={id} />
        </div>
        {/* Preview area */}
        {nodeData.outputImage ? (
          <>
            <img
              src={nodeData.outputImage}
              alt="Generated"
              className="w-full h-full object-cover"
            />
            {/* Loading overlay for generation */}
            {nodeData.status === "loading" && (
              <div className="absolute inset-0 bg-neutral-900/70 flex items-center justify-center">
                <svg
                  className="w-6 h-6 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
            {/* Error overlay when generation failed */}
            {nodeData.status === "error" && (
              <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center gap-1">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white text-xs font-medium">Generation failed</span>
                <span className="text-white/70 text-[10px]">See toast for details</span>
              </div>
            )}
            {/* Loading overlay for carousel navigation */}
            {isLoadingCarouselImage && (
              <div className="absolute inset-0 bg-neutral-900/50 flex items-center justify-center">
                <svg
                  className="w-4 h-4 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}
            {/* Expand + Clear buttons */}
            <div className="absolute top-1 right-1 flex gap-1 group/media">
              <MediaExpandButton nodeId={id} mediaUrl={nodeData.outputImage} className="w-5 h-5 bg-neutral-900/80 hover:bg-neutral-700 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors" />
              <button
                onClick={handleClearImage}
                className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                title="Clear image"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="w-full h-full min-h-[112px] bg-neutral-900/40 flex flex-col items-center justify-center">
            {nodeData.status === "loading" ? (
              <svg
                className="w-4 h-4 animate-spin text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "Failed"}
              </span>
            ) : (
              <span className="text-neutral-500 text-[10px]">
                Run to generate
              </span>
            )}
          </div>
        )}

        {/* Blur overlay: at bottom by default, expands to full node when textarea focused. Transparent. */}
        <div
          className={`absolute inset-x-0 bottom-0 z-[4] flex flex-col pointer-events-none [&>*]:pointer-events-auto backdrop-blur-md transition-all duration-300 ease-out ${
            isPromptFocused ? "top-0" : ""
          }`}
        >
          <div className="flex flex-1 flex-col justify-end px-2 pb-2 pt-1 min-h-0">
            <div
              className={`relative flex w-full justify-start transition-all duration-300 ease-out ${
                isPromptFocused ? "flex-1 min-h-0 max-h-[60%]" : "min-h-0"
              }`}
            >
              <textarea
                className={`nodrag nopan w-full resize-none overflow-y-auto rounded-lg border-0 px-2 py-1.5 text-[11px] text-white placeholder:text-white/60 focus:outline-none focus:ring-0 bg-transparent ${
                  isPromptFocused ? "min-h-24 flex-1" : "min-h-14 max-h-20"
                } ${hasPromptConnection ? "cursor-default" : ""}`}
                placeholder={hasPromptConnection ? "" : "Enter prompt or connect a prompt node"}
                value={hasPromptConnection ? (promptDisplayValue ?? "") : (nodeData.inputPrompt ?? "")}
                onChange={(e) => !hasPromptConnection && updateNodeData(id, { inputPrompt: e.target.value || null })}
                readOnly={hasPromptConnection}
                onFocus={() => setIsPromptFocused(true)}
                onBlur={() => setIsPromptFocused(false)}
              />
            </div>
          </div>
        </div>
        </div>
        </div>
      </div>

    </BaseNode>

    {showHistoryStrip && (() => {
      const history = imageHistory;
      const currentIndex = nodeData.selectedHistoryIndex ?? 0;
      const canGoPrev = history.length > 1 && currentIndex > 0;
      const canGoNext = history.length > 1 && currentIndex < history.length - 1;
      return (
        <NodeToolbar
          nodeId={id}
          position={Position.Bottom}
          align="center"
          offset={8}
          className="nodrag nopan"
          style={{ pointerEvents: "auto" }}
        >
          <div className="nodrag nopan flex items-center justify-center gap-1.5 py-1.5 px-2 border border-neutral-700/40 bg-transparent rounded-xl min-h-[32px] shadow-lg backdrop-blur-sm">
            <button
              onClick={handleCarouselPrevious}
              disabled={isLoadingCarouselImage || !canGoPrev}
              className="w-5 h-5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white/70 hover:text-white transition-colors"
              title="Previous image"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-1">
              {history.length >= 1 ? (
                history.map((_, i) =>
                  i === currentIndex ? (
                    <img
                      key={i}
                      src={nodeData.outputImage!}
                      alt=""
                      className="h-6 w-6 rounded object-cover border border-neutral-600/60 shadow-sm shrink-0"
                    />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSelectHistoryIndex(i)}
                      className="h-6 w-6 rounded bg-neutral-600/80 hover:bg-neutral-500 border border-neutral-600 shrink-0 transition-colors"
                      title={`Image ${i + 1}`}
                    />
                  )
                )
              ) : (
                <img
                  src={nodeData.outputImage!}
                  alt=""
                  className="h-6 w-6 rounded object-cover border border-neutral-600/60 shadow-sm shrink-0"
                />
              )}
            </div>
            <button
              onClick={handleCarouselNext}
              disabled={isLoadingCarouselImage || !canGoNext}
              className="w-5 h-5 rounded hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white/70 hover:text-white transition-colors"
              title="Next image"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </NodeToolbar>
      );
    })()}

    {/* Model browse dialog */}
    {isBrowseDialogOpen && (
      <ModelSearchDialog
        isOpen={isBrowseDialogOpen}
        onClose={() => setIsBrowseDialogOpen(false)}
        onModelSelected={handleBrowseModelSelect}
        initialCapabilityFilter="image"
      />
    )}
    </>
  );
}

/**
 * @deprecated Use `GenerateImageNode` instead. This alias is kept for backward compatibility
 * with existing workflows but will be removed in a future version.
 */
export { GenerateImageNode as NanoBananaNode };
