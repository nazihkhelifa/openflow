"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { NodeType } from "@/types";
import { useReactFlow } from "@xyflow/react";
import { MediaPopover } from "./MediaPopover";
import { ALL_NODES_CATEGORIES } from "@/lib/node-categories";

const iconButtonClass =
  "inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-lg text-[var(--color-greyscale-400)] transition-all duration-300 hover:bg-white/5 hover:text-[var(--color-text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50";

// Get the center of the React Flow pane in screen coordinates
function getPaneCenter() {
  const pane = document.querySelector('.react-flow');
  if (pane) {
    const rect = pane.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

function AllNodesMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const addNode = useWorkflowStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleAddNode = useCallback((type: NodeType) => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x + Math.random() * 100 - 50,
      y: center.y + Math.random() * 100 - 50,
    });

    addNode(type, position);
    setIsOpen(false);
  }, [addNode, screenToFlowPosition]);

  const handleDragStart = useCallback((event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData("application/node-type", type);
    event.dataTransfer.effectAllowed = "copy";
    setIsOpen(false);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-full bg-white text-[var(--color-greyscale-900)] transition-colors duration-300 hover:bg-[var(--color-greyscale-300)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Add node"
        data-id="add-node-button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 ml-2 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden min-w-[180px] max-h-[400px] overflow-y-auto z-[100]">
          {ALL_NODES_CATEGORIES.map((category, catIndex) => (
            <div key={category.label}>
              <div className={`px-3 py-1 text-[10px] text-neutral-500 uppercase tracking-wide${catIndex > 0 ? " border-t border-neutral-700" : ""}`}>
                {category.label}
              </div>
              {category.nodes.map((node) => (
                <button
                  key={node.type}
                  onClick={() => handleAddNode(node.type)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, node.type)}
                  className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2 cursor-grab active:cursor-grabbing"
                >
                  {node.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCommentButton() {
  const addNode = useWorkflowStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const handleClick = useCallback(() => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x + Math.random() * 100 - 50,
      y: center.y + Math.random() * 100 - 50,
    });
    addNode("comment", position);
  }, [addNode, screenToFlowPosition]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={iconButtonClass}
      title="Add comment"
      data-id="add-comment-button"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}

export function FloatingActionBar() {
  return (
    <aside
      className="fixed left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-full p-2 backdrop-blur-[16px]"
      style={{ backgroundColor: "var(--background-transparent-black-default)" }}
      data-id="project-side-toolbar"
    >
      <AllNodesMenu />

      <MediaPopover />

      <AddCommentButton />
    </aside>
  );
}
