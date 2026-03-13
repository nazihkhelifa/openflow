"use client";

import { Plus, Search } from "lucide-react";

type ProjectsContentHeaderProps = {
  title?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onNewProjectClick?: () => void;
  showSearch?: boolean;
};

export function ProjectsContentHeader({
  title = "Home",
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search projects and templates...",
  onNewProjectClick,
  showSearch = true,
}: ProjectsContentHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 bg-transparent">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <h1 className="text-base font-medium text-white shrink-0">{title}</h1>
        {showSearch && (
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 shrink-0" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-neutral-800/80 border border-neutral-700 text-neutral-200 placeholder-neutral-500 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600 focus:border-neutral-600"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onNewProjectClick && (
          <button
            type="button"
            onClick={onNewProjectClick}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
      </div>
    </header>
  );
}
