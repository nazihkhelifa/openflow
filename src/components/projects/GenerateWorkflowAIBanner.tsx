"use client";

import { useState } from "react";
import type { WorkflowFile } from "@/store/workflowStore";
import { PromptWorkflowView } from "@/components/quickstart/PromptWorkflowView";

type GenerateWorkflowAIBannerProps = {
  onWorkflowSelected: (workflow: WorkflowFile) => void;
};

export function GenerateWorkflowAIBanner({ onWorkflowSelected }: GenerateWorkflowAIBannerProps) {
  const [showAIPrompt, setShowAIPrompt] = useState(false);

  return (
    <>
      {showAIPrompt && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowAIPrompt(false)}
        >
          <div
            className="w-full max-w-2xl mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl overflow-clip max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <PromptWorkflowView
              onBack={() => setShowAIPrompt(false)}
              onWorkflowGenerated={(workflow) => {
                setShowAIPrompt(false);
                onWorkflowSelected(workflow);
              }}
            />
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowAIPrompt(true)}
        className="relative cursor-pointer group h-[350px] w-full flex-shrink-0 overflow-hidden rounded-3xl block text-left"
      >
        <img
          src="/thumbnails-wf-ai.jpeg"
          alt=""
          className="absolute inset-0 size-full object-cover scale-110 blur-2xl transition-transform duration-300 group-hover:scale-150"
        />
        <div className="absolute inset-0 bg-[#0f0f0f]/70" />
        <div className="absolute inset-0 flex flex-col justify-center gap-4 p-14">
          <h3 className="text-base font-semibold text-[#f7f7f7]">Generate workflow with AI</h3>
          <p className="text-xs leading-relaxed text-[#c8c8c8] max-w-md">
            Describe what you need and let Gemini build your workflow
          </p>
          <span className="inline-flex items-center justify-center gap-2 h-8 px-4 text-xs font-medium rounded-full bg-[#f7f7f7] text-[#0d0d0d] w-fit hover:bg-[#e5e5e5] transition-colors">
            Generate with AI
          </span>
        </div>
      </button>
    </>
  );
}
