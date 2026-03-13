"use client";

import { useState, useCallback, useMemo } from "react";
import type { WorkflowFile } from "@/store/workflowStore";
import { getAllPresets, PRESET_TEMPLATES } from "@/lib/quickstart/templates";
import type { TemplateMetadata } from "@/types/quickstart";
import { TemplateGridCard } from "./TemplateGridCard";

const primaryThumbnails: Record<string, string> = {
  "product-shot": "/template-thumbnails/primary/product-shot.jpg",
  "model-product": "/template-thumbnails/primary/model-product.jpg",
  "color-variations": "/template-thumbnails/primary/color-variations.jpg",
  "background-swap": "/template-thumbnails/primary/background-swap.jpg",
  "style-transfer": "/template-thumbnails/primary/style-transfer.jpg",
  "scene-composite": "/template-thumbnails/primary/scene-composite.jpg",
};

const gradientColors = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-green-500 to-emerald-600",
  "from-orange-500 to-red-600",
  "from-pink-500 to-rose-600",
];

type QuickStartSectionProps = {
  searchQuery?: string;
  onWorkflowSelected: (workflow: WorkflowFile) => void;
};

export function QuickStartSection({ searchQuery = "", onWorkflowSelected }: QuickStartSectionProps) {
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = getAllPresets();

  const filteredPresets = useMemo(() => {
    if (!searchQuery.trim()) return presets;
    const q = searchQuery.toLowerCase().trim();
    return presets.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [presets, searchQuery]);

  const presetMetadata: Record<string, TemplateMetadata> = {};
  PRESET_TEMPLATES.forEach((template) => {
    presetMetadata[template.id] = {
      nodeCount: template.workflow.nodes.length,
      category: template.category,
      tags: template.tags,
    };
  });

  const handlePresetSelect = useCallback(
    async (templateId: string) => {
      setLoadingWorkflowId(templateId);
      setError(null);
      try {
        const res = await fetch("/api/quickstart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, contentLevel: "full" }),
        });
        const result = await res.json();
        if (!result.success) throw new Error(result.error || "Failed to load template");
        if (result.workflow) onWorkflowSelected(result.workflow);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load template");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const isLoading = loadingWorkflowId !== null;

  return (
    <section className="w-full">
      <h2 className="text-lg font-semibold text-[#f7f7f7] mb-4">Getting started</h2>
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 mb-4">
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400/70 hover:text-red-400">
            Dismiss
          </button>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-3">
        {filteredPresets.map((preset) => (
          <TemplateGridCard
            key={preset.id}
            name={preset.name}
            description={preset.description}
            previewImage={primaryThumbnails[preset.id]}
            gradientIndex={Math.abs(preset.id.charCodeAt(0) % gradientColors.length)}
            nodeCount={presetMetadata[preset.id]?.nodeCount ?? 0}
            tags={preset.tags}
            variant="gettingStarted"
            isLoading={loadingWorkflowId === preset.id}
            disabled={isLoading && loadingWorkflowId !== preset.id}
            onUse={() => handlePresetSelect(preset.id)}
          />
        ))}
      </div>
    </section>
  );
}
