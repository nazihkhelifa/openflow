"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { EditOperation } from "@/lib/chat/editOperations";

type WorkflowState = {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
};

type FlowyPlanResponse = {
  assistantText: string;
  operations: EditOperation[];
  requiresApproval?: boolean;
  approvalReason?: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export function FlowyAgentPanel({
  isOpen,
  onClose,
  onApplyEdits,
  workflowState,
  selectedNodeIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApplyEdits?: (operations: EditOperation[]) => { applied: number; skipped: string[] };
  workflowState?: WorkflowState;
  selectedNodeIds?: string[];
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [pendingOperations, setPendingOperations] = useState<EditOperation[] | null>(null);
  const [pendingExplanation, setPendingExplanation] = useState<string | null>(null);

  const stateForRequest = useMemo(() => {
    // Ensure we always send a consistent shape.
    if (!workflowState) return undefined;
    return {
      nodes: workflowState.nodes,
      edges: workflowState.edges,
    };
  }, [workflowState]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handlePlan = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isPlanning) return;

    setErrorMessage(null);
    setIsPlanning(true);

    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: trimmed };
    setChatMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/flowy/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          workflowState: stateForRequest,
          selectedNodeIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Plan failed (${res.status})`);
      }

      const data = (await res.json()) as ({ ok: boolean; error?: string } & FlowyPlanResponse);
      if (!data.ok) throw new Error(data.error || "Plan failed");

      const assistantText = data.assistantText ?? "";
      const ops = data.operations ?? [];

      setPendingOperations(ops);
      setPendingExplanation(assistantText);
      setChatMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: assistantText },
      ]);

      // Assist mode: always propose first.
      scrollToBottom();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to plan edits");
    } finally {
      setIsPlanning(false);
    }
  }, [input, isPlanning, selectedNodeIds, scrollToBottom, stateForRequest]);

  const handleApprove = useCallback(() => {
    if (!pendingOperations || !onApplyEdits) return;
    onApplyEdits(pendingOperations);
    setPendingOperations(null);
    setPendingExplanation(null);
  }, [onApplyEdits, pendingOperations]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-[90px] right-5 w-[380px] max-h-[70vh] bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl flex flex-col overflow-hidden z-40">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700">
        <h3 className="text-sm font-medium text-neutral-200">Flowy</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
            aria-label="Close Flowy panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
        onWheelCapture={(e) => e.stopPropagation()}
        style={{ touchAction: "pan-y" }}
      >
        {errorMessage && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-200">
            {errorMessage}
            <button
              className="block text-xs text-red-300 hover:text-red-100 underline mt-2"
              onClick={() => setErrorMessage(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        )}

        {chatMessages.length === 0 && !errorMessage && (
          <div className="text-center text-neutral-500 text-sm py-8">
            <p>Ask Flowy to modify your workflow.</p>
            <p className="text-xs mt-2">Example: “Make a video from this image with a cinematic style.”</p>
          </div>
        )}

        {chatMessages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-neutral-700 text-neutral-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          </div>
        ))}

        {pendingOperations && (
          <div className="mt-2 bg-neutral-700/50 border border-neutral-600 rounded-lg p-3">
            <div className="text-xs text-neutral-300">
              Pending edits (assist mode): {pendingOperations.length} operation{pendingOperations.length !== 1 ? "s" : ""}
            </div>
            {pendingExplanation && (
              <div className="text-xs text-neutral-400 mt-1 whitespace-pre-wrap">{pendingExplanation}</div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={handleApprove}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              >
                Apply edits
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-neutral-700 p-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handlePlan();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message Flowy..."
            className="flex-1 bg-neutral-700 border border-neutral-600 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            disabled={isPlanning}
          />
          <button
            type="submit"
            disabled={isPlanning || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

