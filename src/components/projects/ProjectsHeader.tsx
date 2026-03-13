"use client";

import { Plus, Settings, Folder } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/lib/local-db";
import { useToast } from "@/components/Toast";
import { useWorkflowStore } from "@/store/workflowStore";

type ProjectsHeaderProps = {
  showNewButton?: boolean;
  onNewProjectClick?: () => void;
  onOpenSettings?: () => void;
};

export function ProjectsHeader({
  showNewButton = true,
  onNewProjectClick,
  onOpenSettings,
}: ProjectsHeaderProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const { show } = useToast();
  const setShortcutsDialogOpen = useWorkflowStore(
    (state) => state.setShortcutsDialogOpen
  );

  const handleNewProject = async () => {
    if (onNewProjectClick) {
      onNewProjectClick();
      return;
    }
    if (isCreating) return;
    setIsCreating(true);

    try {
      const project = await createProject({ name: "Untitled Project" });
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error("Error creating project:", error);
      show(
        error instanceof Error ? error.message : "Failed to create project",
        "error"
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <div
        className="fixed left-4 top-1/2 -translate-y-1/2 z-[9999] flex flex-col items-start gap-2"
        style={{ isolation: "isolate" }}
      >
        <div className="flex flex-col items-center gap-3 p-3 rounded-full border border-[var(--color-border)] bg-[#212121] text-foreground shadow-xl backdrop-blur-sm">
          {showNewButton && (
            <button
              type="button"
              onClick={handleNewProject}
              disabled={isCreating}
              title="New Project"
              className="h-10 w-10 rounded-full flex items-center justify-center bg-white text-black border border-[var(--color-border)] hover:bg-white/90 transition-transform hover:scale-[1.02] disabled:opacity-70"
            >
              <Plus
                className={`h-5 w-5 ${isCreating ? "animate-spin" : ""}`}
              />
            </button>
          )}

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              title="Project settings"
              className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <Folder className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShortcutsDialogOpen(true)}
            title="Keyboard shortcuts"
            className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

    </>
  );
}
