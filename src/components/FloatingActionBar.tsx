"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { NodeType } from "@/types";
import { useReactFlow } from "@xyflow/react";
import { MediaPopover } from "./MediaPopover";
import { CANVAS_MENU_SECTIONS } from "@/lib/canvasMenuSections";

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
        <div className="absolute left-full top-0 ml-2 z-[100] w-80 max-w-80 rounded-xl border border-neutral-700/40 bg-[var(--background-transparent-black-default)] backdrop-blur-lg overflow-hidden">
          <div className="px-1 py-1 max-h-[384px] overflow-y-auto">
            {CANVAS_MENU_SECTIONS.map((category, catIndex) => (
              <div key={category.label}>
                <div className={`select-none px-3 py-2 text-[10px] text-neutral-500 uppercase tracking-wide${catIndex > 0 ? " border-t border-neutral-800/60" : ""}`}>
                  {category.label}
                </div>
                {category.nodes.map((node) => (
                  <button
                    key={node.type}
                    onClick={() => handleAddNode(node.type)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, node.type)}
                    data-agent-node-type={node.type}
                    className="group w-full rounded-lg px-4 pl-2 flex h-[51px] justify-start gap-2 whitespace-normal bg-transparent font-normal text-[12px] text-neutral-200 hover:bg-white/10 transition-colors items-center text-left cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex h-8 w-full min-w-0 items-center gap-2 text-left">
                      <span className="select-none shrink-0">
                        {node.label}
                      </span>
                      <div className="min-w-0 flex-1 select-none truncate text-[10px] text-neutral-400 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        {node.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
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

function ImageEditMenu() {
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

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={iconButtonClass}
        title="Image edit tools"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 ml-2 bg-neutral-800 border border-neutral-600 rounded-lg shadow-xl overflow-hidden min-w-[180px] z-[100]">
          <button
            type="button"
            onClick={() => handleAddNode("annotation")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
          >
            Layer Editor
          </button>
          <button
            type="button"
            onClick={() => handleAddNode("imageCompare")}
            className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
          >
            Image Compare
          </button>
        </div>
      )}
    </div>
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

      <ImageEditMenu />

      <AddCommentButton />
    </aside>
  );
}
