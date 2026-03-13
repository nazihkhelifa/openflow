"use client";

import { Plus, Folder, Keyboard } from "lucide-react";
import Link from "next/link";
import { useWorkflowStore } from "@/store/workflowStore";

type ProjectsNavbarProps = {
  onNewProjectClick?: () => void;
  onOpenSettings?: () => void;
};

export function ProjectsNavbar({
  onNewProjectClick,
  onOpenSettings,
}: ProjectsNavbarProps) {
  const setShortcutsDialogOpen = useWorkflowStore(
    (state) => state.setShortcutsDialogOpen
  );

  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[var(--color-border)] bg-background">
      <Link
        href="/projects"
        className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity"
      >
        <img
          src="/banana_icon.png"
          alt="Openflows"
          className="w-8 h-8"
        />
        <span className="font-semibold text-lg">Openflows</span>
      </Link>

      <nav className="flex items-center gap-2">
        {onNewProjectClick && (
          <button
            type="button"
            onClick={onNewProjectClick}
            title="New Project"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black border border-[var(--color-border)] hover:bg-white/90 transition-colors font-medium text-sm"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}

        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Project settings"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline text-sm">Settings</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShortcutsDialogOpen(true)}
          title="Keyboard shortcuts"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Keyboard className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Shortcuts</span>
        </button>
      </nav>
    </header>
  );
}
