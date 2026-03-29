"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useToast } from "@/components/Toast";
import type { GenerateVideoNodeData } from "@/types";
import { ProviderBadge } from "../shared/ProviderBadge";
import { getVideoDimensions } from "@/utils/nodeDimensions";
import {
  extractFrameFromVideoElement,
  extractFrameFromVideoUrl,
  type VideoFrameExtractionSlot,
} from "@/utils/extractVideoFrame";

interface GenerateVideoToolbarProps {
  nodeId: string;
  videoPreviewRef?: RefObject<HTMLVideoElement | null>;
  outputVideoUrl?: string | null;
}

export function GenerateVideoToolbar({
  nodeId,
  videoPreviewRef,
  outputVideoUrl = null,
}: GenerateVideoToolbarProps) {
  const node = useWorkflowStore((state) =>
    state.nodes.find((n) => n.id === nodeId)
  );

  const data = node?.data as GenerateVideoNodeData | undefined;

  const { providerLabel, modelLabel } = useMemo(() => {
    if (!data) {
      return {
        providerLabel: "Video",
        modelLabel: "Select model",
      };
    }

    const provider = data.selectedModel?.provider ?? "fal";
    const model =
      data.selectedModel?.displayName ??
      data.selectedModel?.modelId ??
      "Select model";

    return {
      providerLabel: provider,
      modelLabel: model,
    };
  }, [data]);

  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement | null>(null);
  const hasVideo = !!data?.outputVideo;

  const { addNode, addEdgeWithType, nodes } = useWorkflowStore();
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);

  const selectOnlyNode = useCallback(
    (selectedId: string) => {
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
    },
    [onNodesChange]
  );

  const handleCreateEaseCurveNode = useCallback(() => {
    if (!hasVideo) return;
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
  }, [addEdgeWithType, addNode, hasVideo, nodeId, nodes, selectOnlyNode]);

  const handleExtractVideoFrame = useCallback(
    async (slot: VideoFrameExtractionSlot) => {
      if (!hasVideo || !data?.outputVideo) return;
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
      if (!dataUrl && outputVideoUrl) {
        const hint = slot === "current" && el ? el.currentTime : undefined;
        const [png, dims] = await Promise.all([
          extractFrameFromVideoUrl(outputVideoUrl, slot, hint),
          getVideoDimensions(outputVideoUrl),
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
    },
    [
      addEdgeWithType,
      addNode,
      data?.outputVideo,
      hasVideo,
      nodeId,
      nodes,
      outputVideoUrl,
      videoPreviewRef,
    ]
  );

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

  if (!node) return null;

  const stopProp = (e: React.MouseEvent | React.PointerEvent) =>
    e.stopPropagation();

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
        <div className="flex items-center gap-1 rounded-xl border border-neutral-600 bg-neutral-800/95 px-2 py-1 shadow-lg backdrop-blur-sm text-[11px] max-w-[260px]">
          <ProviderBadge provider={data?.selectedModel?.provider ?? "fal"} />
          <span className="truncate text-neutral-100">{modelLabel}</span>

          <div className="h-4 w-px bg-neutral-600 ml-1" />

          {/* Direct video tools + three-dots extract menu */}
          <div ref={toolsRef} className="relative flex items-center gap-x-px">
            <button type="button" disabled className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Upscale">
              <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" className="text-neutral-200">
                <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1H8a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5V7a.5.5 0 0 1-1 0V2.5Z" fill="currentColor" />
                <path d="M11 7a.5.5 0 0 1 .5.5V11a1.5 1.5 0 0 1-1.5 1.5H6.5a.5.5 0 0 1 0-1H10a.5.5 0 0 0 .5-.5V7.5A.5.5 0 0 1 11 7Z" fill="currentColor" />
                <path d="M9.5 2H12a.5.5 0 0 1 .354.854l-3 3a.5.5 0 0 1-.708-.708L10.293 3H9.5a.5.5 0 0 1 0-1Z" fill="currentColor" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleCreateEaseCurveNode}
              disabled={!hasVideo}
              className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50"
              title="Ease curve"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17c4 0 4-10 9-10s5 10 9 10" />
              </svg>
            </button>
            <button type="button" onClick={() => hasVideo && setToolsOpen((open) => !open)} disabled={!hasVideo} className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="More tools">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>
            {toolsOpen && hasVideo && (
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
            <button type="button" disabled className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg p-1.5 text-neutral-300 hover:bg-white/5 disabled:opacity-50" title="Remove background">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="14" rx="2" />
                <path d="M4 17l4-4 3 3 5-5 4 4" />
              </svg>
            </button>
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
            disabled={!hasVideo}
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

