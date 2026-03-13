"use client";

import { useState, useEffect, useCallback } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { getAllPresets } from "@/lib/quickstart/templates";
import { QuickstartBackButton } from "./QuickstartBackButton";
import { CommunityWorkflowMeta } from "@/types/quickstart";

interface QuickstartTemplatesViewProps {
  onBack: () => void;
  onWorkflowSelected: (workflow: WorkflowFile) => void;
}

export function QuickstartTemplatesView({
  onBack,
  onWorkflowSelected,
}: QuickstartTemplatesViewProps) {
  const [communityWorkflows, setCommunityWorkflows] = useState<CommunityWorkflowMeta[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = getAllPresets();

  // Fetch community workflows on mount
  useEffect(() => {
    async function fetchCommunityWorkflows() {
      try {
        const response = await fetch("/api/community-workflows");
        const result = await response.json();

        if (result.success) {
          setCommunityWorkflows(result.workflows);
        } else {
          console.error("Failed to fetch community workflows:", result.error);
        }
      } catch (err) {
        console.error("Error fetching community workflows:", err);
      } finally {
        setIsLoadingList(false);
      }
    }

    fetchCommunityWorkflows();
  }, []);

  const handlePresetSelect = useCallback(
    async (templateId: string) => {
      setLoadingWorkflowId(templateId);
      setError(null);

      try {
        const response = await fetch("/api/quickstart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            contentLevel: "full",
          }),
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || "Failed to load template");
        }

        if (result.workflow) {
          onWorkflowSelected(result.workflow);
        }
      } catch (err) {
        console.error("Error loading preset:", err);
        setError(err instanceof Error ? err.message : "Failed to load template");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const handleCommunitySelect = useCallback(
    async (workflowId: string) => {
      setLoadingWorkflowId(workflowId);
      setError(null);

      try {
        // Step 1: Get presigned download URL from API
        const response = await fetch(`/api/community-workflows/${workflowId}`);
        const result = await response.json();

        if (!result.success || !result.downloadUrl) {
          throw new Error(result.error || "Failed to get download URL");
        }

        // Step 2: Download workflow directly from R2
        const workflowResponse = await fetch(result.downloadUrl);
        if (!workflowResponse.ok) {
          throw new Error("Failed to download workflow");
        }

        const workflow = await workflowResponse.json();
        onWorkflowSelected(workflow);
      } catch (err) {
        console.error("Error loading community workflow:", err);
        setError(err instanceof Error ? err.message : "Failed to load workflow");
      } finally {
        setLoadingWorkflowId(null);
      }
    },
    [onWorkflowSelected]
  );

  const isLoading = loadingWorkflowId !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-700 flex items-center gap-4">
        <QuickstartBackButton onClick={onBack} disabled={isLoading} />
        <h2 className="text-lg font-semibold text-neutral-100">
          Workflow Templates
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Description */}
        <p className="text-sm text-neutral-400">
          Pre-built workflows to help you get started quickly. Select a template to load it into the canvas.
        </p>

        {/* Quick Start Templates */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Quick Start
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset.id)}
                disabled={isLoading}
                className={`
                  group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left
                  ${
                    loadingWorkflowId === preset.id
                      ? "bg-blue-600/20 border-blue-500/50"
                      : "bg-neutral-800/50 border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800"
                  }
                  ${isLoading && loadingWorkflowId !== preset.id ? "opacity-50" : ""}
                  ${isLoading ? "cursor-not-allowed" : "cursor-pointer"}
                `}
              >
                <div
                  className={`
                    w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0
                    ${
                      loadingWorkflowId === preset.id
                        ? "bg-blue-500/30"
                        : "bg-neutral-700/50 group-hover:bg-neutral-700"
                    }
                  `}
                >
                  {loadingWorkflowId === preset.id ? (
                    <svg
                      className="w-4 h-4 text-blue-400 animate-spin"
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
                  ) : (
                    <svg
                      className="w-4 h-4 text-neutral-400 group-hover:text-neutral-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={preset.icon}
                      />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-neutral-200 truncate">
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    {preset.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-neutral-700" />

        {/* Community Workflows */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Community Workflows
          </h3>

          {isLoadingList ? (
            <div className="flex items-center justify-center py-8">
              <svg
                className="w-5 h-5 text-neutral-500 animate-spin"
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
            </div>
          ) : communityWorkflows.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">
              No community workflows available
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {communityWorkflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => handleCommunitySelect(workflow.id)}
                  disabled={isLoading}
                  className={`
                    group flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all text-left
                    ${
                      loadingWorkflowId === workflow.id
                        ? "bg-purple-600/20 border-purple-500/50"
                        : "bg-neutral-800/50 border-neutral-700 hover:border-neutral-600 hover:bg-neutral-800"
                    }
                    ${isLoading && loadingWorkflowId !== workflow.id ? "opacity-50" : ""}
                    ${isLoading ? "cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div
                    className={`
                      w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0
                      ${
                        loadingWorkflowId === workflow.id
                          ? "bg-purple-500/30"
                          : "bg-neutral-700/50 group-hover:bg-neutral-700"
                      }
                    `}
                  >
                    {loadingWorkflowId === workflow.id ? (
                      <svg
                        className="w-4 h-4 text-purple-400 animate-spin"
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
                    ) : (
                      <svg
                        className="w-4 h-4 text-neutral-400 group-hover:text-neutral-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-200 truncate">
                      {workflow.name}
                    </div>
                    <div className="text-[10px] text-purple-400/80">
                      @{workflow.author}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Discord CTA */}
          <p className="text-xs text-neutral-500 mt-3">
            Want to share your workflow?{" "}
            <a
              href="https://discord.com/invite/89Nr6EKkTf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline"
            >
              Join our Discord
            </a>{" "}
            to submit it to the community templates.
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
    </div>
  );
}
