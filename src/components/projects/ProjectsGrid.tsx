"use client";

import { useEffect, useState, useMemo } from "react";
import type { LocalProject } from "@/lib/local-db";
import type { FileProject } from "@/lib/project-types";
import { ProjectCard } from "./ProjectCard";
import { deleteProject } from "@/lib/local-db";
import { listProjects } from "@/lib/local-db";
import { getDefaultProjectDirectory } from "@/store/utils/localStorage";
import { useToast } from "@/components/Toast";

type ProjectItem = LocalProject | FileProject;

export function ProjectsGrid({ searchQuery = "" }: { searchQuery?: string }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [useFileSystem, setUseFileSystem] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const defaultDir = getDefaultProjectDirectory();
        if (defaultDir.trim()) {
          setUseFileSystem(true);
          const res = await fetch(
            `/api/projects/list?path=${encodeURIComponent(defaultDir)}`
          );
          const data = await res.json();
          if (data.success && Array.isArray(data.projects)) {
            setProjects(
              data.projects.map((p: { id: string; name: string; path: string; updatedAt: string; thumbnail?: string }) => ({
                id: p.id,
                name: p.name,
                path: p.path,
                updatedAt: p.updatedAt,
                source: "file" as const,
                thumbnail: p.thumbnail ?? "/thumbnail.jpeg",
              }))
            );
          } else {
            setProjects([]);
          }
        } else {
          setUseFileSystem(false);
          const local = await listProjects();
          setProjects(local);
        }
      } catch (error) {
        console.error("Error loading projects:", error);
        show("Failed to load projects", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase().trim();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const handleDelete = async (project: ProjectItem) => {
    try {
      const isFile = "source" in project && project.source === "file";
      if (isFile && "path" in project) {
        const res = await fetch(
          `/api/projects/delete?path=${encodeURIComponent(project.path)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
      } else {
        await deleteProject(project.id);
      }
      setProjects((prev) =>
        prev.filter((p) =>
          isFile
            ? !("path" in p) || p.path !== (project as FileProject).path
            : p.id !== project.id
        )
      );
      show("Project deleted successfully", "success");
    } catch (error) {
      show(
        error instanceof Error ? error.message : "Failed to delete project",
        "error"
      );
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 w-full">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="aspect-tv rounded-md bg-[#1c1c1c] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 w-full">
      {filteredProjects.map((project) => (
        <ProjectCard
          key={"path" in project ? project.path : project.id}
          project={project}
          onDelete={() => handleDelete(project)}
        />
      ))}
    </div>
  );
}
