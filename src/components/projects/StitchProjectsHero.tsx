"use client";

import { useCallback, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import type { WorkflowFile } from "@/store/workflowStore";
import { getQuickstartDefaults, getQuickstartSystemInstructionExtra } from "@/store/utils/localStorage";
import type { LLMModelType, LLMProvider } from "@/types";

const SUGGESTIONS = [
  "Product shots with consistent lighting from one reference image",
  "Social ad: image → short video with captions",
  "Background swap and color variants for e‑commerce",
  "Portrait retouch and style transfer pipeline",
];

type StitchProjectsHeroProps = {
  onWorkflowGenerated: (workflow: WorkflowFile) => void;
};

export function StitchProjectsHero({ onWorkflowGenerated }: StitchProjectsHeroProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickstartDefaults = getQuickstartDefaults();
  const provider: LLMProvider = quickstartDefaults?.provider ?? "google";
  const defaultModels: Record<LLMProvider, LLMModelType> = {
    google: "gemini-3-flash-preview",
    openai: "gpt-4.1-mini",
    anthropic: "claude-sonnet-4.5",
  };
  const model: LLMModelType = quickstartDefaults?.model ?? defaultModels[provider];
  const systemInstructionExtra = getQuickstartSystemInstructionExtra();

  const resolveBackendPlannerConfig = useCallback((): { provider: "google" | "openai"; model: string } => {
    if (provider === "openai") {
      return { provider: "openai", model: model === "gpt-4.1-nano" ? "gpt-4.1-nano" : "gpt-4.1-mini" };
    }
    return {
      provider: "google",
      model:
        model === "gemini-2.5-flash" ||
        model === "gemini-3-flash-preview" ||
        model === "gemini-3-pro-preview" ||
        model === "gemini-3.1-pro-preview"
          ? model
          : "gemini-3-flash-preview",
    };
  }, [model, provider]);

  const submit = useCallback(async () => {
    const text = prompt.trim();
    if (text.length < 3) {
      setError("Describe your workflow in at least a few words.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const planner = resolveBackendPlannerConfig();
      const userMessage = systemInstructionExtra?.trim()
        ? `${text}\n\nAdditional instructions:\n${systemInstructionExtra.trim()}`
        : text;
      const response = await fetch("/api/flowy/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          workflowState: { nodes: [], edges: [], groups: {} },
          selectedNodeIds: [],
          provider: planner.provider,
          model: planner.model,
          autoApply: true,
          maxIterations: 3,
        }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.error || "Failed to generate workflow");
      const state = result.finalWorkflowState as { nodes?: unknown[]; edges?: unknown[]; groups?: Record<string, unknown> } | undefined;
      if (!state) throw new Error("No workflow state returned");
      const generatedWorkflow: WorkflowFile = {
        version: 1,
        id: `wf_${Date.now()}_flowy`,
        name: "untitled",
        nodes: Array.isArray(state.nodes) ? (state.nodes as WorkflowFile["nodes"]) : [],
        edges: Array.isArray(state.edges) ? (state.edges as WorkflowFile["edges"]) : [],
        groups: (state.groups ?? {}) as WorkflowFile["groups"],
        edgeStyle: "angular",
      };
      onWorkflowGenerated(generatedWorkflow);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, systemInstructionExtra, onWorkflowGenerated, resolveBackendPlannerConfig]);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-8">
      <div className="text-center">
        <h1 className="text-[2rem] font-normal leading-tight tracking-tight text-stitch-fg sm:text-[2.25rem]">
          Welcome to Openflows
        </h1>
        <p className="mt-2 text-sm text-stitch-muted">
          What workflow shall we build on your canvas?
        </p>
      </div>

      <div className="rounded-2xl border border-secondary bg-surface-container p-4 shadow-none backdrop-blur-glass">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isGenerating) void submit();
              }
            }}
            disabled={isGenerating}
            rows={5}
            placeholder="Describe nodes, inputs, and what you want to generate or edit…"
            className="min-h-[120px] w-full resize-none border-0 bg-transparent pb-12 pr-14 text-sm text-stitch-fg outline-none placeholder:text-stitch-muted disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isGenerating || prompt.trim().length < 3}
            className="absolute bottom-0 right-0 flex size-10 shrink-0 items-center justify-center rounded-full bg-stitch-fg text-neutral-950 transition-colors hover:bg-[#e8eaed] disabled:cursor-not-allowed disabled:opacity-35"
            title="Generate workflow"
            aria-label="Generate workflow"
          >
            {isGenerating ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ArrowUp className="size-5" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>

        {error ? (
          <p className="mt-2 text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setPrompt(s);
              setError(null);
            }}
            className="max-w-full rounded-full border border-secondary bg-surface-container px-3 py-1.5 text-left text-xs font-medium text-stitch-fg backdrop-blur-glass transition-colors hover:bg-state-hover"
          >
            <span className="line-clamp-2">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
