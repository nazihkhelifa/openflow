"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Wand2 } from "lucide-react";
import { useWorkflowStore, WorkflowFile } from "@/store/workflowStore";
import { useShallow } from "zustand/shallow";
import {
  FLOWY_AGENT_LOG_THREADS_MENU_ID,
  useFlowyAgentLogAnchorRef,
} from "@/providers/flowy-agent-log-anchor";
import { ProjectSetupModal } from "./ProjectSetupModal";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { GlobalImageHistory } from "./GlobalImageHistory";

export function Header() {
  const {
    workflowName,
    workflowId,
    saveDirectoryPath,
    hasUnsavedChanges,
    lastSavedAt,
    isSaving,
    setWorkflowMetadata,
    saveToFile,
    loadWorkflow,
    duplicateWorkflowToPath,
    previousWorkflowSnapshot,
    revertToSnapshot,
    shortcutsDialogOpen,
    setShortcutsDialogOpen,
    setShowQuickstart,
    flowyAgentOpen,
    flowyHistoryRailOpen,
    setFlowyAgentOpen,
    setFlowyHistoryRailOpen,
    toggleFlowyHistoryRail,
  } = useWorkflowStore(useShallow((state) => ({
    workflowName: state.workflowName,
    workflowId: state.workflowId,
    saveDirectoryPath: state.saveDirectoryPath,
    hasUnsavedChanges: state.hasUnsavedChanges,
    lastSavedAt: state.lastSavedAt,
    isSaving: state.isSaving,
    setWorkflowMetadata: state.setWorkflowMetadata,
    saveToFile: state.saveToFile,
    loadWorkflow: state.loadWorkflow,
    duplicateWorkflowToPath: state.duplicateWorkflowToPath,
    previousWorkflowSnapshot: state.previousWorkflowSnapshot,
    revertToSnapshot: state.revertToSnapshot,
    shortcutsDialogOpen: state.shortcutsDialogOpen,
    setShortcutsDialogOpen: state.setShortcutsDialogOpen,
    setShowQuickstart: state.setShowQuickstart,
    flowyAgentOpen: state.flowyAgentOpen,
    flowyHistoryRailOpen: state.flowyHistoryRailOpen,
    setFlowyAgentOpen: state.setFlowyAgentOpen,
    setFlowyHistoryRailOpen: state.setFlowyHistoryRailOpen,
    toggleFlowyHistoryRail: state.toggleFlowyHistoryRail,
  })));

  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"new" | "settings" | "duplicate">("new");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const isProjectPage = pathname?.startsWith("/projects/") && pathname !== "/projects";
  const flowyAgentLogAnchorRef = useFlowyAgentLogAnchorRef();

  const isProjectConfigured = !!workflowName;
  const canSave = !!(workflowId && workflowName && saveDirectoryPath);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const handleNewProject = () => {
    setProjectModalMode("new");
    setShowProjectModal(true);
  };

  const handleOpenSettings = () => {
    setProjectModalMode("settings");
    setShowProjectModal(true);
    setDropdownOpen(false);
  };

  const handleDuplicateProject = () => {
    setProjectModalMode("duplicate");
    setShowProjectModal(true);
    setDropdownOpen(false);
  };

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const workflow = JSON.parse(event.target?.result as string) as WorkflowFile;
        if (workflow.version && workflow.nodes && workflow.edges) {
          await loadWorkflow(workflow);
        } else {
          alert("Invalid workflow file format");
        }
      } catch {
        alert("Failed to parse workflow file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleProjectSave = async (id: string, name: string, path: string) => {
    setWorkflowMetadata(id, name, path);
    setShowProjectModal(false);
    setTimeout(() => saveToFile().catch((err) => console.error("Failed to save:", err)), 50);
  };

  const handleProjectDuplicate = async (name: string, path: string) => {
    const success = await duplicateWorkflowToPath(path, name);
    setShowProjectModal(false);
    if (!success) alert("Failed to duplicate project. Please try again.");
  };

  const handleRevertAIChanges = useCallback(() => {
    if (window.confirm("Are you sure? This will restore your previous workflow.")) {
      revertToSnapshot();
    }
  }, [revertToSnapshot]);

  const projectDisplayName = isProjectConfigured ? workflowName : "Untitled Project";

  const handleFlowyThreadsClick = useCallback(() => {
    if (!flowyAgentOpen) {
      setFlowyAgentOpen(true);
      setFlowyHistoryRailOpen(true);
    } else {
      toggleFlowyHistoryRail();
    }
  }, [flowyAgentOpen, setFlowyAgentOpen, setFlowyHistoryRailOpen, toggleFlowyHistoryRail]);

  return (
    <>
      <ProjectSetupModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onSave={handleProjectSave}
        onDuplicate={handleProjectDuplicate}
        mode={projectModalMode}
      />
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />

      {/* Floating header bar - arty style */}
      <div className="absolute top-4 left-4 right-0 z-[50] m-4 flex items-center gap-2 sm:right-auto">
        {/* Logo */}
        <div className="flex shrink-0">
          {isProjectPage ? (
            <Link
              href="/projects"
              className="h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden bg-[#353535]/90 backdrop-blur-sm border border-neutral-600/50 hover:scale-105"
              title="Back to projects"
            >
              <img src="/banana_icon.png" alt="Openflows" className="w-6 h-6" />
            </Link>
          ) : (
            <button
              onClick={() => setShowQuickstart(true)}
              className="h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden bg-[#353535]/90 backdrop-blur-sm border border-neutral-600/50 hover:scale-105"
              title="Open welcome screen"
            >
              <img src="/banana_icon.png" alt="Openflows" className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Project pill with dropdown + settings */}
        <div className="flex flex-1 items-center gap-2 min-w-0 max-w-[320px]" ref={dropdownRef}>
          <div className="flex flex-1 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/90 p-1.5 pr-2 shadow-sm backdrop-blur-sm min-w-0">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex flex-1 items-center min-w-0 text-left px-3 py-1 text-sm text-neutral-200 truncate"
            >
              {projectDisplayName}
            </button>
          </div>
          <button
            onClick={handleOpenSettings}
            className="h-10 w-10 shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]/90 flex items-center justify-center text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50 backdrop-blur-sm transition-colors"
            title="Project settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {dropdownOpen && (
            <div
              className="absolute left-0 top-full mt-2 min-w-[180px] max-w-[220px] rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl py-1 z-[100]"
              data-side="bottom"
              data-align="start"
            >
              <button
                onClick={handleOpenFile}
                className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9.414a2 2 0 00-.586-1.414L13 5.586A2 2 0 0011.414 5H5a2 2 0 00-2 2z" />
                </svg>
                Open project
              </button>
              <button
                onClick={isProjectConfigured ? handleOpenSettings : handleNewProject}
                className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {isProjectConfigured ? "Rename project" : "New project"}
              </button>
              {isProjectConfigured && (
              <button
                onClick={handleDuplicateProject}
                className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Duplicate project
              </button>
              )}
              <div className="my-1 border-t border-neutral-600/80" role="separator" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  setShortcutsDialogOpen(true);
                }}
                className="w-full px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2"
                title="Keyboard shortcuts (?)"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15a2.25 2.25 0 01-2.25-2.25V6.75z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
                </svg>
                <span className="min-w-0 flex-1">Keyboard shortcuts</span>
                <kbd className="hidden shrink-0 rounded border border-neutral-600 bg-neutral-900/80 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400 sm:inline">
                  ?
                </kbd>
              </button>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-1">
          {previousWorkflowSnapshot && (
            <button
              onClick={handleRevertAIChanges}
              className="px-2.5 py-1.5 text-xs text-neutral-300 hover:text-neutral-100 bg-neutral-700/50 hover:bg-neutral-700 border border-neutral-600 rounded-full transition-colors"
              title="Restore workflow from before AI changes"
            >
              Revert AI
            </button>
          )}
        </div>
      </div>

      {/* Bottom right: image history + save status + Flowy threads + shortcuts — z above canvas / Flowy (z-40–60) */}
      <div className="pointer-events-auto absolute bottom-4 right-4 z-[120] flex items-center gap-2">
        <GlobalImageHistory />
        <span className="text-xs text-neutral-500 px-2">
          {isProjectConfigured
            ? isSaving
              ? "Saving..."
              : lastSavedAt
                ? `Saved ${formatTime(lastSavedAt)}`
                : "Not saved"
            : "Not saved"}
        </span>
        {isProjectPage ? (
          <button
            ref={flowyAgentLogAnchorRef ?? undefined}
            type="button"
            onClick={handleFlowyThreadsClick}
            aria-expanded={flowyAgentOpen && flowyHistoryRailOpen}
            aria-controls={FLOWY_AGENT_LOG_THREADS_MENU_ID}
            title={
              !flowyAgentOpen
                ? "Open Flowy and agent log"
                : flowyHistoryRailOpen
                  ? "Hide chat threads"
                  : "Show chat threads"
            }
            aria-label={
              !flowyAgentOpen
                ? "Open Flowy and agent log"
                : flowyHistoryRailOpen
                  ? "Hide chat threads"
                  : "Show chat threads"
            }
            className={`relative flex max-w-[min(280px,calc(100vw-8rem))] cursor-pointer items-center gap-2 overflow-hidden rounded-full border border-white/[0.15] px-4 py-2 text-left text-sm font-medium shadow-none backdrop-blur-xl transition-[color,background-color,border-color,box-shadow] duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30 ${
              flowyAgentOpen && flowyHistoryRailOpen
                ? "border-white/20 bg-[rgb(22,23,24)]/90 text-neutral-100"
                : "border-white/[0.12] bg-[rgb(22,23,24)]/50 text-neutral-200 hover:bg-neutral-800/85"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
              <Wand2 className="size-4 shrink-0 text-neutral-200" strokeWidth={2} aria-hidden />
              <span className="hidden min-w-0 truncate sm:inline">Agent log</span>
            </div>
            <ChevronDown
              className={`size-[18px] shrink-0 text-neutral-400 transition-transform duration-300 ${
                flowyAgentOpen && flowyHistoryRailOpen ? "rotate-180" : ""
              }`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      <KeyboardShortcutsDialog
        isOpen={shortcutsDialogOpen}
        onClose={() => setShortcutsDialogOpen(false)}
      />
    </>
  );
}
