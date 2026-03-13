"use client";

import { X } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import type { LocalProject } from "@/lib/local-db";
import type { FileProject } from "@/lib/project-types";
import { getProjectThumbnail } from "@/lib/project-thumbnail";
import { formatRelativeTime } from "@/lib/relative-time";

type ProjectCardProps = {
  project: LocalProject | FileProject;
  onDelete: () => void;
  showDelete?: boolean;
};

export function ProjectCard({
  project,
  onDelete,
  showDelete = true,
}: ProjectCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const thumbnail =
    "content" in project
      ? getProjectThumbnail(project as LocalProject)
      : "thumbnail" in project && (project as FileProject).thumbnail
        ? { url: (project as FileProject).thumbnail!, type: "image" as const }
        : null;
  const name = project.name || "Untitled Project";
  const subtitle = project.updatedAt
    ? formatRelativeTime(project.updatedAt)
    : null;
  const aspectClass = "aspect-tv";

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm("Delete this project? This cannot be undone.")) {
      onDelete();
    }
  };

  const cardVisual = (
    <div className="relative h-full w-full">
      {thumbnail ? (
        thumbnail.type === "video" ? (
          <video
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            src={thumbnail.url}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
          />
        ) : (
          <img
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            src={thumbnail.url}
          />
        )
      ) : (
        <>
          <img
            src="/thumbnail.jpeg"
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] bg-neutral-800"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.classList.remove("hidden");
            }}
          />
          <div className="hidden absolute inset-0 bg-neutral-800 flex items-center justify-center">
            <span className="text-neutral-500 text-sm">No preview</span>
          </div>
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <p className="text-sm font-medium text-white truncate">{name}</p>
        {subtitle && (
          <p className="text-xs text-white/80 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`relative cursor-pointer group rounded-md overflow-hidden bg-[#1c1c1c] ${aspectClass}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/projects/${project.id}`} className="block h-full w-full">
        {cardVisual}
      </Link>

      {showDelete && (
        <button
          type="button"
          className="absolute top-4 right-4 z-20 transition-opacity duration-200"
          style={{ opacity: isHovered ? 1 : 0 }}
          onClick={handleDeleteClick}
          title="Delete"
        >
          <X
            className="w-8 h-8 text-white/80 hover:text-white transition-colors bg-black/30 rounded-full p-1.5 backdrop-blur-sm hover:bg-red-500/80"
            strokeWidth={2}
          />
        </button>
      )}
    </div>
  );
}
