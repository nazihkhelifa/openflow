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
  onCameraAngleClick,
  onDownloadClick,
  onFullscreenClick,
  mode = "image",
  videoPreviewRef,
  videoSourceUrl = null,
}: UploadToolbarProps) {
  const { addNode, addEdgeWithType, nodes, executeSelectedNodes } = useWorkflowStore();
  const [toolsOpen, setToolsOpen] = useState(false);

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
          {/* Tools dropdown trigger */}
          <button
            type="button"
            onClick={() => hasMedia && setToolsOpen((open) => !open)}
            disabled={!hasMedia}
            className="flex h-8 w-fit items-center justify-center gap-1 whitespace-nowrap rounded-xl border-none pl-2 pr-1 text-neutral-100 hover:bg-white/5 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              {/* Spark / tools icon */}
              <svg
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
              width="12"
              height="12"
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

          {toolsOpen && hasMedia && (
            <div className="absolute left-0 top-full mt-1 z-50 flex min-w-52 flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900/95 p-1 text-[11px] text-neutral-100 shadow-xl backdrop-blur-lg">
              {mode === "image" ? (
                <>
                  {/* Upscale */}
                  <button
                    type="button"
                    onClick={() => { void handleUpscaleImage(); }}
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        {/* simple square + arrow icon */}
                        <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                          <path
                            d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z"
                            fill="currentColor"
                          />
                          <path
                            d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z"
                            fill="currentColor"
                          />
                          <path
                            d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                      <span className="flex-1">Upscale</span>
                    </div>
                  </button>

                  {/* 3D Camera Angle */}
                  <button
                    type="button"
                    onClick={handleCameraAngleControl}
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9L12 21.75m0-9L3 7.5m9 5.25v9M3 7.5v9l9 5.25" />
                        </svg>
                      </div>
                      <span className="flex-1">3D Camera Angle</span>
                    </div>
                  </button>

                  {/* Crop */}
                  <button
                    type="button"
                    disabled
                    className="relative flex h-10 select-none items-center rounded-xl p-2 outline-none opacity-60 cursor-not-allowed"
                  >
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

                  {/* Inpaint */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        {/* wand-like icon */}
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

                  {/* Outpaint */}
                  <button
                    type="button"
                    disabled
                    className="relative flex h-10 select-none items-center rounded-xl p-2 outline-none opacity-60 cursor-not-allowed"
                  >
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

                  {/* Remove background */}
                  <button
                    type="button"
                    disabled
                    className="relative flex h-10 select-none items-center rounded-xl p-2 outline-none opacity-60 cursor-not-allowed"
                  >
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

                  {/* Split into layers */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
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
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white"
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Split into grid */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
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
                              onClick={() => handleSplitIntoGrid(option.rows, option.cols)}
                              className="inline-flex h-6 rounded-lg px-1 text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  {/* Video: Upscale */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                          <path
                            d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z"
                            fill="currentColor"
                          />
                          <path
                            d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z"
                            fill="currentColor"
                          />
                          <path
                            d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z"
                            fill="currentColor"
                          />
                        </svg>
                      </div>
                      <span className="flex-1">Upscale</span>
                    </div>
                  </button>

                  {/* Extract frame → new Upload (image), like split grid */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                          <circle cx="9" cy="9" r="2" />
                          <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8.1L6 21" />
                        </svg>
                      </div>
                      <span className="flex-1">Extract frame</span>
                      <div className="ml-2 shrink-0">
                        <div className="flex gap-0.5">
                          {(
                            [
                              { icon: "◀", slot: "first" as const, title: "First frame" },
                              { icon: "●", slot: "current" as const, title: "Current frame" },
                              { icon: "▶", slot: "last" as const, title: "Last frame" },
                            ] as const
                          ).map(({ icon, slot, title }) => (
                            <button
                              key={slot}
                              type="button"
                              title={title}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleExtractVideoFrame(slot);
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] text-neutral-300 hover:bg-white/5 hover:text-white"
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Remove background (video thumbnail / frames) */}
                  <button
                    type="button"
                    className="relative flex h-10 cursor-pointer select-none items-center rounded-xl p-2 outline-none hover:bg-white/5"
                  >
                    <div className="flex flex-1 items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-lg bg-neutral-800 p-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="14" rx="2" />
                          <path d="M4 17l4-4 3 3 5-5 4 4" />
                        </svg>
                      </div>
                      <span className="flex-1">Remove background</span>
                    </div>
                  </button>
                </>
              )}
            </div>
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

