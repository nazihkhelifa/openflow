"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkflowFile } from "@/store/workflowStore";
import { ProjectsGrid } from "@/components/projects/ProjectsGrid";
import { ProjectsSidebar } from "@/components/projects/ProjectsSidebar";
import { ProjectsStickyHeader, type ProjectsViewTab } from "@/components/projects/ProjectsStickyHeader";
import { GenerateWorkflowAIBanner } from "@/components/projects/GenerateWorkflowAIBanner";
import { ProjectSetupModal } from "@/components/ProjectSetupModal";
import { CommunitySection } from "@/components/projects/CommunitySection";
import { QuickStartSection } from "@/components/projects/QuickStartSection";
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
    <div className="flex flex-col h-screen overflow-auto bg-background">
      <ProjectSetupModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        onSave={handleProjectSave}
        mode={projectModalMode}
      />
      <div className="flex flex-1 overflow-hidden bg-neutral-950">
        <ProjectsSidebar
          onOpenSettings={() => {
            setProjectModalMode("settings");
            setShowProjectModal(true);
          }}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#0F0F0F] rounded-tl-xl rounded-bl-xl min-h-0">
            <div className="flex-1 overflow-auto flex flex-col min-h-0 scroll-boards">
              <div className="w-full px-10 pt-0 pb-8">
                <div className="pb-2 pt-6">
                  <div className="relative mx-auto w-full pb-2">
                    <section role="banner" className="h-[350px] w-full flex-shrink-0 overflow-hidden rounded-3xl">
                      <GenerateWorkflowAIBanner
                        onWorkflowSelected={(workflow) => {
                          setPendingTemplateWorkflow(workflow);
                          setProjectModalMode("new");
                          setShowProjectModal(true);
                        }}
                      />
                    </section>
                  </div>
                </div>
                <div className="sticky top-0 z-20 py-2 -mx-10 px-10 bg-[#0f0f0f] border-b border-white/10">
                  <ProjectsStickyHeader
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search projects..."
                    onNewProjectClick={() => {
                      setProjectModalMode("new");
                      setPendingTemplateWorkflow(null);
                      setShowProjectModal(true);
                    }}
                  />
                </div>
                <div className="pb-8 pt-2">
                  {activeTab === "mine" && (
                    <div className="flex flex-col gap-6">
                      <h2 className="text-[#f7f7f7] text-lg font-semibold mb-4">My projects</h2>
                      <ProjectsGrid searchQuery={searchQuery} />
                    </div>
                  )}
                  {activeTab === "templates" && (
                    <div className="flex flex-col gap-8">
                      <QuickStartSection
                        searchQuery={searchQuery}
                        onWorkflowSelected={(workflow) => {
                          setPendingTemplateWorkflow(workflow);
                          setProjectModalMode("new");
                          setShowProjectModal(true);
                        }}
                      />
                      <CommunitySection
                        searchQuery={searchQuery}
                        sectionTitle="Project templates"
                        onWorkflowSelected={(workflow) => {
                          setPendingTemplateWorkflow(workflow);
                          setProjectModalMode("new");
                          setShowProjectModal(true);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
