"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/lib/local-db";
import { useToast } from "@/components/Toast";

type NewProjectCardProps = {
  useFileSystem?: boolean;
  onOpenNewProjectModal?: () => void;
};

export function NewProjectCard({
  useFileSystem = false,
  onOpenNewProjectModal,
}: NewProjectCardProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const { show } = useToast();

  const handleClick = async () => {
    if (isCreating) return;
    if (useFileSystem && onOpenNewProjectModal) {
      onOpenNewProjectModal();
      return;
    }
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
    <div
      className="group aspect-[16/9] w-full cursor-pointer transition-all duration-300 rounded-xl overflow-hidden bg-muted/10 hover:bg-muted/20"
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      role="button"
      tabIndex={0}
    >
      <div className="relative h-full w-full rounded-xl border border-[var(--color-border)] bg-background/10 p-1">
        <div className="flex h-full w-full overflow-hidden rounded-lg">
          <div className="relative flex w-full flex-col items-center justify-center">
            <div className="mb-5 rounded-full bg-primary p-2.5 text-primary-foreground transition-all duration-300 hover:bg-primary/90">
              <Plus
                className={`h-5 w-5 ${isCreating ? "animate-spin" : ""}`}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {isCreating ? "Creating..." : "New Project"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
