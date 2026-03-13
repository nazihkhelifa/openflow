"use client";

import { useState, useCallback } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { QuickstartBackButton } from "./QuickstartBackButton";

interface PromptWorkflowViewProps {
  onBack: () => void;
  onWorkflowGenerated: (workflow: WorkflowFile) => void;
}

export function PromptWorkflowView({
  onBack,
  onWorkflowGenerated,
}: PromptWorkflowViewProps) {
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!description || description.trim().length < 3) {
      setError("Please describe your workflow (at least 3 characters)");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/quickstart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          contentLevel: "full",
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to generate workflow");
      }

      if (result.workflow) {
        onWorkflowGenerated(result.workflow);
      }
    } catch (err) {
      console.error("Prompt workflow error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate workflow"
      );
    } finally {
      setIsGenerating(false);
    }
  }, [description, onWorkflowGenerated]);

  const canGenerate = description.trim().length >= 3 && !isGenerating;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-700 flex items-center gap-4">
        <QuickstartBackButton onClick={onBack} disabled={isGenerating} />
        <h2 className="text-lg font-semibold text-neutral-100">
          Prompt a Workflow
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Description Input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-400">
            Describe your workflow
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setError(null);
            }}
            placeholder="e.g., Create product photography with consistent lighting and style from reference images..."
            disabled={isGenerating}
            rows={5}
            className={`
              w-full px-4 py-3 rounded-lg border bg-neutral-900/50 text-sm text-neutral-100
              placeholder:text-neutral-500 resize-none
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
              ${isGenerating ? "opacity-50 cursor-not-allowed" : ""}
              border-neutral-700 hover:border-neutral-600
            `}
          />
          <p className="text-xs text-neutral-400">
            Describe what you want your workflow to accomplish. Be specific
            about inputs, outputs, and any transformations.
          </p>
          <p className="text-xs text-neutral-400">
            Note: This feature currently only works with Gemini models.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <svg
              className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-red-400/70 hover:text-red-400 mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-neutral-700 flex justify-end bg-neutral-800/50">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className={`
            flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all
            ${
              canGenerate
                ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20"
                : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
            }
          `}
        >
          {isGenerating ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Generating...</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              <span>Generate Workflow</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
