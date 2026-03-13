"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { WorkflowFile } from "@/store/workflowStore";
import { CommunityWorkflowMeta } from "@/types/quickstart";
import { X } from "lucide-react";
import { TemplateGridCard } from "./TemplateGridCard";

const gradientColors = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-green-500 to-emerald-600",
  "from-orange-500 to-red-600",
  "from-pink-500 to-rose-600",
];

type CommunitySectionProps = {
  searchQuery?: string;
  onWorkflowSelected: (workflow: WorkflowFile) => void;
  sectionTitle?: string;
};

export function CommunitySection({ searchQuery = "", onWorkflowSelected, sectionTitle = "Community examples" }: CommunitySectionProps) {
  const [communityWorkflows, setCommunityWorkflows] = useState<CommunityWorkflowMeta[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const filteredCommunity = useMemo(() => {
    return communityWorkflows.filter((workflow) => {
      if (searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase().trim();
        if (
          !workflow.name.toLowerCase().includes(searchLower) &&
          !workflow.author.toLowerCase().includes(searchLower) &&
          !workflow.description.toLowerCase().includes(searchLower)
        )
          return false;
      }
      if (selectedTags.size > 0) {
        if (!workflow.tags.some((tag) => selectedTags.has(tag))) return false;
      }
      return true;
    });
  }, [communityWorkflows, searchQuery, selectedTags]);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    communityWorkflows.forEach((w) => w.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [communityWorkflows]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedTags(new Set());
  }, []);

  const hasActiveFilters = searchQuery.trim() || selectedTags.size > 0;
  const hasNoResults = filteredCommunity.length === 0 && !isLoadingList;

  useEffect(() => {
    fetch("/api/community-workflows")
      .then((res) => res.json())
      .then((result) => {
        if (result.success) setCommunityWorkflows(result.workflows);
      })
      .catch(console.error)
      .finally(() => setIsLoadingList(false));
  }, []);

  const handleCommunitySelect = useCallback(
    async (workflowId: string) => {
      setLoadingWorkflowId(workflowId);
      setError(null);
      try {
        const res = await fetch(`/api/community-workflows/${workflowId}`);
        const result = await res.json();
        if (!result.success || !result.downloadUrl) throw new Error(result.error || "Failed to get download URL");
        const wfRes = await fetch(result.downloadUrl);
        if (!wfRes.ok) throw new Error("Failed to download workflow");
        const workflow = await wfRes.json();
        onWorkflowSelected(workflow);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workflow");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const isLoading = loadingWorkflowId !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Tag filters - search is in header */}
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {availableTags.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  selectedTags.has(tag)
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                    : "text-neutral-400 hover:text-neutral-300 border border-transparent hover:bg-neutral-800/80"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400/70 hover:text-red-400">
            Dismiss
          </button>
        </div>
      )}

      {hasNoResults ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-neutral-400 mb-4">
            {hasActiveFilters ? "No community workflows match your filters" : "No community workflows yet"}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {(filteredCommunity.length > 0 || isLoadingList) && (
            <div>
              <h4 className="text-[#f7f7f7] font-semibold mb-4">{sectionTitle}</h4>
              {isLoadingList ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 w-full">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="aspect-tv rounded-md bg-[#1c1c1c] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-4 w-full">
                  {filteredCommunity.map((workflow) => (
                    <TemplateGridCard
                      key={workflow.id}
                      name={workflow.name}
                      description={workflow.description}
                      previewImage={workflow.previewImage}
                      gradientIndex={Math.abs(workflow.id.charCodeAt(0) % gradientColors.length)}
                      nodeCount={workflow.nodeCount}
                      tags={workflow.tags}
                      author={workflow.author}
                      isLoading={loadingWorkflowId === workflow.id}
                      disabled={isLoading && loadingWorkflowId !== workflow.id}
                      onUse={() => handleCommunitySelect(workflow.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
