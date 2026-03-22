"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Calendar, LayoutGrid, LayoutTemplate, Search } from "lucide-react";
import type { WorkflowFile } from "@/store/workflowStore";
import { getAllPresets } from "@/lib/quickstart/templates";
import { PRIMARY_TEMPLATE_THUMBNAILS } from "@/lib/quickstart/template-thumbnails";
import { listProjects } from "@/lib/local-db";
import {
  getDefaultProjectDirectory,
  getQuickstartDefaults,
  getQuickstartSystemInstructionExtra,
} from "@/store/utils/localStorage";
import type { LocalProject } from "@/lib/local-db";
import type { FileProject } from "@/lib/project-types";
import type { LLMModelType, LLMProvider } from "@/types";
import type { ProjectsViewTab } from "./ProjectsStickyHeader";

type ProjectRow = LocalProject | FileProject;

type ProjectsStitchListPanelProps = {
  activeTab: ProjectsViewTab;
  onTabChange: (tab: ProjectsViewTab) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  onNewProject: () => void;
  onTemplateWorkflow: (workflow: WorkflowFile) => void;
};

function designRgbFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  const r = 200 + (Math.abs(h) % 48);
  const g = 210 + (Math.abs(h >> 7) % 40);
  const b = 205 + (Math.abs(h >> 14) % 45);
  return `${r} ${g} ${b}`;
}

function formatListDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const listItemClass =
  "flex items-center justify-between gap-3 rounded-lg border border-transparent p-2 text-sm transition-colors hover:bg-state-hover active:bg-state-pressed focus-visible:-outline-offset-1 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/15";

function SidebarTemplateThumb({ presetId }: { presetId: string }) {
  const [failed, setFailed] = useState(false);
  const src = PRIMARY_TEMPLATE_THUMBNAILS[presetId];
  const effective = src && !failed ? src : "/thumbnail.jpeg";
  return (
    <div
      className="group relative flex justify-center rounded-lg bg-design opacity-100 shadow-md"
      style={
        {
          "--backgroundColor-design": designRgbFromId(presetId),
        } as CSSProperties
      }
    >
      <img
        src={effective}
        alt=""
        onError={() => setFailed(true)}
        className="size-10 min-w-10 flex justify-center overflow-hidden rounded-md bg-center bg-cover bg-no-repeat object-cover object-top"
      />
    </div>
  );
}

