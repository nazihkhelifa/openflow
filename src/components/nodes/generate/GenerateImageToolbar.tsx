"use client";

import { useMemo } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore, saveNanoBananaDefaults } from "@/store/workflowStore";
import type {
  NanoBananaNodeData,
  AspectRatio,
  Resolution,
  ModelType,
  SelectedModel,
} from "@/types";
import { ProviderBadge } from "../shared/ProviderBadge";
import { loadNodeDefaults } from "@/store/utils/localStorage";
import { getProviderDisplayName } from "@/utils/providerUrls";

// Local copies of the Gemini image model + ratio/resolution presets
const GEMINI_IMAGE_MODELS: { value: ModelType; label: string }[] = [
  { value: "nano-banana", label: "Nano Banana" },
  { value: "nano-banana-2", label: "Nano Banana 2" },
  { value: "nano-banana-pro", label: "Nano Banana Pro" },
];

const BASE_ASPECT_RATIOS: AspectRatio[] = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
];

const EXTENDED_ASPECT_RATIOS: AspectRatio[] = [
  "1:1",
  "1:4",
  "1:8",
  "2:3",
  "3:2",
  "3:4",
  "4:1",
  "4:3",
  "4:5",
  "5:4",
  "8:1",
  "9:16",
  "16:9",
  "21:9",
];

const RESOLUTIONS_PRO: Resolution[] = ["1K", "2K", "4K"];
const RESOLUTIONS_NB2: Resolution[] = ["512", "1K", "2K", "4K"];

interface GenerateImageToolbarProps {
  nodeId: string;
}

