"use client";

import { useCallback } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { Layers, Maximize2 } from "lucide-react";

type AnnotationNodeToolbarProps = {
  nodeId: string;
  disabled?: boolean;
  onEditClick: () => void;
  onFullscreenClick?: () => void;
};

export function AnnotationNodeToolbar({
  nodeId,
  disabled = false,
  onEditClick,
  onFullscreenClick,
}: AnnotationNodeToolbarProps) {
  const stopProp = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <NodeToolbar
      nodeId={nodeId}
      position={Position.Top}
      offset={8}
      align="center"
      className="nodrag nopan"
      style={{ pointerEvents: "auto" }}
    >
      <div className="overflow-visible" onMouseDownCapture={stopProp} onPointerDownCapture={stopProp}>
        <div className="relative flex origin-bottom items-center gap-x-px rounded-2xl border border-neutral-600 bg-neutral-900/90 px-1 py-1 shadow-lg backdrop-blur-sm text-[11px]">
          <button
            type="button"
            onClick={onEditClick}
            disabled={disabled}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
            title="Edit layers"
            aria-label="Edit layers"
          >
            <Layers className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-neutral-700/80" />

          <button
            type="button"
            onClick={disabled ? undefined : onFullscreenClick}
            disabled={disabled || !onFullscreenClick}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl p-1.5 text-neutral-300 hover:bg-white/5 disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
            title="Fullscreen"
            aria-label="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </NodeToolbar>
  );
}

