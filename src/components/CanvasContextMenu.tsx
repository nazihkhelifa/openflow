"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useReactFlow } from "@xyflow/react";
import type { NodeType } from "@/types";
import { ALL_NODES_CATEGORIES } from "@/lib/node-categories";

interface CanvasContextMenuProps {
  position: { x: number; y: number };
  nodeId?: string;
  onClose: () => void;
}

export function CanvasContextMenu({ position, nodeId, onClose }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNodeList, setShowNodeList] = useState(false);
  const addNode = useWorkflowStore((state) => state.addNode);
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const executeWorkflow = useWorkflowStore((state) => state.executeWorkflow);
  const regenerateNode = useWorkflowStore((state) => state.regenerateNode);
  const { screenToFlowPosition } = useReactFlow();

  const flowPosition = screenToFlowPosition({ x: position.x, y: position.y });

  const handleDeleteNode = useCallback(() => {
    if (nodeId) {
      removeNode(nodeId);
      onClose();
    }
  }, [nodeId, removeNode, onClose]);

  const handleRunFromNode = useCallback(() => {
    if (nodeId) {
      executeWorkflow(nodeId);
      onClose();
    }
  }, [nodeId, executeWorkflow, onClose]);

  const handleRunNodeOnly = useCallback(() => {
    if (nodeId) {
      regenerateNode(nodeId);
      onClose();
    }
  }, [nodeId, regenerateNode, onClose]);

  const handleAddNode = useCallback(
    (type: NodeType) => {
      addNode(type, flowPosition);
      onClose();
    },
    [addNode, flowPosition, onClose]
  );

  const handleAddComment = useCallback(() => {
    addNode("comment", flowPosition);
    onClose();
  }, [addNode, flowPosition, onClose]);

  const handleSelectAll = useCallback(() => {
    const { nodes, onNodesChange } = useWorkflowStore.getState();
    if (nodes.length > 0) {
      onNodesChange(
        nodes.map((n) => ({ type: "select" as const, id: n.id, selected: true }))
      );
    }
    onClose();
  }, [onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNodeList) {
          setShowNodeList(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, showNodeList]);

  if (nodeId) {
    return (
      <div
        ref={menuRef}
        className="fixed z-[200] bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden min-w-[180px]"
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <div className="py-1">
          <button
            onClick={handleDeleteNode}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-red-400 hover:bg-neutral-700 hover:text-red-300 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            Delete node
          </button>
          <button
            onClick={handleRunFromNode}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run from selected node
          </button>
          <button
            onClick={handleRunNodeOnly}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run selected node only
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden min-w-[180px] max-h-[400px] overflow-y-auto"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {showNodeList ? (
        <>
          <button
            onClick={() => setShowNodeList(false)}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-400 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 border-b border-neutral-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          <div className="py-1 max-h-[320px] overflow-y-auto">
            {ALL_NODES_CATEGORIES.map((category, catIndex) => (
              <div key={category.label}>
                <div
                  className={`px-3 py-1 text-[10px] text-neutral-500 uppercase tracking-wide${
                    catIndex > 0 ? " border-t border-neutral-700" : ""
                  }`}
                >
                  {category.label}
                </div>
                {category.nodes.map((node) => (
                  <button
                    key={node.type}
                    onClick={() => handleAddNode(node.type)}
                    className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    {node.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="py-1">
          <button
            onClick={() => setShowNodeList(true)}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Add a new node
          </button>
          <button
            onClick={() => handleAddNode("mediaInput")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Add Upload
          </button>
          <button
            onClick={handleAddComment}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Add comment
          </button>
          <button
            onClick={handleSelectAll}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 3v18h18" />
              <path d="M18 9V3" />
              <path d="M18 15V3" />
              <path d="M3 15V3" />
              <path d="M3 21V9" />
            </svg>
            Select all
          </button>
        </div>
      )}
    </div>
  );
}
