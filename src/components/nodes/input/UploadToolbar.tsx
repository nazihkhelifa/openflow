"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useToast } from "@/components/Toast";
import { splitWithDimensions } from "@/utils/gridSplitter";
import { getVideoDimensions } from "@/utils/nodeDimensions";
import {
  extractFrameFromVideoElement,
  extractFrameFromVideoUrl,
  type VideoFrameExtractionSlot,
} from "@/utils/extractVideoFrame";
import { loadNodeDefaults } from "@/store/utils/localStorage";

type UploadToolbarMode = "image" | "video";

interface UploadToolbarProps {
  nodeId: string;
  hasImage: boolean;
  onReplaceClick: () => void;
  onCropToggle?: () => void;
  cropActive?: boolean;
  onCameraAngleClick?: () => void;
  onDownloadClick?: () => void;
  onFullscreenClick?: () => void;
  /** When "video", show video-centric tools instead of image tools */
  mode?: UploadToolbarMode;
  /** Live preview video element (upload node) — used for "current" frame and faster first/last */
  videoPreviewRef?: RefObject<HTMLVideoElement | null>;
  /** Stored video URL (data/blob/http) — fallback if the preview is not ready */
  videoSourceUrl?: string | null;
}

export function UploadToolbar({
  nodeId,
  hasImage,
  onReplaceClick,
  onCropToggle,
  cropActive = false,
  onCameraAngleClick,
  onDownloadClick,
  onFullscreenClick,
  mode = "image",
  videoPreviewRef,
  videoSourceUrl = null,
}: UploadToolbarProps) {
  const { addNode, addEdgeWithType, nodes, executeSelectedNodes } = useWorkflowStore();
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const [toolsOpen, setToolsOpen] = useState(false);

  const selectOnlyNode = (selectedId: string) => {
    requestAnimationFrame(() => {
      const currentNodes = useWorkflowStore.getState().nodes;
      onNodesChange(
        currentNodes.map((node) => ({
          id: node.id,
          type: "select" as const,
          selected: node.id === selectedId,
        }))
      );
    });
  };

  const resolveUpscaleModel = () => {
    const cfg = loadNodeDefaults();
    const upscale = cfg.generateImageUpscale;
    const models = upscale?.selectedModels?.length
      ? upscale.selectedModels
      : upscale?.selectedModel
        ? [upscale.selectedModel]
        : [];
    const idx = upscale?.defaultModelIndex ?? 0;
    return models[idx] ?? models[0] ?? null;
  };


  const handleUpscaleImage = async () => {
    if (!hasImage || mode !== "image") return;
    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;
    const sourceData = sourceNode.data as { image?: string | null };
    const sourceImage = sourceData.image ?? null;
    if (!sourceImage) return;

    const selectedModel = resolveUpscaleModel();
    if (!selectedModel) {
      useToast.getState().show("Set Default Image Upscale Models in Node Defaults first", "error");
      return;
    }

    const baseX =
      sourceNode.position.x +
      (typeof sourceNode.style?.width === "number" ? (sourceNode.style.width as number) : 300) +
      80;
    const baseY = sourceNode.position.y;

    const newId = addNode(
      "generateImage",
      { x: baseX, y: baseY },
      {
        customTitle: "Upscale",
        inputImages: [sourceImage],
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

  const handleCameraAngleControl = () => {
    if (!hasImage || mode !== "image") return;
    onCameraAngleClick?.();
    setToolsOpen(false);
  };
  const handleSplitIntoGrid = async (rows: number, cols: number) => {
    if (!hasImage || mode !== "image") return;

    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;
    const sourceData = sourceNode.data as { image?: string | null };
    const sourceImage = sourceData.image ?? null;
    if (!sourceImage) return;

    try {
      const { images } = await splitWithDimensions(sourceImage, rows, cols);
      if (!images || images.length === 0) return;

      const baseX =
        sourceNode.position.x +
        (typeof sourceNode.style?.width === "number" ? (sourceNode.style!.width as number) : 300) +
        40;
      const baseY = sourceNode.position.y;
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
      // ignore split errors for now
    }
  };

  const handleExtractVideoFrame = async (slot: VideoFrameExtractionSlot) => {
    if (mode !== "video" || !hasImage) return;
    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;

    const el = videoPreviewRef?.current ?? null;
    let dataUrl: string | null = null;
    let dimensions: { width: number; height: number } | null = null;
    if (el && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const w = el.videoWidth;
      const h = el.videoHeight;
      if (w > 0 && h > 0) dimensions = { width: w, height: h };
      dataUrl = await extractFrameFromVideoElement(el, slot);
    }
    if (!dataUrl && videoSourceUrl) {
      const hint = slot === "current" && el ? el.currentTime : undefined;
      const [png, dims] = await Promise.all([
        extractFrameFromVideoUrl(videoSourceUrl, slot, hint),
        getVideoDimensions(videoSourceUrl),
      ]);
      dataUrl = png;
      dimensions = dims;
    }
    if (!dataUrl) {
      useToast.getState().show("Could not extract frame", "error");
      return;
    }

    const baseX =
      sourceNode.position.x +
      (typeof sourceNode.style?.width === "number" ? (sourceNode.style!.width as number) : 300) +
      40;
    const baseY = sourceNode.position.y;
    const label = slot === "first" ? "first" : slot === "last" ? "last" : "current";

    const newId = addNode(
      "mediaInput",
      { x: baseX, y: baseY },
      {
        mode: "image",
        image: dataUrl,
        filename: `frame-${label}.png`,
        dimensions: dimensions ?? null,
      }
    );

    addEdgeWithType(
      {
        source: nodeId,
        target: newId,
        sourceHandle: "video",
        targetHandle: "reference",
      },
      "reference"
    );
    setToolsOpen(false);
    useToast.getState().show("Frame added as Upload node", "success");
  };

  const handleCreateEaseCurveNode = () => {
    if (mode !== "video" || !hasMedia) return;
    const sourceNode = nodes.find((n) => n.id === nodeId);
    if (!sourceNode) return;

    const sourceWidth =
      typeof sourceNode.style?.width === "number" ? (sourceNode.style.width as number) : 300;
    const easeCurveId = addNode("easeCurve", {
      x: sourceNode.position.x + sourceWidth + 80,
      y: sourceNode.position.y,
    });

    addEdgeWithType(
      {
        source: nodeId,
        target: easeCurveId,
        sourceHandle: "video",
        targetHandle: "video",
      },
      "video"
    );

    selectOnlyNode(easeCurveId);
  };

  const toolsRef = useRef<HTMLDivElement | null>(null);

  const stopProp = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    if (!toolsOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!toolsRef.current) return;
      if (toolsRef.current.contains(event.target as Node)) return;
      setToolsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [toolsOpen]);

  const hasMedia = hasImage;

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
        <div
          ref={toolsRef}
          className="relative flex origin-bottom items-center gap-x-px rounded-2xl border border-neutral-600 bg-neutral-900/90 px-1 py-1 shadow-lg backdrop-blur-sm text-[11px]"
        >
          {mode === "image" ? (
            <>
              <button
                type="button"
                onClick={() => onCropToggle?.()}
                disabled={!hasMedia}
                className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 hover:bg-white/5 disabled:opacity-50 ${
                  cropActive ? "text-white bg-white/10" : "text-neutral-300"
                }`}
                title="Crop"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                  <path d="M18 22V8a2 2 0 0 0-2-2H2" />
                </svg>
              </button>
              <button type="button" onClick={handleCameraAngleControl} disabled={!hasMedia} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="3D Camera Angle">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9L12 21.75m0-9L3 7.5m9 5.25v9M3 7.5v9l9 5.25" />
                </svg>
              </button>
              <button type="button" onClick={() => { void handleUpscaleImage(); }} disabled={!hasMedia} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Upscale">
                <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                  <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z" fill="currentColor" />
                  <path d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z" fill="currentColor" />
                  <path d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z" fill="currentColor" />
                </svg>
              </button>
              <button type="button" disabled className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Inpaint">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 4V2" /><path d="M15 10V8" /><path d="M19 6h2" /><path d="M13 6h-2" />
                  <path d="m17.5 8.5 1.5 1.5" /><path d="M13.5 4.5 12 3" /><path d="m11 11-8 8" /><path d="m3 11 8 8" />
                </svg>
              </button>
              <button type="button" disabled className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Outpaint">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3h7v7H3z" /><path d="M14 14h7v7h-7z" /><path d="M14 3h7v7h-7z" /><path d="M3 14h7v7H3z" />
                </svg>
              </button>
              <button type="button" onClick={() => hasMedia && setToolsOpen((open) => !open)} disabled={!hasMedia} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="More tools">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              {toolsOpen && hasMedia && (
                <div className="absolute left-0 top-full mt-1 z-50 flex min-w-52 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 p-1 text-[11px] text-neutral-100 shadow-xl backdrop-blur-lg">
                  <button type="button" disabled className="relative flex h-10 items-center rounded-xl p-2 opacity-60 cursor-not-allowed">
                    <span className="flex-1">Remove background</span>
                  </button>
                  <div role="group" className="relative flex h-10 select-none items-center rounded-xl p-2">
                    <span className="flex-1">Split into layers</span>
                    <div className="ml-2 shrink-0 flex">{[2, 3, 4, 5].map((n) => <button key={n} type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white">{n}</button>)}</div>
                  </div>
                  <div role="group" className="relative flex h-10 select-none items-center rounded-xl p-2">
                    <span className="flex-1">Split into grid</span>
                    <div className="ml-2 shrink-0 flex">
                      {[{ label: "2×2", rows: 2, cols: 2 }, { label: "3×3", rows: 3, cols: 3 }, { label: "4×4", rows: 4, cols: 4 }].map((option) => (
                        <button key={option.label} type="button" onClick={() => handleSplitIntoGrid(option.rows, option.cols)} className="inline-flex h-6 rounded-lg px-1 text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white">{option.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <button type="button" disabled className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Upscale">
                <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                  <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z" fill="currentColor" />
                  <path d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z" fill="currentColor" />
                  <path d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleCreateEaseCurveNode}
                disabled={!hasMedia}
                className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50"
                title="Ease curve"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17c4 0 4-10 9-10s5 10 9 10" />
                </svg>
              </button>
              <button type="button" onClick={() => hasMedia && setToolsOpen((open) => !open)} disabled={!hasMedia} className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="More tools">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
              {toolsOpen && hasMedia && (
                <div className="absolute left-0 top-full mt-1 z-50 flex min-w-52 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 p-1 text-[11px] text-neutral-100 shadow-xl backdrop-blur-lg">
                  <button type="button" onClick={(e) => { e.stopPropagation(); void handleExtractVideoFrame("first"); }} className="relative flex h-10 items-center rounded-xl p-2 hover:bg-white/5">
                    <span className="flex-1">Extract first frame</span>
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); void handleExtractVideoFrame("current"); }} className="relative flex h-10 items-center rounded-xl p-2 hover:bg-white/5">
                    <span className="flex-1">Extract current frame</span>
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); void handleExtractVideoFrame("last"); }} className="relative flex h-10 items-center rounded-xl p-2 hover:bg-white/5">
                    <span className="flex-1">Extract last frame</span>
                  </button>
                </div>
              )}
              <button type="button" disabled className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Remove background">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="14" rx="2" />
                  <path d="M4 17l4-4 3 3 5-5 4 4" />
                </svg>
              </button>
            </>
          )}

          <div className="mx-1 h-4 w-px bg-neutral-700/80" />

          {/* Replace */}
          <button
            type="button"
            onClick={onReplaceClick}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5"
            title="Replace image"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="3" y2="3" />
            </svg>
          </button>

          {/* Save node (placeholder, no-op for now) */}
          <button
            type="button"
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5"
            title="Save node"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 3v4a1 1 0 0 0 1 1h8" />
              <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l3 3v13a2 2 0 0 1-2 2Z" />
              <path d="M10 17h4" />
            </svg>
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={hasImage ? onFullscreenClick : undefined}
            disabled={!hasImage}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50 disabled:cursor-default"
            title="Fullscreen"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
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

