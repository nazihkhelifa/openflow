"use client";

import { ArrowUp } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";
import { hasRequiredInputsConnected } from "@/store/utils/connectedInputs";

interface NodeRunButtonProps {
  nodeId: string;
  disabled?: boolean;
  className?: string;
}

export function NodeRunButton({ nodeId, disabled, className = "" }: NodeRunButtonProps) {
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const status = useWorkflowStore((state) => {
    const node = state.nodes.find((n) => n.id === nodeId);
    // Most node data objects expose a `status` field (e.g. "idle" | "loading" | "error")
    // If not present, treat as idle.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (node?.data as any)?.status as string | undefined;
  });
  const canRun = useWorkflowStore((state) => {
    const node = state.nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    return hasRequiredInputsConnected(node, state.edges);
  });
  const isRunning = status === "loading";
  const isDisabled = disabled || !canRun || isRunning;

  return (
    <button
      onClick={() => regenerateNode(nodeId)}
      disabled={isDisabled}
      className={`nodrag nopan inline-flex items-center justify-center shrink-0 h-7 w-7 rounded-full bg-white text-neutral-900 hover:bg-white/90 transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800 mr-1 ${className}`}
      title={!canRun ? "Connect required inputs to run" : isRunning ? "Generating..." : "Run this node"}
      aria-label={isRunning ? "Generating" : "Run"}
    >
      {isRunning ? (
        <svg
          className="size-3 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <ArrowUp className="size-3 stroke-[2.5]" />
      )}
    </button>
  );
}
