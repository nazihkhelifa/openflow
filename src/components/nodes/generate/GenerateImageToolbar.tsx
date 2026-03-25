"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore, saveNanoBananaDefaults } from "@/store/workflowStore";
import { splitWithDimensions } from "@/utils/gridSplitter";
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
import { useToast } from "@/components/Toast";

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
  const addNode = useWorkflowStore((state) => state.addNode);
  const addEdgeWithType = useWorkflowStore((state) => state.addEdgeWithType);
  const executeSelectedNodes = useWorkflowStore((state) => state.executeSelectedNodes);
  const nodes = useWorkflowStore((state) => state.nodes);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);

  const data = node?.data as NanoBananaNodeData | undefined;
  const hasImage = !!data?.outputImage;

  const handleSplitIntoGrid = async (rows: number, cols: number) => {
    if (!hasImage || !data?.outputImage || !node) return;
    const sourceImage = data.outputImage;
    try {
      const { images } = await splitWithDimensions(sourceImage, rows, cols);
      if (!images || images.length === 0) return;

      const baseX =
        node.position.x +
        (typeof node.style?.width === "number" ? (node.style.width as number) : 300) +
        40;
      const baseY = node.position.y;
      const nodeWidth = 250;
      const nodeHeight = 220;
      const gap = 20;

      images.forEach((imageData, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;

        const newId = addNode(
          "mediaInput",
          {
            x: baseX + col * (nodeWidth + gap),
            y: baseY + row * (nodeHeight + gap),
          },
          {
            mode: "image",
            image: imageData,
            filename: `grid-${rows}x${cols}-${row + 1}-${col + 1}.png`,
          }
        );

        addEdgeWithType(
          {
            source: nodeId,
            target: newId,
            sourceHandle: "image",
            targetHandle: "reference",
          },
          "reference"
        );
      });
    } catch {
      // ignore split errors
    }
  };

  useEffect(() => {
    if (!toolsOpen && !modelMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (toolsRef.current?.contains(target)) return;
      if (modelMenuRef.current?.contains(target)) return;
      setToolsOpen(false);
      setModelMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [toolsOpen, modelMenuOpen]);

  // Default image models from settings (same source as ControlPanel)
  const { defaultImageModels, defaultModelIndex } = useMemo(() => {
    const cfg = loadNodeDefaults();
    const d = cfg.generateImage;
    const models = d?.selectedModels ?? (d?.selectedModel ? [d.selectedModel] : []);
    const idx = Math.min(d?.defaultModelIndex ?? 0, Math.max(0, models.length - 1));
    return { defaultImageModels: models, defaultModelIndex: idx };
  }, []);

  const { defaultUpscaleModels, defaultUpscaleModelIndex } = useMemo(() => {
    const cfg = loadNodeDefaults();
    const d = cfg.generateImageUpscale;
    const models =
      d?.selectedModels?.length
        ? d.selectedModels
        : d?.selectedModel
          ? [d.selectedModel]
          : [];
    const idx = Math.min(d?.defaultModelIndex ?? 0, Math.max(0, models.length - 1));
    return { defaultUpscaleModels: models, defaultUpscaleModelIndex: idx };
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

  const handleUpscaleImage = async () => {
    if (!hasImage || !data.outputImage) return;
    const selectedModel = defaultUpscaleModels[defaultUpscaleModelIndex] ?? null;
    if (!selectedModel) {
      useToast.getState().show("Set Default Image Upscale Models in Node Defaults first", "error");
      return;
    }
    const baseX =
      node.position.x +
      (typeof node.style?.width === "number" ? (node.style.width as number) : 300) +
      80;
    const baseY = node.position.y;

    const newId = addNode(
      "generateImage",
      { x: baseX, y: baseY },
      {
        customTitle: "Upscale",
        inputImages: [data.outputImage],
        inputPrompt: "Upscale this image and preserve details.",
        selectedModel,
      }
    );

    addEdgeWithType(
      {
        source: nodeId,
        target: newId,
        sourceHandle: "image",
        targetHandle: "image",
      },
      "image"
    );

    setToolsOpen(false);
    useToast.getState().show("Upscale node added", "success");
    try {
      await executeSelectedNodes([newId]);
    } catch {
      useToast.getState().show("Upscale run failed to start", "error");
    }
  };

  const stopProp = (e: React.MouseEvent | React.PointerEvent) =>
    e.stopPropagation();


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

  const handleDefaultModelSelectByIndex = (idx: number) => {
    if (!defaultImageModels[idx]) return;
    const m = defaultImageModels[idx];
    updateNodeData(nodeId, {
      selectedModel: {
        provider: m.provider,
        modelId: m.modelId,
        displayName: m.displayName,
      },
      parameters: {},
    });
    setModelMenuOpen(false);
  };

  const handleGeminiModelSelect = (nextModel: ModelType) => {
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
    setModelMenuOpen(false);
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
            {defaultImageModels.length > 0 || provider === "gemini" ? (
              <div ref={modelMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setModelMenuOpen((open) => !open)}
                  className="nodrag nopan inline-flex max-w-[140px] items-center gap-1 rounded-lg px-1.5 py-0.5 text-left text-neutral-100 hover:bg-white/5"
                  title={
                    data.selectedModel?.displayName ||
                    modelLabel ||
                    "Select model"
                  }
                >
                  <span className="truncate">
                    {data.selectedModel?.displayName || modelLabel || "Select model"}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 text-neutral-400 transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {modelMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 flex min-w-52 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 p-1 text-[11px] text-neutral-100 shadow-xl backdrop-blur-lg">
                    {defaultImageModels.length > 0
                      ? defaultImageModels.map((m: any, i: number) => {
                          const isActive = String(i) === currentDefaultIndex;
                          return (
                            <button
                              key={`${m.provider}-${m.modelId}-${i}`}
                              type="button"
                              onClick={() => handleDefaultModelSelectByIndex(i)}
                              className={`relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 text-left outline-none ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                            >
                              <span className="truncate">
                                {getProviderDisplayName(m.provider)}: {m.displayName}
                              </span>
                            </button>
                          );
                        })
                      : GEMINI_IMAGE_MODELS.map((m) => {
                          const isActive = (modelId ?? "nano-banana-pro") === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => handleGeminiModelSelect(m.value)}
                              className={`relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 text-left outline-none ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                            >
                              <span className="truncate">{m.label}</span>
                            </button>
                          );
                        })}
                  </div>
                )}
              </div>
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
                  data-id="generate-image-toolbar-aspect-ratio"
                  data-openflow-node-id={nodeId}
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

          {/* Divider before tools */}
          <div className="h-4 w-px bg-neutral-600 ml-1" />

          {/* Tools dropdown + Save / Download / Fullscreen (image tools, UI only) */}
          <div ref={toolsRef} className="relative flex items-center gap-x-px">
            <button
              type="button"
              onClick={() => hasImage && setToolsOpen((open) => !open)}
              disabled={!hasImage}
              className="flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-lg border-none px-2 text-[11px] text-neutral-100 hover:bg-white/5 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5">
                <svg
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  className="text-neutral-100"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M19.0229 0.993525C19.5562 0.97152 20.0884 1.06007 20.5857 1.25369C21.083 1.44733 21.5348 1.74191 21.9119 2.11907C22.2891 2.49625 22.5834 2.94775 22.7757 3.445C22.968 3.94227 23.054 4.47411 23.0279 5.00653C23.0019 5.53896 22.8644 6.05989 22.6245 6.5361C22.3925 6.99674 22.0697 7.40555 21.6759 7.73852L8.20762 21.2068C8.08456 21.3298 7.93152 21.4186 7.76363 21.4644L2.26363 22.9644C1.91742 23.0588 1.54715 22.9605 1.2934 22.7068C1.03965 22.453 0.941326 22.0828 1.03575 21.7365L2.53575 16.2365C2.58154 16.0686 2.67035 15.9156 2.7934 15.7926L16.2662 2.31974C16.6055 1.92815 17.0208 1.60911 17.487 1.38163C17.9665 1.14762 18.4896 1.01553 19.0229 0.993525Z"
                    fill="currentColor"
                  />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M4.9997 0C5.21576 -0.000129758 5.40746 0.138534 5.47497 0.343775L6.43168 3.25245C6.45606 3.32774 6.49796 3.39616 6.55394 3.4521C6.60992 3.50803 6.67837 3.54988 6.75368 3.5742L9.65565 4.52485C9.86098 4.59211 9.99987 4.78364 10 4.9997C10.0001 5.21576 9.86147 5.40746 9.65623 5.47497L6.74755 6.43168C6.67226 6.45606 6.60384 6.49796 6.5479 6.55394C6.49197 6.60992 6.45012 6.67837 6.4258 6.75368L5.47515 9.65565C5.40789 9.86098 5.21636 9.99987 5.0003 10C4.78424 10.0001 4.59254 9.86147 4.52503 9.65623L3.56832 6.74755C3.54394 6.67226 3.50204 6.60384 3.44606 6.5479C3.39008 6.49197 3.32163 6.45012 3.24632 6.4258L0.344346 5.47515C0.139024 5.40789 0.00012997 5.21636 0 5.0003C-0.000129758 4.78424 0.138534 4.59254 0.343775 4.52503L3.25245 3.56832C3.32774 3.54394 3.39616 3.50204 3.4521 3.44606C3.50803 3.39008 3.54988 3.32163 3.5742 3.24632L4.52485 0.344346C4.59211 0.139024 4.78364 0.00012997 4.9997 0Z"
                    fill="currentColor"
                  />
                </svg>
                <span>Tools</span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`text-neutral-400 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {toolsOpen && hasImage && (
              <div className="absolute left-0 top-full mt-1 z-50 flex min-w-52 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 p-1 text-[11px] text-neutral-100 shadow-xl backdrop-blur-lg">
                {/* Image tools menu (UI only, mirrors upload node) */}
                <button type="button" onClick={() => { void handleUpscaleImage(); }} className="relative flex h-9 items-center rounded-xl p-2 hover:bg-white/5">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                        <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z" fill="currentColor" />
                        <path d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z" fill="currentColor" />
                        <path d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z" fill="currentColor" />
                      </svg>
                    </div>
                    <span className="flex-1">Upscale</span>
                  </div>
                </button>

                <button type="button" disabled className="relative flex h-9 items-center rounded-xl p-2 opacity-60 cursor-not-allowed">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                      </svg>
                    </div>
                    <span className="flex-1">Crop</span>
                  </div>
                </button>

                <button type="button" disabled className="relative flex h-9 items-center rounded-xl p-2 opacity-60 cursor-not-allowed">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 4V2" />
                        <path d="M15 10V8" />
                        <path d="M19 6h2" />
                        <path d="M13 6h-2" />
                        <path d="m17.5 8.5 1.5 1.5" />
                        <path d="M13.5 4.5 12 3" />
                        <path d="m11 11-8 8" />
                        <path d="m3 11 8 8" />
                      </svg>
                    </div>
                    <span className="flex-1">Inpaint</span>
                  </div>
                </button>

                <button type="button" disabled className="relative flex h-9 items-center rounded-xl p-2 opacity-60 cursor-not-allowed">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h7v7H3z" />
                        <path d="M14 14h7v7h-7z" />
                        <path d="M14 3h7v7h-7z" />
                        <path d="M3 14h7v7H3z" />
                      </svg>
                    </div>
                    <span className="flex-1">Outpaint</span>
                  </div>
                </button>

                <button type="button" className="relative flex h-9 items-center rounded-xl p-2 hover:bg-white/5">
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 2h20v20H2z" />
                        <path d="M4 16l4-4 3 3 5-5 4 4" />
                      </svg>
                    </div>
                    <span className="flex-1">Remove background</span>
                  </div>
                </button>

                {/* Split into layers (same as upload image – UI + layer count buttons) */}
                <button
                  type="button"
                  disabled
                  className="relative flex h-9 select-none items-center rounded-xl p-2 outline-none opacity-60 cursor-not-allowed"
                >
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m12 2 9 4.5-9 4.5L3 6.5 12 2Z" />
                        <path d="m3 10.5 9 4.5 9-4.5" />
                        <path d="m3 14.5 9 4.5 9-4.5" />
                      </svg>
                    </div>
                    <span className="flex-1">Split into layers</span>
                    <div className="ml-2 shrink-0">
                      <div className="flex">
                        {[2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="nodrag nopan inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Split into grid (same as upload image – creates grid nodes + edges) */}
                <button
                  type="button"
                  className="relative flex h-9 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                >
                  <div className="flex flex-1 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                      </svg>
                    </div>
                    <span className="flex-1">Split into grid</span>
                    <div className="ml-2 shrink-0">
                      <div className="flex">
                        {[
                          { label: "2×2", rows: 2, cols: 2 },
                          { label: "3×3", rows: 3, cols: 3 },
                          { label: "4×4", rows: 4, cols: 4 },
                        ].map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSplitIntoGrid(option.rows, option.cols);
                            }}
                            className="nodrag nopan inline-flex h-6 rounded-lg px-1 text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div className="mx-1 h-4 w-px bg-neutral-600" />
          <button
            type="button"
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5"
            title="Save node"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3v4a1 1 0 0 0 1 1h8" />
              <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l3 3v13a2 2 0 0 1-2 2Z" />
              <path d="M10 17h4" />
            </svg>
          </button>
          <button
            type="button"
            disabled={!hasImage}
            className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-default"
            title="Fullscreen"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>
    </NodeToolbar>
  );
}

