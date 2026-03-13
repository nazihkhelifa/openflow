"use client";

import { useMemo } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import type { GenerateVideoNodeData } from "@/types";
import { ProviderBadge } from "../shared/ProviderBadge";

interface GenerateVideoToolbarProps {
  nodeId: string;
}

export function GenerateVideoToolbar({ nodeId }: GenerateVideoToolbarProps) {
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
        <div className="flex items-center gap-1 rounded-xl border border-neutral-600 bg-neutral-800/95 px-2 py-1 shadow-lg backdrop-blur-sm text-[11px] max-w-[180px]">
          <ProviderBadge provider={data?.selectedModel?.provider ?? "fal"} />
          <span className="truncate text-neutral-100">{modelLabel}</span>
        </div>
      </div>
    </NodeToolbar>
  );
}

