"use client";

import React, { useCallback, useState, useEffect, useMemo } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { ProviderBadge } from "../shared/ProviderBadge";
import { ModelParameters } from "../shared/ModelParameters";
import { useWorkflowStore } from "@/store/workflowStore";
import { GenerateAudioNodeData, ProviderType, SelectedModel, ModelInputDef } from "@/types";
import { ProviderModel } from "@/lib/providers/types";
import { ModelSearchDialog } from "@/components/modals/ModelSearchDialog";
import { useAudioVisualization } from "@/hooks/useAudioVisualization";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useInlineParameters } from "@/hooks/useInlineParameters";
import { InlineParameterPanel } from "../shared/InlineParameterPanel";
import { NodeRunButton } from "../shared/NodeRunButton";
import { loadNodeDefaults } from "@/store/utils/localStorage";
import { getProviderDisplayName } from "@/utils/providerUrls";

type GenerateAudioNodeType = Node<GenerateAudioNodeData, "generateAudio">;

export function GenerateAudioNode({ id, data, selected }: NodeProps<GenerateAudioNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const generationsPath = useWorkflowStore((state) => state.generationsPath);
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const [isLoadingCarouselAudio, setIsLoadingCarouselAudio] = useState(false);

  // Inline parameters infrastructure
  const { inlineParametersEnabled } = useInlineParameters();

  // Get the current selected provider (default to fal)
  const currentProvider: ProviderType = nodeData.selectedModel?.provider || "fal";

  // Convert base64 data URL to Blob for visualization
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const { waveformData, isLoading: isLoadingWaveform } = useAudioVisualization(audioBlob);

  useEffect(() => {
    if (nodeData.outputAudio) {
      fetch(nodeData.outputAudio)
        .then((r) => r.blob())
        .then(setAudioBlob)
        .catch(() => setAudioBlob(null));
    } else {
      setAudioBlob(null);
    }
  }, [nodeData.outputAudio]);

  const {
    audioRef,
    canvasRef,
    waveformContainerRef,
    isPlaying,
    currentTime,
    handlePlayPause,
    handleSeek,
    formatTime,
  } = useAudioPlayback({
    audioSrc: nodeData.outputAudio ?? null,
    waveformData,
    isLoadingWaveform,
  });

  const handleClearAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioBlob(null);
    updateNodeData(id, { outputAudio: null, status: "idle", error: null, duration: null, format: null });
  }, [id, updateNodeData, audioRef]);

  const handleParametersChange = useCallback(
    (parameters: Record<string, unknown>) => {
      updateNodeData(id, { parameters });
    },
    [id, updateNodeData]
  );

  const handleInputsLoaded = useCallback(
    (inputs: ModelInputDef[]) => {
      updateNodeData(id, { inputSchema: inputs });
    },
    [id, updateNodeData]
  );

  const { setNodes } = useReactFlow();
  const handleParametersExpandChange = useCallback(
    (expanded: boolean, parameterCount: number) => {
      const parameterHeight = expanded ? Math.max(parameterCount * 28 + 16, 60) : 0;
      const baseHeight = 300;
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

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  // Load audio by ID from generations folder
  const loadAudioById = useCallback(async (audioId: string) => {
    if (!generationsPath) {
      console.error("Generations path not configured");
      return null;
    }

    try {
      const response = await fetch("/api/load-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: generationsPath,
          imageId: audioId,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        console.log(`Audio not found: ${audioId}`);
        return null;
      }
      return result.audio || result.image;
    } catch (error) {
      console.warn("Error loading audio:", error);
      return null;
    }
  }, [generationsPath]);

  // Carousel navigation handlers
  const handleCarouselPrevious = useCallback(async () => {
    const history = nodeData.audioHistory || [];
    if (history.length === 0 || isLoadingCarouselAudio) return;

    const currentIndex = nodeData.selectedAudioHistoryIndex || 0;
    const newIndex = currentIndex === 0 ? history.length - 1 : currentIndex - 1;
    const audioItem = history[newIndex];

    setIsLoadingCarouselAudio(true);
    const audio = await loadAudioById(audioItem.id);
    setIsLoadingCarouselAudio(false);

    if (audio) {
      updateNodeData(id, {
        outputAudio: audio,
        selectedAudioHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.audioHistory, nodeData.selectedAudioHistoryIndex, isLoadingCarouselAudio, loadAudioById, updateNodeData]);

  const handleCarouselNext = useCallback(async () => {
    const history = nodeData.audioHistory || [];
    if (history.length === 0 || isLoadingCarouselAudio) return;

    const currentIndex = nodeData.selectedAudioHistoryIndex || 0;
    const newIndex = (currentIndex + 1) % history.length;
    const audioItem = history[newIndex];

    setIsLoadingCarouselAudio(true);
    const audio = await loadAudioById(audioItem.id);
    setIsLoadingCarouselAudio(false);

    if (audio) {
      updateNodeData(id, {
        outputAudio: audio,
        selectedAudioHistoryIndex: newIndex,
      });
    }
  }, [id, nodeData.audioHistory, nodeData.selectedAudioHistoryIndex, isLoadingCarouselAudio, loadAudioById, updateNodeData]);

  const handleBrowseModelSelect = useCallback((model: ProviderModel) => {
    const newSelectedModel: SelectedModel = {
      provider: model.provider,
      modelId: model.id,
      displayName: model.name,
    };
    updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
    setIsBrowseDialogOpen(false);
  }, [id, updateNodeData]);

  const displayTitle = useMemo(() => {
    if (nodeData.selectedModel?.displayName && nodeData.selectedModel.modelId) {
      return nodeData.selectedModel.displayName;
    }
    return "Generate Audio";
  }, [nodeData.selectedModel?.displayName, nodeData.selectedModel?.modelId]);

  // Default audio models from settings (same as ControlPanel / ProjectSetupModal)
  const { defaultAudioModels, defaultModelIndex } = useMemo(() => {
    const cfg = loadNodeDefaults();
    const d = cfg.generateAudio;
    const models = d?.selectedModels ?? (d?.selectedModel ? [d.selectedModel] : []);
    const idx = Math.min(d?.defaultModelIndex ?? 0, Math.max(0, models.length - 1));
    return { defaultAudioModels: models, defaultModelIndex: idx };
  }, []);

  const handleDefaultModelSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = parseInt(e.target.value, 10);
      if (Number.isNaN(idx) || !defaultAudioModels[idx]) return;
      const m = defaultAudioModels[idx];
      updateNodeData(id, {
        selectedModel: { provider: m.provider, modelId: m.modelId, displayName: m.displayName },
        parameters: {},
      });
    },
    [id, defaultAudioModels, updateNodeData]
  );

  const currentDefaultSelectValue =
    nodeData.selectedModel && defaultAudioModels.length > 0
      ? (() => {
          const idx = defaultAudioModels.findIndex(
            (m) => m.provider === nodeData.selectedModel?.provider && m.modelId === nodeData.selectedModel?.modelId
          );
          return idx >= 0 ? String(idx) : "";
        })()
      : "";

  // Inline parameters: compute collapse state and toggle handler
  const isParamsExpanded = nodeData.parametersExpanded ?? true; // default expanded

  const handleToggleParams = useCallback(() => {
    updateNodeData(id, { parametersExpanded: !isParamsExpanded });
  }, [id, isParamsExpanded, updateNodeData]);

  // Dynamic handles based on inputSchema
  const dynamicHandles = useMemo(() => {
    if (!nodeData.inputSchema || nodeData.inputSchema.length === 0) return null;

    return nodeData.inputSchema.map((input, index) => {
      const handleType = input.type === "image" ? "image" : "text";
      return (
        <Handle
          key={input.name}
          type="target"
          position={Position.Left}
          id={input.name}
          data-handletype={handleType}
          style={{
            background: handleType === "image" ? "rgb(34, 197, 94)" : "rgb(251, 191, 36)",
            top: `${50 + (index - nodeData.inputSchema!.length / 2 + 0.5) * 20}px`,
          }}
          title={input.label}
        />
      );
    });
  }, [nodeData.inputSchema]);

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        settingsExpanded={inlineParametersEnabled && isParamsExpanded}
        isExecuting={isRunning}
        hasError={nodeData.status === "error"}
        footerRight={<NodeRunButton nodeId={id} disabled={isRunning} />}
        minWidth={300}
        minHeight={250}
        settingsPanel={inlineParametersEnabled ? (
          <InlineParameterPanel
            expanded={isParamsExpanded}
            onToggle={handleToggleParams}
            nodeId={id}
          >
            {/* Model selector: list from settings (like image/video/3d) + Browse */}
            <div className="flex flex-col gap-1.5">
              {defaultAudioModels.length > 0 ? (
                <>
                  <label className="text-[10px] font-medium text-neutral-400">Model</label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={currentDefaultSelectValue}
                      onChange={handleDefaultModelSelect}
                      className="nodrag nopan flex-1 min-w-0 px-2 py-1 text-[10px] bg-neutral-700 border border-neutral-600 rounded text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title={nodeData.selectedModel?.displayName || "Select model"}
                    >
                      <option value="">{displayTitle}</option>
                      {defaultAudioModels.map((m, i) => (
                        <option key={i} value={i}>
                          {getProviderDisplayName(m.provider)}: {m.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setIsBrowseDialogOpen(true)}
                      className="nodrag nopan shrink-0 px-2 py-1 text-[10px] bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded text-neutral-300 transition-colors"
                    >
                      Browse
                    </button>
                  </div>
                  <div className="text-[9px] text-neutral-500">
                    {getProviderDisplayName(currentProvider)}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-neutral-200 truncate">{displayTitle}</div>
                    <div className="text-[9px] text-neutral-500">{currentProvider}</div>
                  </div>
                  <button
                    onClick={() => setIsBrowseDialogOpen(true)}
                    className="nodrag nopan shrink-0 px-2 py-1 text-[10px] bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 rounded text-neutral-300 transition-colors"
                  >
                    Browse
                  </button>
                </div>
              )}
            </div>

            {/* External provider parameters - reuse ModelParameters component */}
            {nodeData.selectedModel?.modelId && (
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
        {/* Model parameters (hidden when inline enabled - shown in panel below) */}
        {!inlineParametersEnabled && nodeData.selectedModel?.modelId && (
          <ModelParameters
            provider={currentProvider}
            modelId={nodeData.selectedModel.modelId}
            parameters={nodeData.parameters || {}}
            onParametersChange={handleParametersChange}
            onInputsLoaded={handleInputsLoaded}
            onExpandChange={handleParametersExpandChange}
          />
        )}

        {/* Output audio player */}
        {nodeData.outputAudio && (
          <div className="relative group mt-2">
            {/* Waveform visualization */}
            {isLoadingWaveform ? (
              <div className="flex items-center justify-center bg-neutral-900/50 rounded h-16">
                <span className="text-xs text-neutral-500">Loading waveform...</span>
              </div>
            ) : waveformData ? (
              <div
                ref={waveformContainerRef}
                className="h-16 bg-neutral-900/50 rounded cursor-pointer relative"
                onClick={handleSeek}
              >
                <canvas ref={canvasRef} className="w-full h-full" />
              </div>
            ) : (
              <div className="flex items-center justify-center bg-neutral-900/50 rounded h-16">
                <span className="text-xs text-neutral-500">Processing...</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handlePlayPause}
                className="w-7 h-7 flex items-center justify-center bg-violet-600 hover:bg-violet-500 rounded transition-colors shrink-0"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Progress bar */}
              <div className="flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden relative">
                {!!audioRef.current?.duration && isFinite(audioRef.current.duration) && (
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${(currentTime / audioRef.current.duration) * 100}%` }}
                  />
                )}
              </div>

              {/* Time */}
              <span className="text-[10px] text-neutral-500 min-w-[32px] text-right">
                {formatTime(currentTime)}
              </span>

              {/* Carousel navigation */}
              {(nodeData.audioHistory?.length || 0) > 1 && (
                <>
                  <button
                    onClick={handleCarouselPrevious}
                    className="w-5 h-5 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded transition-colors shrink-0"
                    disabled={isLoadingCarouselAudio}
                    title="Previous"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                    </svg>
                  </button>
                  <span className="text-[10px] text-neutral-500">
                    {(nodeData.selectedAudioHistoryIndex || 0) + 1}/{nodeData.audioHistory?.length}
                  </span>
                  <button
                    onClick={handleCarouselNext}
                    className="w-5 h-5 flex items-center justify-center bg-neutral-700 hover:bg-neutral-600 rounded transition-colors shrink-0"
                    disabled={isLoadingCarouselAudio}
                    title="Next"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  </button>
                </>
              )}
            </div>

            {/* Clear button */}
            <button
              onClick={handleClearAudio}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Clear audio"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Status indicators */}
        {nodeData.status === "loading" && (
          <div className="flex items-center gap-2 mt-2">
            <div className="animate-spin w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full" />
            <span className="text-xs text-neutral-400">Generating audio...</span>
          </div>
        )}

        {nodeData.status === "error" && nodeData.error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {nodeData.error}
          </div>
        )}

        {/* Dynamic handles from schema */}
        {dynamicHandles}

        {/* Default prompt handle (if no dynamic schema) */}
        {(!nodeData.inputSchema || nodeData.inputSchema.length === 0) && (
          <Handle
            type="target"
            position={Position.Left}
            id="text"
            data-handletype="text"
            style={{ background: "rgb(251, 191, 36)" }}
          />
        )}

        {/* Output audio handle */}
        <Handle
          type="source"
          position={Position.Right}
          id="audio"
          data-handletype="audio"
          style={{ background: "rgb(167, 139, 250)" }}
        />

      </BaseNode>

      {/* Browse dialog */}
      {isBrowseDialogOpen && (
        <ModelSearchDialog
          isOpen={isBrowseDialogOpen}
          onClose={() => setIsBrowseDialogOpen(false)}
          onModelSelected={handleBrowseModelSelect}
          initialProvider={currentProvider}
          initialCapabilityFilter="audio"
        />
      )}
    </>
  );
}