export function GenerateImageToolbar({ nodeId }: GenerateImageToolbarProps) {
  const node = useWorkflowStore((state) =>
    state.nodes.find((n) => n.id === nodeId),
  );
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const data = node?.data as NanoBananaNodeData | undefined;

  // Default image models from settings (same source as ControlPanel)
  const { defaultImageModels, defaultModelIndex } = useMemo(() => {
    const cfg = loadNodeDefaults();
    const d = cfg.generateImage;
    const models = d?.selectedModels ?? (d?.selectedModel ? [d.selectedModel] : []);
    const idx = Math.min(d?.defaultModelIndex ?? 0, Math.max(0, models.length - 1));
    return { defaultImageModels: models, defaultModelIndex: idx };
  }, []);

  const {
    provider,
    modelId,
    modelLabel,
    aspectRatios,
    supportsResolution,
    resolutions,
  } = useMemo(() => {
    if (!data) {
      return {
        provider: "gemini" as const,
        modelId: undefined as ModelType | undefined,
        modelLabel: "Select model",
        aspectRatios: BASE_ASPECT_RATIOS,
        supportsResolution: false,
        resolutions: RESOLUTIONS_PRO,
      };
    }

    const currentProvider = data.selectedModel?.provider ?? "gemini";
    const currentModelId =
      (currentProvider === "gemini"
        ? data.selectedModel?.modelId || data.model
        : undefined) ?? ("nano-banana-pro" as ModelType);

    const label =
      data.selectedModel?.displayName ??
      data.selectedModel?.modelId ??
      data.model ??
      "Select model";

    const isNb2 = currentModelId === "nano-banana-2";
    const isPro =
      currentModelId === "nano-banana-pro" || currentModelId === "nano-banana-2";

    return {
      provider: currentProvider,
      modelId: currentModelId,
      modelLabel: label,
      aspectRatios: isNb2 ? EXTENDED_ASPECT_RATIOS : BASE_ASPECT_RATIOS,
      supportsResolution: isPro,
      resolutions: isNb2 ? RESOLUTIONS_NB2 : RESOLUTIONS_PRO,
    };
  }, [data]);

  if (!node || !data) return null;

  const stopProp = (e: React.MouseEvent | React.PointerEvent) =>
    e.stopPropagation();

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextModel = e.target.value as ModelType;
    // mirror GenerateImageNode behaviour
    updateNodeData(nodeId, { model: nextModel });
    saveNanoBananaDefaults({ model: nextModel });

    const newSelectedModel: SelectedModel = {
      provider: "gemini",
      modelId: nextModel,
      displayName:
        GEMINI_IMAGE_MODELS.find((m) => m.value === nextModel)?.label ||
        nextModel,
    };
    updateNodeData(nodeId, { selectedModel: newSelectedModel });
  };

  const handleAspectRatioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const aspectRatio = e.target.value as AspectRatio;
    updateNodeData(nodeId, { aspectRatio });
    saveNanoBananaDefaults({ aspectRatio });
  };

  const handleResolutionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const resolution = e.target.value as Resolution;
    updateNodeData(nodeId, { resolution });
    saveNanoBananaDefaults({ resolution });
  };

  const handleDefaultModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (Number.isNaN(idx) || !defaultImageModels[idx]) return;
    const m = defaultImageModels[idx];
    updateNodeData(nodeId, {
      selectedModel: {
        provider: m.provider,
        modelId: m.modelId,
        displayName: m.displayName,
      },
      parameters: {},
    });
  };

  const handleUseDefault = () => {
    const m = defaultImageModels[defaultModelIndex];
    if (!m) return;
    updateNodeData(nodeId, {
      selectedModel: {
        provider: m.provider,
        modelId: m.modelId,
        displayName: m.displayName,
      },
      parameters: {},
    });
  };

  const currentDefaultIndex =
    data.selectedModel && defaultImageModels.length > 0
      ? (() => {
          const idx = defaultImageModels.findIndex(
            (m: any) =>
              m.provider === data.selectedModel?.provider &&
              m.modelId === data.selectedModel?.modelId,
          );
          return idx >= 0 ? String(idx) : "";
        })()
      : "";

  return (
    <NodeToolbar
      nodeId={nodeId}
      position={Position.Top}
      offset={8}
      align="center"
      className="nodrag nopan"
      style={{ pointerEvents: "auto" }}
    >
      <div
        className="overflow-visible"
        onMouseDownCapture={stopProp}
        onPointerDownCapture={stopProp}
      >
        <div className="flex items-center gap-1 rounded-xl border border-neutral-600 bg-neutral-800/95 px-2 py-1 shadow-lg backdrop-blur-sm text-[11px]">
          {/* Provider + model (defaults from settings, including external like Flux 2) */}
          <div className="flex items-center gap-1 max-w-[180px]">
            <ProviderBadge provider={provider} />
            {defaultImageModels.length > 0 ? (
              <select
                value={currentDefaultIndex}
                onChange={handleDefaultModelSelect}
                className="nodrag nopan max-w-[140px] truncate bg-transparent text-neutral-100 text-[11px] focus:outline-none"
                title={
                  data.selectedModel?.displayName ||
                  modelLabel ||
                  "Select model"
                }
              >
                <option value="">
                  {data.selectedModel?.displayName ||
                    modelLabel ||
                    "Select model"}
                </option>
                {defaultImageModels.map((m: any, i: number) => (
                  <option key={i} value={i}>
                    {getProviderDisplayName(m.provider)}: {m.displayName}
                  </option>
                ))}
              </select>
            ) : provider === "gemini" ? (
              <select
                value={modelId ?? "nano-banana-pro"}
                onChange={handleModelChange}
                className="nodrag nopan max-w-[140px] truncate bg-transparent text-neutral-100 text-[11px] focus:outline-none"
              >
                {GEMINI_IMAGE_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-neutral-100">{modelLabel}</span>
            )}
          </div>

          {defaultImageModels.length > 0 && (
            <button
              type="button"
              onClick={handleUseDefault}
              className="nodrag nopan ml-1 rounded-full bg-neutral-700/80 px-1.5 py-0.5 text-[9px] text-neutral-200 hover:bg-neutral-600"
              title="Use default image model"
            >
              Default
            </button>
          )}

          {/* Aspect ratio + resolution (Gemini only) */}
          {provider === "gemini" && (
            <>
              <div className="h-4 w-px bg-neutral-600" />
              <div className="flex items-center gap-1 text-neutral-300">
                <select
                  value={data.aspectRatio || "1:1"}
                  onChange={handleAspectRatioChange}
                  className="nodrag nopan bg-neutral-700/80 text-[10px] rounded-full px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                  title="Aspect ratio"
                >
                  {aspectRatios.map((ratio) => (
                    <option key={ratio} value={ratio}>
                      {ratio}
                    </option>
                  ))}
                </select>
                {supportsResolution && (
                  <select
                    value={data.resolution || "2K"}
                    onChange={handleResolutionChange}
                    className="nodrag nopan bg-neutral-700/80 text-[10px] rounded-full px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                    title="Resolution"
                  >
                    {resolutions.map((res) => (
                      <option key={res} value={res}>
                        {res}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </NodeToolbar>
  );
}

