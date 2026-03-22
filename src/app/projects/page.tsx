"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WorkflowFile } from "@/store/workflowStore";
import { ProjectsStitchListPanel } from "@/components/projects/ProjectsStitchListPanel";
import { StitchProjectsHero } from "@/components/projects/StitchProjectsHero";
import type { ProjectsViewTab } from "@/components/projects/ProjectsStickyHeader";
import { ProjectSetupModal } from "@/components/ProjectSetupModal";
import { useWorkflowStore } from "@/store/workflowStore";

export default function ProjectsPage() {
  const router = useRouter();
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectModalMode, setProjectModalMode] = useState<"new" | "settings">("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectsViewTab>("templates");
  const [pendingTemplateWorkflow, setPendingTemplateWorkflow] = useState<WorkflowFile | null>(null);
  const setWorkflowMetadata = useWorkflowStore(
    (state) => state.setWorkflowMetadata
  );
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);

  const openNewProjectModal = (workflow: WorkflowFile | null) => {
    setPendingTemplateWorkflow(workflow);
    setProjectModalMode("new");
    setShowProjectModal(true);
  };

  const handleProjectSave = async (
    _id: string,
    name: string,
    fullProjectPath: string
  ) => {
    setShowProjectModal(false);
    const workflowThumbnail = useWorkflowStore.getState().workflowThumbnail;
    const workflowToSave = pendingTemplateWorkflow ?? {
      version: 1 as const,
      id: fullProjectPath,
      name,
      nodes: [],
      edges: [],
      edgeStyle: "angular" as const,
      groups: {},
    };
    const workflow = {
      ...workflowToSave,
      id: fullProjectPath,
      name,
      thumbnail: workflowThumbnail ?? workflowToSave.thumbnail ?? "/thumbnail.jpeg",
    };
    setPendingTemplateWorkflow(null);
    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directoryPath: fullProjectPath,
          filename: name.replace(/[^a-zA-Z0-9-_]/g, "_"),
          workflow,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setWorkflowMetadata(fullProjectPath, name, fullProjectPath);
      await loadWorkflow(workflow, fullProjectPath);
      router.push(`/projects/${encodeURIComponent(fullProjectPath)}`);
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black text-[13px] leading-[1.35] text-white antialiased [-webkit-font-smoothing:antialiased]">
      <ProjectSetupModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onSave={handleProjectSave}
        mode={projectModalMode}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-black">
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Link
            href="/projects"
            className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.06] sm:right-6 sm:top-5"
            title="Openflows"
          >
            <img src="/logo.png" alt="" className="size-7 object-contain opacity-95" />
          </Link>
          <ProjectsStitchListPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onNewProject={() => openNewProjectModal(null)}
            onTemplateWorkflow={(wf) => openNewProjectModal(wf)}
          />
          <main className="flowy-chat-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin]">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-8 py-[15dvh] sm:px-10">
              <div className="flex w-full flex-1 flex-col items-center justify-center">
                <StitchProjectsHero
                  onWorkflowGenerated={(wf) => openNewProjectModal(wf)}
                />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
