"use client";

import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore, useProviderApiKeys } from "@/store/workflowStore";
import { useShallow } from "zustand/shallow";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";
import { Generate3DNodeData, ProviderType, SelectedModel, ModelInputDef } from "@/types";
import { ProviderModel, ModelCapability } from "@/lib/providers/types";
import { ModelSearchDialog } from "@/components/modals/ModelSearchDialog";
import { useToast } from "@/components/Toast";
import { ProviderBadge } from "../shared/ProviderBadge";
import { getModelPageUrl, getProviderDisplayName } from "@/utils/providerUrls";
import { NodeRunButton } from "../shared/NodeRunButton";
import { ConnectedImageThumbnails } from "../shared/ConnectedImageThumbnails";
import { Generate3DToolbar } from "./Generate3DToolbar";

const InlineGLBViewer = dynamic(
  () => import("../shared/InlineGLBViewer").then((m) => ({ default: m.InlineGLBViewer })),
  { ssr: false }
);

// 3D generation capabilities
const THREE_D_CAPABILITIES: ModelCapability[] = ["text-to-3d", "image-to-3d"];

type Generate3DNodeType = Node<Generate3DNodeData, "generate3d">;

export function Generate3DNode({ id, data, selected }: NodeProps<Generate3DNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
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
  const { replicateApiKey, falApiKey, kieApiKey } = useProviderApiKeys();
  const [isBrowseDialogOpen, setIsBrowseDialogOpen] = useState(false);
  const [isPromptFocused, setIsPromptFocused] = useState(false);

  // Get the current selected provider (default to fal since most 3D models are there)
  const currentProvider: ProviderType = nodeData.selectedModel?.provider || "fal";

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

  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const isRunning = useWorkflowStore((state) => state.isRunning);

  const handleRegenerate = useCallback(() => {
    regenerateNode(id);
  }, [id, regenerateNode]);

  // Handle model selection from browse dialog
  const handleBrowseModelSelect = useCallback((model: ProviderModel) => {
    const newSelectedModel: SelectedModel = {
      provider: model.provider,
      modelId: model.id,
      displayName: model.name,
    };
    updateNodeData(id, { selectedModel: newSelectedModel, parameters: {} });
    setIsBrowseDialogOpen(false);
  }, [id, updateNodeData]);

  // Dynamic title based on selected model
  const displayTitle = useMemo(() => {
    if (nodeData.selectedModel?.displayName && nodeData.selectedModel.modelId) {
      return nodeData.selectedModel.displayName;
    }
    return "Select 3D model...";
  }, [nodeData.selectedModel?.displayName, nodeData.selectedModel?.modelId]);

  // Track previous status to detect error transitions
  const prevStatusRef = useRef(nodeData.status);

  // Show toast when error occurs
  useEffect(() => {
    if (nodeData.status === "error" && prevStatusRef.current !== "error" && nodeData.error) {
      useToast.getState().show("3D generation failed", "error", true, nodeData.error);
    }
    prevStatusRef.current = nodeData.status;
  }, [nodeData.status, nodeData.error]);

  const captureRef = useRef<(() => string | null) | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);

  const handleClear3D = useCallback(() => {
    updateNodeData(id, {
      output3dUrl: null,
      savedFilename: null,
      savedFilePath: null,
      capturedImage: null,
      status: "idle",
      error: null,
    });
  }, [id, updateNodeData]);

  const handleCapture = useCallback(() => {
    const dataUrl = captureRef.current?.() ?? null;
    if (dataUrl) {
      updateNodeData(id, { capturedImage: dataUrl });
    } else {
      useToast.getState().show("Failed to capture 3D view", "error");
    }
  }, [id, updateNodeData]);

  const handleClearCapture = useCallback(() => {
    updateNodeData(id, { capturedImage: null });
  }, [id, updateNodeData]);

  return (
    <>
  <Generate3DToolbar nodeId={id} />
    <BaseNode
      id={id}
      selected={selected}
      isExecuting={isRunning}
      hasError={nodeData.status === "error"}
      fullBleed
      footerRight={<NodeRunButton nodeId={id} disabled={isRunning} />}
      contentClassName="pt-0 px-0 pb-4 flex-1 min-h-0 flex flex-col"
    >
      {/* Dynamic input handles based on model schema */}
      {nodeData.inputSchema && nodeData.inputSchema.length > 0 ? (
        (() => {
          const imageInputs = nodeData.inputSchema!.filter(i => i.type === "image");
          const textInputs = nodeData.inputSchema!.filter(i => i.type === "text");

          const hasImageInput = imageInputs.length > 0;
          const hasTextInput = textInputs.length > 0;

          const handles: Array<{
            id: string;
            type: "image" | "text";
            label: string;
            schemaName: string | null;
            description: string | null;
            isPlaceholder: boolean;
          }> = [];

          if (hasImageInput) {
            imageInputs.forEach((input, index) => {
              handles.push({
                id: `image-${index}`,
                type: "image",
                label: input.label,
                schemaName: input.name,
                description: input.description || null,
                isPlaceholder: false,
              });
            });
          } else {
            handles.push({
              id: "image",
              type: "image",
              label: "Image",
              schemaName: null,
              description: "Not used by this model",
              isPlaceholder: true,
            });
          }

          if (hasTextInput) {
            textInputs.forEach((input, index) => {
              handles.push({
                id: `text-${index}`,
                type: "text",
                label: input.label,
                schemaName: input.name,
                description: input.description || null,
                isPlaceholder: false,
              });
            });
          } else {
            handles.push({
              id: "text",
              type: "text",
              label: "Prompt",
              schemaName: null,
              description: "Not used by this model",
              isPlaceholder: true,
            });
          }

          const imageHandles = handles.filter(h => h.type === "image");
          const textHandles = handles.filter(h => h.type === "text");
          const totalSlots = imageHandles.length + textHandles.length + 1;

          const renderedHandles = handles.map((handle) => {
            const isImage = handle.type === "image";
            const typeIndex = isImage
              ? imageHandles.findIndex(h => h.id === handle.id)
              : textHandles.findIndex(h => h.id === handle.id);
            const adjustedIndex = isImage ? typeIndex : imageHandles.length + 1 + typeIndex;
            const topPercent = ((adjustedIndex + 1) / (totalSlots + 1)) * 100;

            return (
              <React.Fragment key={handle.id}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={handle.id}
                  style={{
                    top: `${topPercent}%`,
                    opacity: handle.isPlaceholder ? 0.3 : 1,
                  }}
                  data-handletype={handle.type}
                  data-schema-name={handle.schemaName || undefined}
                  isConnectable={true}
                  title={handle.description || handle.label}
                />
                <div
                  className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
                  style={{
                    right: `calc(100% + 8px)`,
                    top: `calc(${topPercent}% - 18px)`,
                    color: isImage ? "var(--handle-color-image)" : "var(--handle-color-text)",
                    opacity: handle.isPlaceholder ? 0.3 : 1,
                  }}
                >
                  {handle.label}
                </div>
              </React.Fragment>
            );
          });

          return <>{renderedHandles}</>;
        })()
      ) : (
        // Default handles when no schema
        <>
          <Handle
            type="target"
            position={Position.Left}
            id="image"
            style={{ top: "35%" }}
            data-handletype="image"
            isConnectable={true}
          />
          <div
            className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
            style={{
              right: `calc(100% + 8px)`,
              top: "calc(35% - 18px)",
              color: "var(--handle-color-image)",
            }}
          >
            Image
          </div>
          <Handle
            type="target"
            position={Position.Left}
            id="text"
            style={{ top: "65%" }}
            data-handletype="text"
          />
          <div
            className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none text-right"
            style={{
              right: `calc(100% + 8px)`,
              top: "calc(65% - 18px)",
              color: "var(--handle-color-text)",
            }}
          >
            Prompt
          </div>
        </>
      )}

      {/* 3D output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="3d"
        style={{ top: "40%" }}
        data-handletype="3d"
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: `calc(100% + 8px)`,
          top: "calc(40% - 18px)",
          color: "var(--handle-color-3d)",
        }}
      >
        3D
      </div>
      {/* Image output (captured view) — same as 3D Viewer */}
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        style={{ top: "60%" }}
        data-handletype="image"
      />
      <div
        className="handle-label absolute text-[10px] font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: `calc(100% + 8px)`,
          top: "calc(60% - 18px)",
          color: "var(--handle-color-image)",
        }}
      >
        Image
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Connected image thumbnails */}
        <div className="absolute bottom-2 left-2 z-[5]">
          <ConnectedImageThumbnails nodeId={id} />
        </div>
        {/* Preview area: inline 3D viewer when model is generated */}
        {nodeData.output3dUrl ? (
          <>
          <div className="relative w-full flex-1 min-h-[120px] flex flex-col overflow-hidden">
            <InlineGLBViewer
              glbUrl={nodeData.output3dUrl}
              className="flex-1 w-full"
              minHeight={120}
              captureRef={captureRef}
              autoRotate={autoRotate}
              onError={() => {
                useToast.getState().show("Failed to load 3D model", "error");
              }}
            />
            {/* Controls bar — same as 3D Viewer: filename, auto-rotate, capture */}
            <div className="absolute bottom-0 left-0 right-0 z-10 px-3 py-1.5 flex items-center justify-between gap-1 pointer-events-none bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center gap-1.5 min-w-0 pointer-events-auto">
                {nodeData.savedFilename && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!nodeData.savedFilePath) {
                        useToast.getState().show("No file path available", "error");
                        return;
                      }
                      try {
                        const res = await fetch("/api/open-file", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ filePath: nodeData.savedFilePath }),
                        });
                        if (!res.ok) {
                          const detail = await res.text().catch(() => `Status ${res.status}`);
                          useToast.getState().show("Failed to open file", "error", true, detail);
                        }
                      } catch (err) {
                        console.error("Failed to open file location:", err);
                        useToast.getState().show("Failed to open file location", "error");
                      }
                    }}
                    className="nodrag nopan text-[10px] text-neutral-400 hover:text-orange-300 truncate max-w-[100px] cursor-pointer transition-colors"
                    title={`Open: ${nodeData.savedFilePath}`}
                  >
                    {nodeData.savedFilename}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAutoRotate((v) => !v)}
                  title={autoRotate ? "Stop auto-rotate" : "Auto-rotate"}
                  className={`nodrag nopan p-0.5 rounded transition-colors ${
                    autoRotate ? "text-cyan-400 bg-cyan-400/10" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                <button
                  type="button"
                  onClick={handleCapture}
                  title="Capture current view as image"
                  className="nodrag nopan flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300 hover:text-neutral-100 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                  </svg>
                  Capture
                </button>
              </div>
            </div>
            {/* Loading overlay for re-generation */}
            {nodeData.status === "loading" && (
              <div className="absolute inset-0 bg-neutral-900/70 flex items-center justify-center z-20">
                <svg
                  className="w-6 h-6 animate-spin text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {/* Error overlay */}
            {nodeData.status === "error" && (
              <div className="absolute inset-0 bg-red-900/40 flex flex-col items-center justify-center gap-1 z-20">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-white text-xs font-medium">Generation failed</span>
                <span className="text-white/70 text-[10px]">See toast for details</span>
              </div>
            )}
            <div className="absolute top-1 right-1 z-20">
              <button
                onClick={handleClear3D}
                className="w-5 h-5 bg-neutral-900/80 hover:bg-red-600/80 rounded flex items-center justify-center text-neutral-400 hover:text-white transition-colors nodrag nopan"
                title="Clear 3D model"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          {nodeData.capturedImage && (
            <div className="px-3 py-1.5 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-green-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Captured
                </span>
                <button
                  type="button"
                  onClick={handleClearCapture}
                  className="nodrag nopan text-[10px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Clear
                </button>
              </div>
              <img
                src={nodeData.capturedImage}
                alt="Captured 3D view"
                className="w-full rounded border border-neutral-700 bg-neutral-900"
              />
            </div>
          )}
          </>
        ) : (
          <div className="w-full flex-1 min-h-[112px] bg-neutral-900/40 flex flex-col items-center justify-center">
            {nodeData.status === "loading" ? (
              <svg
                className="w-4 h-4 animate-spin text-neutral-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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

        {/* Blur overlay: at bottom by default, expands to full node when textarea focused. Same as Generate Image. */}
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
    </BaseNode>

    {/* Model browser dialog */}
    {isBrowseDialogOpen && (
      <ModelSearchDialog
        isOpen={isBrowseDialogOpen}
        onClose={() => setIsBrowseDialogOpen(false)}
        onModelSelected={handleBrowseModelSelect}
        initialCapabilityFilter="3d"
      />
    )}
    </>
  );
}
