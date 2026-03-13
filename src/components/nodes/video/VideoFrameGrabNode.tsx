"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { VideoFrameGrabNodeData } from "@/types";
import { getImageDimensions, calculateNodeSizeForFullBleed, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { MediaExpandButton } from "../shared/MediaExpandButton";

type VideoFrameGrabNodeType = Node<VideoFrameGrabNodeData, "videoFrameGrab">;

export function VideoFrameGrabNode({ id, data, selected }: NodeProps<VideoFrameGrabNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);
  const { getNode, updateNode } = useReactFlow();
  const prevOutputImageRef = useRef<string | null>(null);

  // Auto-resize to match extracted frame aspect ratio
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

  // Find connected source video from incoming edges
  const sourceVideoUrl = useMemo(() => {
    const incomingEdge = edges.find((e) => e.target === id && e.targetHandle === "video");
    if (!incomingEdge) return null;

    const sourceNode = nodes.find((n) => n.id === incomingEdge.source);
    if (!sourceNode) return null;

    const d = sourceNode.data as Record<string, unknown>;
    if (sourceNode.type === "mediaInput") {
      return (d.videoFile as string | null) ?? null;
    }
    return (d.outputVideo as string | null) ?? null;
  }, [edges, nodes, id]);

  const hasSourceVideo = Boolean(sourceVideoUrl);
  const canExtract = hasSourceVideo && nodeData.status !== "loading" && !isRunning;

  const handleExtract = () => {
    regenerateNode(id);
  };

  return (
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={320}
      minHeight={320}
      aspectFitMedia={nodeData.outputImage}
    >
      {/* Video In (target, left, 50%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{ right: "calc(100% + 8px)", top: "calc(50% - 7px)", color: "rgb(168, 85, 247)" }}
      >
        Video In
      </div>

      {/* Image Out (source, right, 50%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
        isConnectable={true}
        style={{ top: "50%" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ left: "calc(100% + 8px)", top: "calc(50% - 7px)", color: "rgb(59, 130, 246)" }}
      >
        Image Out
      </div>

      <div className="flex-1 flex flex-col min-h-0 gap-2">
        {/* Image preview area */}
        <div className="flex-1 min-h-0 relative">
          {nodeData.outputImage ? (
            <>
              <img
                src={nodeData.outputImage}
                className="absolute inset-0 w-full h-full object-contain rounded"
                alt="Extracted frame"
              />
              {/* Expand + Clear output button */}
              <div className="absolute top-1 right-1 flex gap-1">
                <MediaExpandButton nodeId={id} mediaUrl={nodeData.outputImage} className="w-5 h-5 bg-neutral-900/80 hover:bg-neutral-700 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors" />
                <button
                  onClick={() => updateNodeData(id, { outputImage: null, status: "idle" })}
                  className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="Clear extracted frame"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-600 rounded">
              <span className="text-[10px] text-neutral-500 text-center px-4">
                Connect a video and extract a frame
              </span>
            </div>
          )}
        </div>

        {/* Frame position toggle (only when source video connected) */}
        {hasSourceVideo && (
          <div className="nodrag nowheel shrink-0 flex gap-1 px-1">
            <button
              onClick={() => updateNodeData(id, { framePosition: "first", outputImage: null })}
              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                nodeData.framePosition === "first"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              First
            </button>
            <button
              onClick={() => updateNodeData(id, { framePosition: "last", outputImage: null })}
              className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                nodeData.framePosition === "last"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Last
            </button>
          </div>
        )}

        {/* Extract Frame button */}
        <div className="shrink-0 flex justify-end px-1">
          <button
            onClick={handleExtract}
            disabled={!canExtract}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            {nodeData.status === "loading" ? "Extracting..." : "Extract Frame"}
          </button>
        </div>

        {/* Processing overlay */}
        {nodeData.status === "loading" && (
          <div className="absolute inset-0 bg-neutral-900/70 rounded flex flex-col items-center justify-center gap-2">
            <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-white text-xs">Extracting frame...</span>
          </div>
        )}

        {/* Error display */}
        {nodeData.status === "error" && nodeData.error && (
          <div className="shrink-0 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
            <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
          </div>
        )}
      </div>
    </BaseNode>
  );
}
