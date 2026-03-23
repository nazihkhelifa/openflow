"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import type { WorkflowFile } from "@/store/workflowStore";
import { ProjectsStitchListPanel } from "@/components/projects/ProjectsStitchListPanel";
import { StitchProjectsHero } from "@/components/projects/StitchProjectsHero";
import type { ProjectsViewTab } from "@/components/projects/ProjectsStickyHeader";
import { NewProjectModal } from "@/components/NewProjectModal";
import { useWorkflowStore } from "@/store/workflowStore";
import { useToast } from "@/components/Toast";
import { createProject, updateProject } from "@/lib/local-db";
import { getDefaultProjectDirectory } from "@/store/utils/localStorage";
import { ensureProjectSubfolderPath } from "@/lib/project-directory-path";

const DISCORD_INVITE_URL = "https://discord.com/invite/89Nr6EKkTf";
/** Replace with your X (Twitter) profile or community URL */
const X_SOCIAL_URL = "https://x.com/openflows";

const projectsTopLinkClass =
  "inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm text-stitch-muted transition-colors hover:bg-white/[0.06] hover:text-stitch-fg focus-visible:-outline-offset-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/15";

function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function XBrandGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const { show } = useToast();
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectsViewTab>("templates");
  const [pendingTemplateWorkflow, setPendingTemplateWorkflow] = useState<WorkflowFile | null>(null);
  const setWorkflowMetadata = useWorkflowStore(
    (state) => state.setWorkflowMetadata
  );
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const setUseExternalImageStorage = useWorkflowStore(
    (state) => state.setUseExternalImageStorage
  );
  const UNTITLED_NAME = "untitled";

  const openNewProjectModal = (workflow: WorkflowFile | null) => {
    setPendingTemplateWorkflow(workflow);
    setShowNewProjectModal(true);
  };

  const createInDefaultDirectory = useCallback(
    async (workflow: WorkflowFile | null, name = UNTITLED_NAME): Promise<boolean> => {
      const defaultDir = getDefaultProjectDirectory().trim();
      if (!defaultDir) return false;
      try {
        setUseExternalImageStorage(true);
        const fullProjectPath = ensureProjectSubfolderPath(defaultDir, name);
        const validateRes = await fetch(
          `/api/workflow?path=${encodeURIComponent(fullProjectPath)}`
        );
        const validateJson = (await validateRes.json()) as {
          exists?: boolean;
          isDirectory?: boolean;
        };
        if (validateJson.exists && !validateJson.isDirectory) {
          show("Project path is not a directory", "error");
          return true;
        }

        const workflowToSave = workflow ?? {
          version: 1 as const,
          id: fullProjectPath,
          name,
          nodes: [],
          edges: [],
          edgeStyle: "angular" as const,
          groups: {},
        };
        const payloadWorkflow = {
          ...workflowToSave,
          id: fullProjectPath,
          name,
        };
        const postRes = await fetch("/api/workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directoryPath: fullProjectPath,
            filename: name.replace(/[^a-zA-Z0-9-_]/g, "_"),
            workflow: payloadWorkflow,
          }),
        });
        const postData = (await postRes.json()) as { success?: boolean; error?: string };
        if (!postData.success) throw new Error(postData.error || "Failed to create project");

        setWorkflowMetadata(fullProjectPath, name, fullProjectPath);
        await loadWorkflow(payloadWorkflow, fullProjectPath);
        router.push(`/projects/${encodeURIComponent(fullProjectPath)}`);
        show("Project created", "success");
        return true;
      } catch (err) {
        show(err instanceof Error ? err.message : "Failed to create project", "error");
        return true;
      }
    },
    [loadWorkflow, router, setUseExternalImageStorage, setWorkflowMetadata, show]
  );

  const handleProjectSave = async (
    _id: string,
    name: string,
    fullProjectPath: string
  ) => {
    setShowNewProjectModal(false);
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

  const instantiateTemplateFromSidebar = useCallback(
    async (
      workflow: WorkflowFile,
      meta: { templateId: string; name: string; thumbnailUrl: string }
    ) => {
      const { name, thumbnailUrl } = meta;
      const workflowToSave: WorkflowFile = {
        ...workflow,
        name,
        thumbnail: thumbnailUrl,
      };
      const defaultDir = getDefaultProjectDirectory();

      try {
        if (defaultDir.trim()) {
          setUseExternalImageStorage(true);
          const fullProjectPath = ensureProjectSubfolderPath(defaultDir, name);
          const validateRes = await fetch(
            `/api/workflow?path=${encodeURIComponent(fullProjectPath)}`
          );
          const validateJson = (await validateRes.json()) as {
            exists?: boolean;
            isDirectory?: boolean;
          };
          if (validateJson.exists && !validateJson.isDirectory) {
            show("Project path is not a directory", "error");
            return;
          }

          const postRes = await fetch("/api/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              directoryPath: fullProjectPath,
              filename: name.replace(/[^a-zA-Z0-9-_]/g, "_"),
              workflow: { ...workflowToSave, id: fullProjectPath },
            }),
          });
          const postData = (await postRes.json()) as { success?: boolean; error?: string };
          if (!postData.success) throw new Error(postData.error || "Failed to save project");

          setWorkflowMetadata(fullProjectPath, name, fullProjectPath);
          await loadWorkflow({ ...workflowToSave, id: fullProjectPath }, fullProjectPath);
          router.push(`/projects/${encodeURIComponent(fullProjectPath)}`);
        } else {
          const created = await createProject({
            name,
            image: thumbnailUrl,
          });
          await updateProject(created.id, {
            content: {
              ...workflowToSave,
              id: created.id,
              name,
              thumbnail: thumbnailUrl,
            },
          });
          await loadWorkflow({
            ...workflowToSave,
            id: created.id,
            name,
            thumbnail: thumbnailUrl,
          });
          router.push(`/projects/${encodeURIComponent(created.id)}`);
        }
        show("Project created", "success");
      } catch (err) {
        show(err instanceof Error ? err.message : "Failed to create project", "error");
      }
    },
    [loadWorkflow, router, setUseExternalImageStorage, setWorkflowMetadata, show]
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black text-[13px] leading-[1.35] text-white antialiased [-webkit-font-smoothing:antialiased]">
      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onSave={handleProjectSave}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-black">
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
          <Link
            href="/projects"
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-white/[0.06] sm:left-6 sm:top-5"
            title="Openflows"
          >
            <img src="/logo.png" alt="" className="size-7 shrink-0 object-contain opacity-95" />
            <span className="select-none text-[11px] font-medium text-stitch-muted">Alpha</span>
          </Link>
          <nav
            className="absolute right-4 top-4 z-10 flex flex-wrap items-center justify-end gap-1 sm:right-6 sm:top-5"
            aria-label="Resources and social"
          >
            <Link href="/docs" className={projectsTopLinkClass}>
              <BookOpen className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
              Docs
            </Link>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={projectsTopLinkClass}
            >
              <DiscordGlyph className="size-[18px] shrink-0" />
              Discord
            </a>
            <a
              href={X_SOCIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={projectsTopLinkClass}
            >
              <XBrandGlyph className="size-[18px] shrink-0" />
              X
            </a>
          </nav>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                const created = await createInDefaultDirectory(null, UNTITLED_NAME);
                if (!created) openNewProjectModal(null);
              })();
            }}
            className="fixed bottom-6 left-1/2 z-10 h-10 w-[min(264px,calc(100vw-2rem))] -translate-x-1/2 rounded-full bg-stitch-fg text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#e8eaed] md:hidden"
          >
            New project
          </button>
          <main className="flowy-chat-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto bg-black [scrollbar-width:thin]">
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-8 py-[15dvh] sm:px-10">
              <div className="flex w-full flex-1 flex-col items-center justify-center">
                <StitchProjectsHero
                  onWorkflowGenerated={async (wf) => {
                    const created = await createInDefaultDirectory(wf, UNTITLED_NAME);
                    if (!created) openNewProjectModal(wf);
                  }}
                />
              </div>
            </div>
          </main>
          <ProjectsStitchListPanel
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onNewProject={async () => {
              const created = await createInDefaultDirectory(null, UNTITLED_NAME);
              if (!created) openNewProjectModal(null);
            }}
            onInstantiateTemplate={instantiateTemplateFromSidebar}
          />
        </div>
      </div>
    </div>
  );
}
