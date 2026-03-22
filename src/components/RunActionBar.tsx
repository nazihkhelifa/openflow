"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { useShallow } from "zustand/shallow";

export function RunActionBar() {
  const {
    nodes,
    isRunning,
    executeWorkflow,
    regenerateNode,
    executeSelectedNodes,
    stopWorkflow,
    validateWorkflow,
  } = useWorkflowStore(useShallow((state) => ({
    nodes: state.nodes,
    isRunning: state.isRunning,
    executeWorkflow: state.executeWorkflow,
    regenerateNode: state.regenerateNode,
    executeSelectedNodes: state.executeSelectedNodes,
    stopWorkflow: state.stopWorkflow,
    validateWorkflow: state.validateWorkflow,
  })));

  const [runMenuOpen, setRunMenuOpen] = useState(false);
  const runMenuRef = useRef<HTMLDivElement>(null);
  const { valid, errors } = validateWorkflow();

  const selectedNodes = useMemo(() => nodes.filter((n) => n.selected), [nodes]);
  const selectedNode = useMemo(
    () => (selectedNodes.length === 1 ? selectedNodes[0] : null),
    [selectedNodes]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (runMenuRef.current && !runMenuRef.current.contains(event.target as Node)) {
        setRunMenuOpen(false);
      }
    };
    if (runMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [runMenuOpen]);

  const handleRunClick = () => {
    if (isRunning) stopWorkflow();
    else executeWorkflow();
  };

  const handleRunFromSelected = () => {
    if (selectedNode) {
      executeWorkflow(selectedNode.id);
      setRunMenuOpen(false);
    }
  };

  const handleRunSelectedOnly = () => {
    if (selectedNode) {
      regenerateNode(selectedNode.id);
      setRunMenuOpen(false);
    }
  };

  const handleRunSelectedNodes = () => {
    if (selectedNodes.length > 0) {
      executeSelectedNodes(selectedNodes.map((n) => n.id));
      setRunMenuOpen(false);
    }
  };

  const iconButtonClass =
    "inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-lg text-[var(--color-greyscale-400)] transition-all duration-300 hover:bg-white/5 hover:text-[var(--color-text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50";

  const keepBarVisible = runMenuOpen || isRunning;

  return (
    <div
      className="group pointer-events-auto absolute top-3 left-1/2 z-[30] flex min-h-[44px] min-w-[160px] -translate-x-1/2 flex-col items-center justify-start px-10 pb-2 pt-1"
      data-id="run-action-bar"
    >
      <div
        className={`flex items-center gap-0.5 rounded-lg p-1.5 backdrop-blur-[16px] transition-opacity duration-200 ${
          keepBarVisible
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
        style={{ backgroundColor: "var(--background-transparent-black-default)" }}
      >
        <div className="relative flex items-center" ref={runMenuRef}>
          <button
            onClick={handleRunClick}
            disabled={!valid && !isRunning}
            title={!valid ? errors.join("\n") : isRunning ? "Stop" : "Run"}
            className={`${iconButtonClass} ${isRunning || valid ? "bg-white text-[var(--color-greyscale-900)] hover:bg-[var(--color-greyscale-300)]" : ""}`}
          >
            {isRunning ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {!isRunning && valid && (
            <button
              onClick={() => setRunMenuOpen(!runMenuOpen)}
              title="Run options"
              className={iconButtonClass}
            >
              <svg className={`w-3 h-3 transition-transform ${runMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {runMenuOpen && !isRunning && (
            <div className="absolute left-0 top-full z-[100] mt-2 min-w-[180px] overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl">
              <button
                onClick={() => { executeWorkflow(); setRunMenuOpen(false); }}
                className="w-full px-3 py-2 text-left text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                Run entire workflow
              </button>
              <button
                onClick={handleRunFromSelected}
                disabled={!selectedNode}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${selectedNode ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100" : "text-neutral-500 cursor-not-allowed"}`}
                title={!selectedNode ? "Select a single node first" : undefined}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Run from selected node
              </button>
              <button
                onClick={handleRunSelectedOnly}
                disabled={!selectedNode}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${selectedNode ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100" : "text-neutral-500 cursor-not-allowed"}`}
                title={!selectedNode ? "Select a single node first" : undefined}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                </svg>
                Run selected node only
              </button>
              <button
                onClick={handleRunSelectedNodes}
                disabled={selectedNodes.length === 0}
                className={`w-full px-3 py-2 text-left text-[11px] font-medium transition-colors flex items-center gap-2 ${selectedNodes.length > 0 ? "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100" : "text-neutral-500 cursor-not-allowed"}`}
                title={selectedNodes.length === 0 ? "Select one or more nodes first" : `Run ${selectedNodes.length} selected node${selectedNodes.length > 1 ? "s" : ""}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V9.653z" />
                </svg>
                {selectedNodes.length > 0 ? `Run ${selectedNodes.length} selected node${selectedNodes.length !== 1 ? "s" : ""}` : "Run selected nodes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
