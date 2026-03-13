"use client";

import { useState, useRef, useEffect } from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { PromptNodeData, LLMProvider, LLMModelType } from "@/types";
import { ChevronDown, Thermometer } from "lucide-react";

const LLM_PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: "google", label: "Google" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

const LLM_MODELS: Record<LLMProvider, { value: LLMModelType; label: string }[]> = {
  google: [
    { value: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-3-pro-preview", label: "Gemini 3.0 Pro" },
    { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  ],
  openai: [
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  ],
  anthropic: [
    { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
    { value: "claude-opus-4.6", label: "Claude Opus 4.6" },
  ],
};

interface PromptNodeToolbarProps {
  nodeId: string;
  data: PromptNodeData;
}

export function PromptNodeToolbar({ nodeId, data }: PromptNodeToolbarProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showTempPopover, setShowTempPopover] = useState(false);
  const providerDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const tempPopoverRef = useRef<HTMLDivElement>(null);

  const provider = data.provider ?? "google";
  const model = data.model ?? LLM_MODELS[provider][0]?.value ?? "gemini-2.5-flash";
  const temperature = data.temperature ?? 0.7;
  const availableModels = LLM_MODELS[provider] ?? LLM_MODELS.google;
  const currentProviderLabel = LLM_PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
  const currentModelLabel = availableModels.find((m) => m.value === model)?.label ?? model;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inProvider = providerDropdownRef.current?.contains(target);
      const inModel = modelDropdownRef.current?.contains(target);
      const inTemp = tempPopoverRef.current?.contains(target);
      if (!inProvider && !inModel && !inTemp) {
        setShowProviderDropdown(false);
        setShowModelDropdown(false);
        setShowTempPopover(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const stopProp = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  return (
    <NodeToolbar nodeId={nodeId} position={Position.Top} offset={8} align="center" className="nodrag nopan" style={{ pointerEvents: "auto" }}>
      <div className="overflow-visible" onMouseDownCapture={stopProp} onPointerDownCapture={stopProp}>
        <div className="flex items-center gap-0.5 rounded-xl border border-neutral-600 bg-neutral-800/95 p-1 shadow-lg backdrop-blur-sm">
          {/* Provider selector */}
          <div className="relative" ref={providerDropdownRef}>
            <button
              type="button"
              data-no-drag
              data-no-pan
              onMouseDown={stopProp}
              onPointerDown={stopProp}
              onClick={(e) => { e.stopPropagation(); setShowProviderDropdown(!showProviderDropdown); setShowModelDropdown(false); setShowTempPopover(false); }}
              className="nodrag nopan inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-700/80 transition-colors"
              title="Select provider"
            >
              <span className="max-w-[80px] truncate">{currentProviderLabel}</span>
              <ChevronDown className="size-3 opacity-50" />
            </button>
            {showProviderDropdown && (
              <div className="absolute left-0 top-full mt-1 z-[1001] min-w-[8rem] rounded-md border border-neutral-600 bg-neutral-800 shadow-xl overflow-hidden" onMouseDown={stopProp} onPointerDown={stopProp}>
                <div className="p-1">
                  {LLM_PROVIDERS.map((prov) => (
                    <button
                      key={prov.value}
                      type="button"
                      data-no-drag
                      data-no-pan
                      onMouseDown={stopProp}
                      onPointerDown={stopProp}
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstModel = LLM_MODELS[prov.value]?.[0]?.value;
                        updateNodeData(nodeId, { provider: prov.value, model: firstModel ?? "gemini-2.5-flash" });
                        setShowProviderDropdown(false);
                      }}
                      className={`nodrag nopan w-full px-2 py-1.5 text-left text-xs rounded hover:bg-neutral-700 ${
                        provider === prov.value ? "bg-neutral-700 text-white" : "text-neutral-200"
                      }`}
                    >
                      {prov.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-600" />

          {/* Model selector */}
          <div className="relative" ref={modelDropdownRef}>
            <button
              type="button"
              data-no-drag
              data-no-pan
              onMouseDown={stopProp}
              onPointerDown={stopProp}
              onClick={(e) => { e.stopPropagation(); setShowModelDropdown(!showModelDropdown); setShowProviderDropdown(false); setShowTempPopover(false); }}
              className="nodrag nopan inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-700/80 transition-colors"
              title="Select model"
            >
              <span className="max-w-[100px] truncate">{currentModelLabel}</span>
              <ChevronDown className="size-3 opacity-50" />
            </button>
            {showModelDropdown && (
              <div className="absolute left-0 top-full mt-1 z-[1001] min-w-[10rem] rounded-md border border-neutral-600 bg-neutral-800 shadow-xl overflow-hidden" onMouseDown={stopProp} onPointerDown={stopProp}>
                <div className="p-1">
                  {availableModels.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      data-no-drag
                      data-no-pan
                      onMouseDown={stopProp}
                      onPointerDown={stopProp}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateNodeData(nodeId, { model: m.value });
                        setShowModelDropdown(false);
                      }}
                      className={`nodrag nopan w-full px-2 py-1.5 text-left text-xs rounded hover:bg-neutral-700 ${
                        model === m.value ? "bg-neutral-700 text-white" : "text-neutral-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-neutral-600" />

          {/* Temperature */}
          <div className="relative" ref={tempPopoverRef}>
            <button
              type="button"
              data-no-drag
              data-no-pan
              onMouseDown={stopProp}
              onPointerDown={stopProp}
              onClick={(e) => { e.stopPropagation(); setShowTempPopover(!showTempPopover); setShowProviderDropdown(false); setShowModelDropdown(false); }}
              className="nodrag nopan inline-flex h-7 items-center gap-1 rounded-md px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-700/80 transition-colors"
              title="Temperature"
            >
              <Thermometer className="size-3.5" />
              <span>{temperature.toFixed(1)}</span>
            </button>
            {showTempPopover && (
              <div className="absolute right-0 top-full mt-1 z-[1001] w-48 rounded-md border border-neutral-600 bg-neutral-800 p-3 shadow-xl" onMouseDown={stopProp} onPointerDown={stopProp}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-neutral-400">Temperature</span>
                  <span className="text-xs text-neutral-400">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={provider === "anthropic" ? "1" : "2"}
                  step="0.1"
                  value={temperature}
                  data-no-drag
                  data-no-pan
                  onMouseDown={stopProp}
                  onPointerDown={stopProp}
                  onChange={(e) => updateNodeData(nodeId, { temperature: parseFloat(e.target.value) })}
                  className="nodrag nopan w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
                  <span>Precise</span>
                  <span>Creative</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </NodeToolbar>
  );
}
