"use client";

import { User, LayoutTemplate, Search, Plus } from "lucide-react";

export type ProjectsViewTab = "mine" | "templates";

type ProjectsStickyHeaderProps = {
  activeTab: ProjectsViewTab;
  onTabChange: (tab: ProjectsViewTab) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onNewProjectClick?: () => void;
};

export function ProjectsStickyHeader({
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search projects...",
  onNewProjectClick,
}: ProjectsStickyHeaderProps) {
  const tabClasses = [
    "flex items-center justify-center gap-2 font-medium transition duration-150 ease-in-out",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "aria-pressed:cursor-default aria-pressed:opacity-100",
    "outline-none focus:outline-none focus-visible:outline-none active:outline-none",
    "h-8 px-4 text-xs rounded-full w-full whitespace-nowrap",
  ].join(" ");

  const ghostClasses =
    "bg-transparent text-[#c8c8c8] hover:bg-[#ffffff1a] active:bg-[#ffffff26]";
  const secondaryClasses =
    "bg-[#f7f7f7] text-[#0d0d0d] aria-pressed:bg-[#d8d8d8] hover:bg-[#e5e5e5] active:bg-[#d8d8d8]";

  return (
    <div className="mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onTabChange("mine")}
              aria-pressed={activeTab === "mine"}
              className={`${tabClasses} ${activeTab === "mine" ? secondaryClasses : ghostClasses}`}
              data-cy="boards-filter-mine-button"
            >
              <User className="hidden md:block size-3.5" aria-hidden />
              <span className="truncate">My projects</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange("templates")}
              aria-pressed={activeTab === "templates"}
              className={`${tabClasses} ${activeTab === "templates" ? secondaryClasses : ghostClasses}`}
              data-cy="boards-tab-templates-button"
            >
              <LayoutTemplate className="hidden md:block size-3.5" aria-hidden />
              <span className="truncate">Templates</span>
            </button>
          </div>
          <div className="flex items-center gap-2 flex-1 justify-end">
            <div className="relative flex-1 max-w-xs">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-[#b1b1b1] pointer-events-none"
                aria-hidden
              />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                data-cy="boards-search-input"
                className="w-full h-8 pl-8 pr-8 py-2 rounded-full border border-[#ffffff1a] bg-transparent text-[#f7f7f7] placeholder:text-[#b1b1b1] text-xs focus:outline-none block"
              />
            </div>
            {onNewProjectClick && (
              <button
                type="button"
                onClick={onNewProjectClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shrink-0"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
            )}
          </div>
        </div>
      </div>
  );
}
