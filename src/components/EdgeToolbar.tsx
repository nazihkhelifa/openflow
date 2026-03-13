"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import { WorkflowEdgeData } from "@/types";
import { useMemo, useEffect, useState, useRef } from "react";

export function EdgeToolbar() {
  const { edges, toggleEdgePause, removeEdge } = useWorkflowStore();
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const previousSelectedEdgeId = useRef<string | null>(null);

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.selected),
    [edges]
  );

  // Helper function to compute the image connection sequence number
  const getImageSequenceNumber = (edge: typeof selectedEdge): number | null => {
    if (!edge) return null;

    // Only show for image connections
    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;
    const isImageConnection =
      (sourceHandle === "image" || sourceHandle?.startsWith("image-")) ||
      (targetHandle === "image" || targetHandle?.startsWith("image-"));

    if (!isImageConnection) return null;

    // Find all image edges going to the same target + target handle
    const siblingEdges = edges.filter(
      (e) => e.target === edge.target && e.targetHandle === edge.targetHandle
    );

    // If only one connection, no need for numbering
    if (siblingEdges.length <= 1) return null;

    // Sort by createdAt timestamp (fallback to edge ID for legacy edges without timestamp)
    const sorted = [...siblingEdges].sort((a, b) => {
      const timeA = (a.data as WorkflowEdgeData)?.createdAt || 0;
      const timeB = (b.data as WorkflowEdgeData)?.createdAt || 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const index = sorted.findIndex((e) => e.id === edge.id);
    return index >= 0 ? index + 1 : null;
  };

  const sequenceNumber = getImageSequenceNumber(selectedEdge);

  // Track mouse position when edge selection changes
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Check if clicking on an edge
      const target = e.target as Element;
      if (target.closest('.react-flow__edge')) {
        setClickPosition({ x: e.clientX, y: e.clientY - 40 }); // 40px above click
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Reset click position when edge is deselected
  useEffect(() => {
    if (!selectedEdge && previousSelectedEdgeId.current) {
      setClickPosition(null);
    }
    previousSelectedEdgeId.current = selectedEdge?.id || null;
  }, [selectedEdge]);

  const toolbarPosition = clickPosition;

  const handleTogglePause = () => {
    if (selectedEdge) {
      toggleEdgePause(selectedEdge.id);
    }
  };

  const handleDelete = () => {
    if (selectedEdge) {
      removeEdge(selectedEdge.id);
    }
  };

  if (!toolbarPosition || !selectedEdge) return null;

  const hasPause = selectedEdge.data?.hasPause;

  return (
    <div
      className="fixed z-[100] flex items-center gap-1 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl p-1"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: "translateX(-50%)",
      }}
    >
      {sequenceNumber !== null && (
        <span className="text-[10px] font-medium text-neutral-300 px-2 border-r border-neutral-600">
          Image {sequenceNumber}
        </span>
      )}
      <button
        onClick={handleTogglePause}
        className={`p-1.5 rounded hover:bg-neutral-700 transition-colors ${
          hasPause
            ? "text-amber-400 hover:text-amber-300"
            : "text-neutral-400 hover:text-neutral-100"
        }`}
        title={hasPause ? "Remove pause" : "Add pause"}
      >
        {hasPause ? (
          // Play icon (resume)
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          // Pause icon
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        )}
      </button>
      <button
        onClick={handleDelete}
        className="p-1.5 rounded hover:bg-neutral-700 text-neutral-400 hover:text-red-400 transition-colors"
        title="Delete"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
          />
        </svg>
      </button>
    </div>
  );
}
