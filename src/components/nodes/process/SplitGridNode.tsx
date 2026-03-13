"use client";

import { useCallback, useState, useEffect } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { SplitGridNodeData } from "@/types";
import { SplitGridSettingsModal } from "@/components/SplitGridSettingsModal";
import { MediaExpandButton } from "../shared/MediaExpandButton";
import { ConnectedImageThumbnails } from "../shared/ConnectedImageThumbnails";

type SplitGridNodeType = Node<SplitGridNodeData, "splitGrid">;

export function SplitGridNode({ id, data, selected }: NodeProps<SplitGridNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const [showSettings, setShowSettings] = useState(false);

  // Show settings modal on first creation (when not configured)
  useEffect(() => {
    if (!nodeData.isConfigured && (!nodeData.childNodeIds || nodeData.childNodeIds.length === 0)) {
      setShowSettings(true);
    }
  }, [nodeData.isConfigured, nodeData.childNodeIds]);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleSplit = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  return (
    <>
      <BaseNode
        id={id}
        selected={selected}
        hasError={nodeData.status === "error"}
        fullBleed
      >
        {/* Image input handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="image"
          data-handletype="image"
          style={{ zIndex: 10 }}
        />

        {/* Reference output handle for visual links to child nodes */}
        <Handle
          type="source"
          position={Position.Right}
          id="reference"
          data-handletype="reference"
          className="!bg-gray-500"
          style={{ zIndex: 10 }}
        />

        {/* Full-bleed preview area */}
        {nodeData.sourceImage ? (
          <div className="relative w-full h-full group">
            <div className="absolute bottom-2 left-2 z-10">
              <ConnectedImageThumbnails nodeId={id} />
            </div>
            <img
              src={nodeData.sourceImage}
              alt="Source grid"
              className="w-full h-full object-cover rounded-xl"
            />
            <div className="absolute top-1 right-1">
              <MediaExpandButton nodeId={id} mediaUrl={nodeData.sourceImage} className="w-5 h-5 bg-neutral-900/80 hover:bg-neutral-700 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors" />
            </div>
            {/* Grid overlay visualization */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${nodeData.gridCols}, 1fr)`,
                gridTemplateRows: `repeat(${nodeData.gridRows}, 1fr)`,
              }}
            >
              {Array.from({ length: nodeData.targetCount }).map((_, i) => (
                <div
                  key={i}
                  className="border border-blue-400/50"
                />
              ))}
            </div>
            {/* Loading overlay */}
            {nodeData.status === "loading" && (
              <div className="absolute inset-0 bg-neutral-900/70 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full min-h-[112px] bg-neutral-900/40 flex flex-col items-center justify-center rounded-xl relative">
            <div className="absolute bottom-2 left-2 z-10">
              <ConnectedImageThumbnails nodeId={id} />
            </div>
            {nodeData.status === "error" ? (
              <span className="text-[10px] text-red-400 text-center px-2">
                {nodeData.error || "Error"}
              </span>
            ) : nodeData.status === "loading" ? (
              <svg className="w-4 h-4 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <>
                <svg className="w-5 h-5 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                <span className="text-neutral-500 text-[10px] mt-1">
                  Connect image
                </span>
              </>
            )}
          </div>
        )}

        {/* Controls overlay pinned at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-2 bg-neutral-900/80 backdrop-blur-sm rounded-b-xl space-y-1">
          {/* Config summary */}
          <div className="flex items-center justify-between text-[10px] text-neutral-400">
            <span>{nodeData.gridRows}x{nodeData.gridCols} grid ({nodeData.targetCount} images)</span>
            <button
              onClick={handleOpenSettings}
              className="nodrag nopan text-blue-400 hover:text-blue-300 transition-colors"
            >
              Settings
            </button>
          </div>

          {/* Child node count / status */}
          <div className="flex items-center justify-between">
            {nodeData.isConfigured ? (
              <div className="text-[10px] text-neutral-500">
                {nodeData.childNodeIds?.length ?? 0} generate sets created
              </div>
            ) : (
              <div className="text-[10px] text-amber-400">
                Not configured - click Settings
              </div>
            )}

            {/* Split button */}
            <button
              onClick={handleSplit}
              disabled={isRunning || !nodeData.isConfigured || !nodeData.sourceImage}
              className="nodrag nopan px-2 py-0.5 text-[10px] border border-white hover:bg-white hover:text-neutral-900 disabled:border-neutral-600 disabled:text-neutral-600 disabled:cursor-not-allowed text-white rounded transition-colors"
              title={!nodeData.isConfigured ? "Configure node first" : !nodeData.sourceImage ? "Connect an image first" : "Split grid"}
            >
              Split
            </button>
          </div>
        </div>
      </BaseNode>

      {/* Settings Modal */}
      {showSettings && (
        <SplitGridSettingsModal
          nodeId={id}
          nodeData={nodeData}
          onClose={handleCloseSettings}
        />
      )}
    </>
  );
}
