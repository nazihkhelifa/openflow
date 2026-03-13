"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { EaseCurveNodeData } from "@/types";
import { checkEncoderSupport } from "@/hooks/useStitchVideos";
import { useVideoBlobUrl } from "@/hooks/useVideoBlobUrl";
import { getVideoDimensions, calculateNodeSizeForFullBleed, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { MediaExpandButton } from "../shared/MediaExpandButton";
import { NodeVideoPlayer } from "../shared/NodeVideoPlayer";

type EaseCurveNodeType = Node<EaseCurveNodeData, "easeCurve">;

const VIDEO_HEIGHT = 320;

export function EaseCurveNode({ id, data, selected }: NodeProps<EaseCurveNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const edges = useWorkflowStore((state) => state.edges);
  const removeEdge = useWorkflowStore((state) => state.removeEdge);
  const videoBlobUrl = useVideoBlobUrl(nodeData.outputVideo ?? null);
  const { getNode, updateNode } = useReactFlow();
  const prevOutputVideoRef = useRef<string | null>(null);

  // Auto-resize to match output video aspect ratio
  useEffect(() => {
    if (!nodeData.outputVideo || nodeData.outputVideo === prevOutputVideoRef.current) {
      prevOutputVideoRef.current = nodeData.outputVideo ?? null;
      return;
    }
    prevOutputVideoRef.current = nodeData.outputVideo;

    requestAnimationFrame(() => {
      getVideoDimensions(nodeData.outputVideo!).then((dims) => {
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
  }, [id, nodeData.outputVideo, getNode, updateNode]);

  // Check encoder support on mount
  useEffect(() => {
    if (nodeData.encoderSupported === null) {
      checkEncoderSupport().then((supported) => {
        updateNodeData(id, { encoderSupported: supported });
      });
    }
  }, [id, nodeData.encoderSupported, updateNodeData]);

  // Check if this node has an incoming easeCurve connection (inheritance)
  const inheritedEdge = useMemo(() => {
    return edges.find((e) => e.target === id && e.targetHandle === "easeCurve") || null;
  }, [edges, id]);

  const handleBreakInheritance = useCallback(() => {
    if (inheritedEdge) {
      removeEdge(inheritedEdge.id);
      updateNodeData(id, { inheritedFrom: null });
    }
  }, [inheritedEdge, removeEdge, id, updateNodeData]);

  // Shared handles rendered in ALL states (4 handles with labels)
  const renderHandles = () => (
    <>
      {/* Video In (target, left, 35%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "35%" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{ right: "calc(100% + 8px)", top: "calc(35% - 7px)", color: "rgb(168, 85, 247)" }}
      >
        Video In
      </div>

      {/* Video Out (source, right, 35%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        data-handletype="video"
        isConnectable={true}
        style={{ top: "35%" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ left: "calc(100% + 8px)", top: "calc(35% - 7px)", color: "rgb(168, 85, 247)" }}
      >
        Video Out
      </div>

      {/* Settings In (target, left, 75%) */}
      <Handle
        type="target"
        position={Position.Left}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
        style={{ right: "calc(100% + 8px)", top: "calc(75% - 7px)", color: "rgb(190, 242, 100)" }}
      >
        Settings
      </div>

      {/* Settings Out (source, right, 75%) */}
      <Handle
        type="source"
        position={Position.Right}
        id="easeCurve"
        data-handletype="easeCurve"
        isConnectable={true}
        style={{ top: "75%", background: "rgb(190, 242, 100)" }}
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{ left: "calc(100% + 8px)", top: "calc(75% - 7px)", color: "rgb(190, 242, 100)" }}
      >
        Settings
      </div>
    </>
  );

  // Encoder not supported
  if (nodeData.encoderSupported === false) {
    return (
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
        minWidth={340}
        minHeight={VIDEO_HEIGHT}
      >
        {renderHandles()}
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
          <svg className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span className="text-xs text-neutral-400">
            Your browser doesn&apos;t support video encoding.
          </span>
          <a
            href="https://discord.com/invite/89Nr6EKkTf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 underline"
          >
            Doesn&apos;t seem right? Message Willie on Discord.
          </a>
        </div>
      </BaseNode>
    );
  }

  // Checking encoder state
  if (nodeData.encoderSupported === null) {
    return (
      <BaseNode
        id={id}
        selected={selected}
        fullBleed
        minWidth={340}
        minHeight={VIDEO_HEIGHT}
      >
        {renderHandles()}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-neutral-400">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs">Checking encoder...</span>
          </div>
        </div>
      </BaseNode>
    );
  }

  return (
    <BaseNode
      id={id}
      selected={selected}
      fullBleed
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      minWidth={340}
      minHeight={VIDEO_HEIGHT}
      aspectFitMedia={nodeData.outputVideo}
    >
      {renderHandles()}

      {/* Video preview (full-bleed) */}
      {nodeData.outputVideo ? (
        <div className="relative w-full h-full flex flex-col">
          <NodeVideoPlayer
            src={videoBlobUrl ?? undefined}
            autoPlay
            loop
            muted
            objectFit="cover"
            compact
            className="flex-1 min-h-0"
            actions={
              <>
                <MediaExpandButton nodeId={id} mediaUrl={nodeData.outputVideo} mediaType="video" className="w-5 h-5 bg-neutral-900/80 hover:bg-neutral-700 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors" />
                <button
                  onClick={() => updateNodeData(id, { outputVideo: null, status: "idle" })}
                  className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
                  title="Clear video"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            }
          />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-neutral-900/40 rounded-xl">
          <span className="text-[10px] text-neutral-500">Run workflow to apply ease curve</span>
        </div>
      )}

      {/* Processing overlay */}
      {nodeData.status === "loading" && (
        <div className="absolute inset-0 bg-neutral-900/70 rounded-xl flex flex-col items-center justify-center gap-2">
          <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-white text-xs">Processing... {Math.round(nodeData.progress)}%</span>
        </div>
      )}

      {/* Error display */}
      {nodeData.status === "error" && nodeData.error && (
        <div className="absolute bottom-2 left-2 right-2 px-2 py-1.5 bg-red-900/30 border border-red-700/50 rounded">
          <p className="text-[10px] text-red-400 break-words">{nodeData.error}</p>
        </div>
      )}
    </BaseNode>
  );
}
