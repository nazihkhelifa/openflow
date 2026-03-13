"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowProvider } from "@xyflow/react";
import { Header } from "@/components/Header";
import { WorkflowCanvas } from "@/components/WorkflowCanvas";
import { FloatingActionBar } from "@/components/FloatingActionBar";
import { RunActionBar } from "@/components/RunActionBar";
import { AnnotationModal } from "@/components/AnnotationModal";
import { MediaViewerProvider } from "@/providers/media-viewer";
import { MediaViewer } from "@/components/MediaViewer";
import { useWorkflowStore } from "@/store/workflowStore";
import { getProject } from "@/lib/local-db";
import { ProjectSync } from "@/components/projects/ProjectSync";
import { isFileProjectId } from "@/lib/project-types";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
};

export default function ProjectPage({ params }: ProjectPageProps) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isFileProject, setIsFileProject] = useState(false);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const initializeAutoSave = useWorkflowStore(
    (state) => state.initializeAutoSave
  );
  const cleanupAutoSave = useWorkflowStore((state) => state.cleanupAutoSave);

  useEffect(() => {
    const load = async () => {
      try {
        if (isFileProjectId(projectId)) {
          setIsFileProject(true);
          const pathParam = decodeURIComponent(projectId);
          const res = await fetch(
            `/api/projects/load?path=${encodeURIComponent(pathParam)}`
          );
          const data = await res.json();
          if (!data.success || !data.workflow) {
            setNotFound(true);
            return;
          }
          await loadWorkflow(data.workflow, data.workflow.directoryPath);
        } else {
          const project = await getProject(projectId);
          if (!project) {
            setNotFound(true);
            return;
          }
          const workflow = {
            ...project.content,
            id: project.id,
            name: project.name,
          };
          await loadWorkflow(workflow);
        }
      } catch (error) {
        console.error("Error loading project:", error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, loadWorkflow]);

  useEffect(() => {
    initializeAutoSave();
    return () => cleanupAutoSave();
  }, [initializeAutoSave, cleanupAutoSave]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useWorkflowStore.getState().hasUnsavedChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground/30 border-t-foreground" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <button
          type="button"
          onClick={() => router.push("/projects")}
          className="px-4 py-2 text-sm font-medium text-foreground bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/50 transition-colors"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <MediaViewerProvider>
        {!isFileProject && <ProjectSync projectId={projectId} />}
        <div className="h-screen flex flex-col relative">
          <Header />
          <WorkflowCanvas />
          <FloatingActionBar />
          <RunActionBar />
          <AnnotationModal />
        </div>
        <MediaViewer />
      </MediaViewerProvider>
    </ReactFlowProvider>
  );
}
