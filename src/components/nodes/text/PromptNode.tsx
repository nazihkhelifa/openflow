"use client";

import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { PromptNodeToolbar } from "./PromptNodeToolbar";
import { useWorkflowStore } from "@/store/workflowStore";
import { ConnectedImageThumbnails } from "../shared/ConnectedImageThumbnails";
import { PromptNodeData, AvailableVariable } from "@/types";
import { usePromptAutocomplete } from "@/hooks/usePromptAutocomplete";
import { parseVarTags } from "@/utils/parseVarTags";
import { NodeRunButton } from "../shared/NodeRunButton";

type PromptNodeType = Node<PromptNodeData, "prompt">;

const TEXT_EXAMPLE_PROMPT = "Describe what to generate...";

export function PromptNode({ id, data, selected }: NodeProps<PromptNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const isRunning = useWorkflowStore((state) => state.isRunning);
  const edges = useWorkflowStore((state) => state.edges);
  const nodes = useWorkflowStore((state) => state.nodes);

  const [localPrompt, setLocalPrompt] = useState(nodeData.prompt);
  const [localOutput, setLocalOutput] = useState(nodeData.outputText ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingOutput, setIsEditingOutput] = useState(false);
  const [showVarDialog, setShowVarDialog] = useState(false);
  const [varNameInput, setVarNameInput] = useState(nodeData.variableName || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement>(null);

  const hasIncomingTextConnection = useMemo(() => {
    return edges.some((e) => e.target === id && e.targetHandle === "text");
  }, [edges, id]);

  // Available variables from connected Prompt nodes
  const availableVariables = useMemo((): AvailableVariable[] => {
    const connectedTextNodes = edges
      .filter((e) => e.target === id && e.targetHandle === "text")
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is (typeof nodes)[0] => n !== undefined);

    const vars: AvailableVariable[] = [];
    const usedNames = new Set<string>();

    connectedTextNodes.forEach((node) => {
      if (node.type === "prompt") {
        const d = node.data as PromptNodeData;
        const output = d.outputText ?? null;
        if (d.variableName && output) {
          vars.push({
            name: d.variableName,
            value: output,
            nodeId: node.id,
          });
          usedNames.add(d.variableName);
        }
      }
    });

    connectedTextNodes.forEach((node) => {
      if (node.type !== "prompt") return;
      const d = node.data as PromptNodeData;
      const output = d.outputText ?? null;
      if (output) {
        parseVarTags(output).forEach(({ name, value }) => {
          if (!usedNames.has(name)) {
            vars.push({ name, value, nodeId: `${node.id}-var-${name}` });
            usedNames.add(name);
          }
        });
      }
    });

    return vars;
  }, [edges, nodes, id]);

  const { showAutocomplete, autocompletePosition, filteredAutocompleteVars, selectedAutocompleteIndex, handleChange, handleKeyDown, handleAutocompleteSelect, closeAutocomplete } = usePromptAutocomplete({
    availableVariables,
    textareaRef,
    localTemplate: localPrompt,
    setLocalTemplate: setLocalPrompt,
    onTemplateCommit: (newTemplate) => updateNodeData(id, { prompt: newTemplate }),
  });

  const {
    showAutocomplete: showOutputAutocomplete,
    autocompletePosition: outputAutocompletePosition,
    filteredAutocompleteVars: filteredOutputAutocompleteVars,
    selectedAutocompleteIndex: selectedOutputAutocompleteIndex,
    handleChange: handleOutputChange,
    handleKeyDown: handleOutputKeyDown,
    handleAutocompleteSelect: handleOutputAutocompleteSelect,
    closeAutocomplete: closeOutputAutocomplete,
  } = usePromptAutocomplete({
    availableVariables,
    textareaRef: outputTextareaRef,
    localTemplate: localOutput,
    setLocalTemplate: setLocalOutput,
    onTemplateCommit: (v) => updateNodeData(id, { outputText: v || null }),
  });

  const resolvedText = useMemo(() => {
    let resolved = localPrompt;
    availableVariables.forEach((v) => {
      resolved = resolved.replace(new RegExp(`@${v.name}`, "g"), v.value);
    });
    return resolved;
  }, [localPrompt, availableVariables]);

  useEffect(() => {
    if (!isEditing) setLocalPrompt(nodeData.prompt);
  }, [nodeData.prompt, isEditing]);

  useEffect(() => {
    if (!isEditingOutput) setLocalOutput(nodeData.outputText ?? "");
  }, [nodeData.outputText, isEditingOutput]);

  const prevStatusRef = useRef(nodeData.status);
  useEffect(() => {
    if (prevStatusRef.current === "loading" && nodeData.status !== "loading") {
      setLocalOutput(nodeData.outputText ?? "");
    }
    prevStatusRef.current = nodeData.status;
  }, [nodeData.status, nodeData.outputText]);

  const handleFocus = useCallback(() => setIsEditing(true), []);
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (localPrompt !== nodeData.prompt) updateNodeData(id, { prompt: localPrompt });
    setTimeout(() => closeAutocomplete(), 200);
  }, [id, localPrompt, nodeData.prompt, updateNodeData, closeAutocomplete]);

  const handleOutputFocus = useCallback(() => setIsEditingOutput(true), []);
  const handleOutputBlur = useCallback(() => {
    setIsEditingOutput(false);
    if (localOutput !== (nodeData.outputText ?? "")) updateNodeData(id, { outputText: localOutput || null });
    setTimeout(() => closeOutputAutocomplete(), 200);
  }, [id, localOutput, nodeData.outputText, updateNodeData, closeOutputAutocomplete]);

  const handleInstructionsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setLocalPrompt(v);
      updateNodeData(id, { prompt: v });
    },
    [id, updateNodeData]
  );

  const displayedOutput = isEditingOutput ? localOutput : (nodeData.outputText ?? "");
  const isGenerating = nodeData.status === "loading";

  return (
    <>
      <PromptNodeToolbar nodeId={id} data={nodeData} />
      <BaseNode
        id={id}
        selected={selected}
        hasError={nodeData.status === "error"}
        isExecuting={isRunning}
        fullBleed
        resizable={false}
        footerRight={<NodeRunButton nodeId={id} disabled={isRunning} />}
      >
        <div className="relative w-full h-full min-h-0 flex flex-col overflow-hidden rounded-xl">
          {/* Main output area - like arty's text node */}
          <div className="group/text relative flex-1 min-h-0 overflow-hidden rounded-t-xl bg-neutral-900/40">
            {isGenerating ? (
              <div className="w-full h-full flex items-center justify-center">
                <svg className="w-4 h-4 animate-spin text-neutral-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : nodeData.status === "error" ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                <span className="text-red-400 text-xs">Generation failed</span>
                {nodeData.error && <span className="text-red-300 text-[10px] text-center line-clamp-2">{nodeData.error}</span>}
              </div>
            ) : (
              <div className="relative w-full h-full">
                <textarea
                  ref={outputTextareaRef}
                  value={displayedOutput}
                  onChange={handleOutputChange}
                  onFocus={handleOutputFocus}
                  onBlur={handleOutputBlur}
                  onKeyDown={handleOutputKeyDown}
                  placeholder={selected ? "Run to generate, type manually, or use @ for variables" : ""}
                  disabled={isGenerating}
                  className="nodrag nopan nowheel w-full h-full p-3 pb-12 text-xs leading-relaxed text-neutral-100 bg-transparent rounded-xl resize-none focus:outline-none placeholder:text-neutral-500"
                />
                <div className="absolute bottom-2 left-2">
                  <ConnectedImageThumbnails nodeId={id} />
                </div>
                {showOutputAutocomplete && filteredOutputAutocompleteVars.length > 0 && (
                  <div
                    className="absolute z-20 bg-neutral-800 border border-neutral-600 rounded shadow-xl max-h-32 overflow-y-auto"
                    style={{ top: outputAutocompletePosition.top, left: outputAutocompletePosition.left }}
                  >
                    {filteredOutputAutocompleteVars.map((v, i) => (
                      <button
                        key={v.nodeId}
                        onMouseDown={(e) => { e.preventDefault(); handleOutputAutocompleteSelect(v.name); }}
                        className={`w-full px-3 py-2 text-left text-[11px] ${i === selectedOutputAutocompleteIndex ? "bg-neutral-700" : "hover:bg-neutral-700"}`}
                      >
                        <span className="text-blue-400">@{v.name}</span>
                        <span className="text-neutral-500 truncate block">{v.value || "(empty)"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Instructions / prompt area - like arty's bottom section */}
          <div className="flex-shrink-0 border-t border-neutral-700/60">
            {hasIncomingTextConnection ? (
              <div className="max-h-20 overflow-y-auto p-2 text-[10px] text-neutral-400 whitespace-pre-wrap break-words bg-neutral-900/60">
                {resolvedText || "No text from connected node"}
              </div>
            ) : (
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={localPrompt}
                  onChange={handleChange}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  onKeyDown={handleKeyDown}
                  placeholder={`Try "${TEXT_EXAMPLE_PROMPT}" or type @ for variables`}
                  className="nodrag nopan nowheel w-full p-2 text-[11px] leading-relaxed text-neutral-100 bg-neutral-900/60 rounded-b-xl resize-none focus:outline-none placeholder:text-neutral-500 min-h-[60px]"
                />
                {showAutocomplete && filteredAutocompleteVars.length > 0 && (
                  <div
                    className="absolute z-20 bg-neutral-800 border border-neutral-600 rounded shadow-xl max-h-32 overflow-y-auto"
                    style={{ top: autocompletePosition.top, left: autocompletePosition.left }}
                  >
                    {filteredAutocompleteVars.map((v, i) => (
                      <button
                        key={v.nodeId}
                        onMouseDown={(e) => { e.preventDefault(); handleAutocompleteSelect(v.name); }}
                        className={`w-full px-3 py-2 text-left text-[11px] ${i === selectedAutocompleteIndex ? "bg-neutral-700" : "hover:bg-neutral-700"}`}
                      >
                        <span className="text-blue-400">@{v.name}</span>
                        <span className="text-neutral-500 truncate block">{v.value || "(empty)"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowVarDialog(true)}
            className="nodrag nopan absolute bottom-12 left-2 z-10 text-[10px] text-blue-400 hover:text-blue-300"
            title="Set variable name"
          >
            {nodeData.variableName ? `@${nodeData.variableName}` : "Add variable"}
          </button>
        </div>
      </BaseNode>

      {/* Handles outside node for easier connecting */}
      <Handle type="target" position={Position.Left} id="image" style={{ top: "30%", background: "#e5e5e5" }} data-handletype="image" />
      <Handle type="target" position={Position.Left} id="text" style={{ top: "70%" }} data-handletype="text" />
      <Handle type="source" position={Position.Right} id="text" data-handletype="text" />

      {showVarDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]" onClick={() => setShowVarDialog(false)}>
          <div className="bg-neutral-800 border border-neutral-600 rounded-xl shadow-xl p-4 w-96" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-neutral-100 mb-3">Set Variable Name</h3>
            <p className="text-xs text-neutral-400 mb-3">Use this prompt as @variable in other Prompt nodes</p>
            <input
              type="text"
              value={varNameInput}
              onChange={(e) => setVarNameInput(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30))}
              placeholder="e.g. color, style"
              className="w-full px-3 py-2 text-sm bg-neutral-900 border border-neutral-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => setShowVarDialog(false)} className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-300">Cancel</button>
              <button
                onClick={() => {
                  updateNodeData(id, { variableName: varNameInput || undefined });
                  setShowVarDialog(false);
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