export function ProjectsStitchListPanel({
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  onNewProject,
  onTemplateWorkflow,
}: ProjectsStitchListPanelProps) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [templateLoadingId, setTemplateLoadingId] = useState<string | null>(null);

  const presets = useMemo(() => getAllPresets(), []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const defaultDir = getDefaultProjectDirectory();
      if (defaultDir.trim()) {
        const res = await fetch(`/api/projects/list?path=${encodeURIComponent(defaultDir)}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          setProjects(
            data.projects.map(
              (p: { id: string; name: string; path: string; updatedAt: string; thumbnail?: string }) => ({
                id: p.id,
                name: p.name,
                path: p.path,
                updatedAt: p.updatedAt,
                source: "file" as const,
                thumbnail: p.thumbnail ?? "/thumbnail.jpeg",
              })
            )
          );
        } else {
          setProjects([]);
        }
      } else {
        setProjects(await listProjects());
      }
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || "").toLowerCase().includes(q));
  }, [projects, searchValue]);

  const filteredPresets = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    if (!q) return presets;
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [presets, searchValue]);

  const quickstartDefaults = getQuickstartDefaults();
  const provider: LLMProvider = quickstartDefaults?.provider ?? "google";
  const defaultModels: Record<LLMProvider, LLMModelType> = {
    google: "gemini-3-flash-preview",
    openai: "gpt-4.1-mini",
    anthropic: "claude-sonnet-4.5",
  };
  const model: LLMModelType = quickstartDefaults?.model ?? defaultModels[provider];
  const systemInstructionExtra = getQuickstartSystemInstructionExtra();

  const runTemplate = async (templateId: string) => {
    setTemplateLoadingId(templateId);
    try {
      const res = await fetch("/api/quickstart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          contentLevel: "full",
          provider,
          model,
          systemInstructionExtra,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed");
      if (result.workflow) onTemplateWorkflow(result.workflow as WorkflowFile);
    } catch {
      // ignore; parent could toast later
    } finally {
      setTemplateLoadingId(null);
    }
  };

  const tabButton = (tab: ProjectsViewTab, label: string, Icon: typeof LayoutGrid) => {
    const selected = activeTab === tab;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={0}
        onClick={() => onTabChange(tab)}
        className={`relative z-10 flex-1 cursor-pointer rounded-[32px] px-2 py-2 text-center text-sm font-medium transition-colors ${
          selected
            ? "text-stitch-fg"
            : "text-stitch-muted hover:bg-state-hover hover:text-stitch-fg"
        }`}
      >
        {selected ? (
          <div
            className="absolute inset-0 z-0 rounded-[32px] bg-state-active"
            aria-hidden
          />
        ) : null}
        <span className="relative z-10">
          <span className="flex items-center justify-center gap-1.5">
            <span className={selected ? "text-stitch-fg" : "text-stitch-muted"}>
              <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
            </span>
            {label}
          </span>
        </span>
      </button>
    );
  };

  const searchPlaceholder =
    activeTab === "mine" ? "Search projects" : "Search templates";

  return (
    <aside className="hidden min-h-0 w-[288px] shrink-0 flex-col gap-3 px-3 pt-[15dvh] pb-[15dvh] md:flex">
      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-secondary bg-surface-container p-3 backdrop-blur-glass md:pb-4">
        <div
          role="radiogroup"
          className="relative mb-2 shrink-0 flex gap-1 rounded-[32px] bg-surface-container p-0.5 backdrop-blur-[40px]"
        >
          {tabButton("mine", "My projects", LayoutGrid)}
          {tabButton("templates", "Templates", LayoutTemplate)}
        </div>

        <div className="shrink-0">
          <div className="flex items-center rounded-full bg-state-enabled p-2.5 backdrop-blur-md transition-colors duration-200 focus-within:bg-state-active">
            <span className="pl-1 pr-2 text-stitch-muted">
              <Search className="size-4 shrink-0" aria-hidden />
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm text-stitch-fg outline-none selection:bg-neutral-600/70"
            />
          </div>
          <div className="h-3" />
        </div>

        <div className="flowy-chat-scrollbar min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <div className="flex flex-col gap-1 pb-1">
            {activeTab === "mine" && (
              <>
                <div className="bg-transparent py-4 text-sm font-medium text-stitch-muted md:py-2">
                  Recent
                </div>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-state-enabled" />
                    ))}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <p className="px-2 text-sm text-stitch-muted">No projects yet.</p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {filteredProjects.map((p) => {
                      const thumb =
                        "source" in p && p.source === "file"
                          ? (p.thumbnail ?? "/thumbnail.jpeg")
                          : (p as LocalProject).image ?? "/thumbnail.jpeg";
                      const href = `/projects/${encodeURIComponent(p.id)}`;
                      const designVar = designRgbFromId(p.id);
                      return (
                        <li key={p.id} className="list-none">
                          <Link href={href} className={listItemClass}>
                            <div>
                              <div
                                className="group relative flex justify-center rounded-lg bg-design opacity-100 shadow-md"
                                style={
                                  {
                                    "--backgroundColor-design": designVar,
                                  } as CSSProperties
                                }
                              >
                                <img
                                  src={thumb}
                                  alt=""
                                  className="size-10 min-w-10 flex justify-center overflow-hidden rounded-md bg-center bg-cover bg-no-repeat object-cover object-top"
                                />
                              </div>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-center">
                              <p className="line-clamp-2 font-semibold text-stitch-fg">
                                {p.name || "Untitled"}
                              </p>
                              <div className="line-clamp-1 flex items-center justify-between text-xs text-stitch-muted">
                                <div className="flex items-center gap-1 text-[10px] text-inherit">
                                  <Calendar className="size-3 shrink-0" aria-hidden />
                                  <span>{formatListDate(p.updatedAt)}</span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {activeTab === "templates" && (
              <>
                <div className="bg-transparent py-4 text-sm font-medium text-stitch-muted md:py-2">
                  Examples
                </div>
                <ul className="m-0 list-none p-0">
                  {filteredPresets.map((preset) => (
                    <li key={preset.id} className="list-none">
                      <button
                        type="button"
                        disabled={templateLoadingId !== null}
                        onClick={() => void runTemplate(preset.id)}
                        className={`${listItemClass} w-full text-left disabled:opacity-50`}
                      >
                        <SidebarTemplateThumb presetId={preset.id} />
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                          <p className="line-clamp-2 font-semibold text-stitch-fg">{preset.name}</p>
                          <div className="line-clamp-1 flex items-center justify-between text-xs text-stitch-muted">
                            <div className="flex items-center gap-1 text-[10px] text-inherit">
                              <Calendar className="size-3 shrink-0" aria-hidden />
                              <span>{preset.category}</span>
                            </div>
                          </div>
                          {templateLoadingId === preset.id ? (
                            <p className="mt-1 text-[10px] text-stitch-muted">Loading…</p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewProject}
        className="flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-stitch-fg text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#e8eaed]"
      >
        New project
      </button>
    </aside>
  );
}
