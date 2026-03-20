"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditOperation } from "@/lib/chat/editOperations";
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  Copy,
  LayoutGrid,
  Loader2,
  Minus,
  MousePointerClick,
  Paperclip,
  PanelRightOpen,
  Settings2,
  SquarePen,
  SquarePlus,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import {
  createEmptyFlowySession,
  loadCustomInstructions,
  loadDockedPreference,
  loadFlowyAgentMode,
  loadFlowyPanelSessions,
  saveCustomInstructions,
  saveDockedPreference,
  saveFlowyAgentMode,
  saveFlowyPanelSessions,
  type FlowyAgentMode,
  type StoredChatSession,
} from "@/lib/flowy/flowyPanelStorage";

type WorkflowState = {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    groupId?: string;
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }>;
  /** Optional canvas groups (aligned with workflow file / store) */
  groups?: Record<
    string,
    {
      name: string;
      color?: string;
      locked?: boolean;
      position?: { x: number; y: number };
      size?: { width: number; height: number };
    }
  >;
};

type FlowyPlanResponse = {
  assistantText: string;
  operations: EditOperation[];
  requiresApproval?: boolean;
  approvalReason?: string;
  executeNodeIds?: string[];
  runApprovalRequired?: boolean;
  /** `chat` = conversational reply only (no canvas ops). `plan` = edit operations (may be empty). */
  mode?: "chat" | "plan";
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMsg[];
  createdAt: number;
};

type ChatImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
};

/** Markdown in Flowy chat (user + assistant): bold, lists, code, links — no raw `**`. */
const FLOWY_CHAT_MD_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="my-1.5 first:mt-0 last:mb-0 leading-[1.6]">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-95">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-0.5 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-0.5 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-2.5 text-sm font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-sm font-medium first:mt-0">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-white/20 pl-3 text-neutral-300">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-white/10" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-3 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-white/12 px-1 py-px font-mono text-[0.9em] text-neutral-100"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function FlowyAgentPanel({
  isOpen,
  onClose,
  onApplyEdits,
  onRunNodeIds,
  workflowState,
  selectedNodeIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApplyEdits?: (operations: EditOperation[]) => { applied: number; skipped: string[] };
  onRunNodeIds?: (nodeIds: string[]) => void | Promise<void>;
  workflowState?: WorkflowState;
  selectedNodeIds?: string[];
}) {
  const createSession = useCallback((title = "New Chat"): ChatSession => {
    const base = createEmptyFlowySession();
    return { ...base, title };
  }, []);

  const seed = useMemo(() => createEmptyFlowySession(), []);

  const [sessions, setSessions] = useState<ChatSession[]>(() => [{ ...seed, title: "New Chat" }]);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => seed.id);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  const updateSessionMessages = useCallback((sessionId: string, updater: (prev: ChatMsg[]) => ChatMsg[]) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        const nextMsgs = updater(s.messages);
        const firstUser = nextMsgs.find((m) => m.role === "user")?.text?.trim();
        const title = firstUser
          ? firstUser.replace(/\s+/g, " ").slice(0, 42) + (firstUser.length > 42 ? "..." : "")
          : "New Chat";
        return { ...s, messages: nextMsgs, title };
      })
    );
  }, []);

  /** Single source of truth: always read the active thread from `sessions` (avoids stale split state when switching chats mid-request). */
  const chatMessages = useMemo(
    () => sessions.find((s) => s.id === activeSessionId)?.messages ?? [],
    [sessions, activeSessionId]
  );

  const [flowyAgentMode, setFlowyAgentMode] = useState<FlowyAgentMode>(() => loadFlowyAgentMode());
  const flowyAgentModeRef = useRef(flowyAgentMode);
  flowyAgentModeRef.current = flowyAgentMode;
  const footerInputId = useId();

  const [isDocked, setIsDocked] = useState<boolean>(() => loadDockedPreference());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [customInstructions, setCustomInstructions] = useState<string>(() => loadCustomInstructions());
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const [storageReady, setStorageReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pendingOperations, setPendingOperations] = useState<EditOperation[] | null>(null);
  const [pendingExplanation, setPendingExplanation] = useState<string | null>(null);
  const [pendingExecuteNodeIds, setPendingExecuteNodeIds] = useState<string[] | null>(null);
  const [pendingRunApprovalRequired, setPendingRunApprovalRequired] = useState<boolean>(true);
  const [executionIndex, setExecutionIndex] = useState<number>(0);
  const [applyMode, setApplyMode] = useState<"manual" | "auto">("manual");
  const [autoContinue, setAutoContinue] = useState<boolean>(false);
  const [mentionedNodeIds, setMentionedNodeIds] = useState<string[]>([]);
  const [isNodePickerOpen, setIsNodePickerOpen] = useState(false);
  const [nodePickerQuery, setNodePickerQuery] = useState("");
  const [imageAttachments, setImageAttachments] = useState<ChatImageAttachment[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [plannerTimelineOpen, setPlannerTimelineOpen] = useState(true);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: true,
  });
  const [isExecutingStep, setIsExecutingStep] = useState(false);
  const autoRunIdRef = useRef(0);
  const autoRunCompletedRef = useRef(false);
  const autoApplyStartedForOpsRef = useRef<EditOperation[] | null>(null);
  const activePlanAbortRef = useRef<AbortController | null>(null);
  const lastGoalRef = useRef<string | null>(null);
  const autoContinueCountRef = useRef<number>(0);

  // Hydrate sessions from localStorage once on client (after SSR default seed).
  useEffect(() => {
    const loaded = loadFlowyPanelSessions();
    if (loaded) {
      setSessions(loaded.sessions as ChatSession[]);
      setActiveSessionId(loaded.activeId);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    // Ensure there is always an active session (handles initial render safely).
    if (!sessions.some((s) => s.id === activeSessionId)) {
      const fallback = sessions[0];
      if (fallback) setActiveSessionId(fallback.id);
    }
  }, [activeSessionId, sessions]);

  // Persist chat sessions + active id
  useEffect(() => {
    if (!storageReady || sessions.length === 0 || !activeSessionId) return;
    saveFlowyPanelSessions(sessions as StoredChatSession[], activeSessionId);
  }, [storageReady, sessions, activeSessionId]);

  useEffect(() => {
    saveCustomInstructions(customInstructions);
  }, [customInstructions]);

  useEffect(() => {
    saveDockedPreference(isDocked);
  }, [isDocked]);

  useEffect(() => {
    saveFlowyAgentMode(flowyAgentMode);
  }, [flowyAgentMode]);

  useEffect(() => {
    if (!historyMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (historyButtonRef.current?.contains(t) || historyMenuRef.current?.contains(t)) return;
      setHistoryMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [historyMenuOpen]);

  const stateForRequest = useMemo(() => {
    // Ensure we always send a consistent shape.
    if (!workflowState) return undefined;
    return {
      nodes: workflowState.nodes,
      edges: workflowState.edges,
      ...(workflowState.groups && Object.keys(workflowState.groups).length > 0
        ? { groups: workflowState.groups }
        : {}),
    };
  }, [workflowState]);

  const contextNodeIds = useMemo(() => {
    const selected = selectedNodeIds ?? [];
    const mentioned = mentionedNodeIds ?? [];
    return Array.from(new Set([...selected, ...mentioned]));
  }, [selectedNodeIds, mentionedNodeIds]);

  const contextNodeChips = useMemo(() => {
    if (!workflowState || contextNodeIds.length === 0) return [];
    const selectedSet = new Set(selectedNodeIds ?? []);
    const mentionedSet = new Set(mentionedNodeIds ?? []);
    return contextNodeIds
      .map((id) => {
        const node = workflowState.nodes.find((n) => n.id === id);
        if (!node) return null;
        const customTitle = (node.data as any)?.customTitle;
        const label =
          typeof customTitle === "string" && customTitle.trim().length > 0
            ? customTitle
            : node.type;
        return {
          id,
          label,
          type: node.type,
          source: selectedSet.has(id) ? "selected" : mentionedSet.has(id) ? "mentioned" : "context",
        };
      })
      .filter(Boolean) as Array<{ id: string; label: string; type: string; source: "selected" | "mentioned" | "context" }>;
  }, [contextNodeIds, mentionedNodeIds, selectedNodeIds, workflowState]);

  const nodeTypeById = useMemo(() => {
    const m = new Map<string, string>();
    if (!workflowState) return m;
    for (const n of workflowState.nodes) {
      m.set(n.id, n.type);
    }
    return m;
  }, [workflowState]);

  const nodePickerItems = useMemo(() => {
    if (!workflowState) return [];
    const q = nodePickerQuery.trim().toLowerCase();
    return workflowState.nodes
      .filter((n) => {
        if (!q) return true;
        const customTitle = (n.data as any)?.customTitle;
        const label = typeof customTitle === "string" ? customTitle : n.type;
        return label.toLowerCase().includes(q);
      })
      .sort((a, b) => a.type.localeCompare(b.type));
  }, [nodePickerQuery, workflowState]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const requestPlan = useCallback(
    async (message: string, opts?: { suppressUserEcho?: boolean }) => {
      const trimmed = message.trim();
      if (!trimmed || isPlanning) return;

      // Bind this request to the chat that was active when it started (survives session switches while the plan API is in flight).
      const sessionId = activeSessionIdRef.current;
      const agentModeAtStart = flowyAgentModeRef.current;

      setErrorMessage(null);
      setIsPlanning(true);
      activePlanAbortRef.current?.abort();
      const abortController = new AbortController();
      activePlanAbortRef.current = abortController;

      if (!opts?.suppressUserEcho) {
        const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: trimmed };
        updateSessionMessages(sessionId, (prev) => [...prev, userMsg]);
      }

      try {
        const res = await fetch("/api/flowy/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            message: customInstructions.trim().length
              ? `Custom instructions:\n${customInstructions.trim()}\n\nUser request:\n${trimmed}`
              : trimmed,
            workflowState: stateForRequest,
            selectedNodeIds: contextNodeIds,
            agentMode: agentModeAtStart,
            attachments: imageAttachments,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || `Plan failed (${res.status})`);
        }

        const data = (await res.json()) as ({ ok: boolean; error?: string } & FlowyPlanResponse) & {
          debugLastText?: string;
        };
        if (!data.ok) {
          const debugSnippet =
            typeof data.debugLastText === "string" && data.debugLastText.trim().length
              ? `\n\nLLM output (truncated):\n${data.debugLastText.slice(0, 800)}`
              : "";
          throw new Error((data.error || "Plan failed") + debugSnippet);
        }

        const assistantText = data.assistantText ?? "";
        let ops = data.operations ?? [];
        let mode: "chat" | "plan" = data.mode === "chat" ? "chat" : "plan";
        if (agentModeAtStart === "plan") {
          mode = "chat";
          ops = [];
        }

        if (mode === "chat") {
          setPendingOperations(null);
          setPendingExplanation(null);
          setPendingExecuteNodeIds(null);
          setPendingRunApprovalRequired(true);
          setExecutionIndex(0);
          autoRunCompletedRef.current = true;
        } else {
          setPendingOperations(ops);
          setPendingExplanation(assistantText);
          setExecutionIndex(0);
          setPendingExecuteNodeIds(data.executeNodeIds ?? null);
          setPendingRunApprovalRequired(data.runApprovalRequired ?? true);
          autoRunCompletedRef.current = false;
        }
        setCursor((c) => ({ ...c, visible: true }));
        updateSessionMessages(sessionId, (prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: assistantText },
        ]);

        scrollToBottom();
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setErrorMessage(e instanceof Error ? e.message : "Failed to plan edits");
      } finally {
        if (activePlanAbortRef.current === abortController) {
          activePlanAbortRef.current = null;
        }
        setIsPlanning(false);
      }
    },
    [contextNodeIds, customInstructions, imageAttachments, isPlanning, scrollToBottom, stateForRequest, updateSessionMessages]
  );

  const handlePlan = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    lastGoalRef.current = trimmed;
    autoContinueCountRef.current = 0;
    setInput("");
    await requestPlan(trimmed);
    setImageAttachments([]);
  }, [input, requestPlan]);

  const handleImageFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const selected = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (selected.length === 0) return;

      const next = await Promise.all(
        selected.slice(0, 6).map(
          (file) =>
            new Promise<ChatImageAttachment>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result || "");
                resolve({
                  id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  name: file.name,
                  mimeType: file.type || "image/png",
                  dataUrl,
                });
              };
              reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
              reader.readAsDataURL(file);
            })
        )
      );
      setImageAttachments((prev) => [...prev, ...next].slice(0, 6));
      if (imageInputRef.current) imageInputRef.current.value = "";
    },
    []
  );

  const handleApprove = useCallback(() => {
    // Keep for backward compatibility if a parent triggers bulk apply.
    if (!pendingOperations || !onApplyEdits) return;
    onApplyEdits(pendingOperations);
    setPendingOperations(null);
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    autoRunCompletedRef.current = true;
    setExecutionIndex(0);
  }, [onApplyEdits, pendingOperations]);

  const stopAutoRun = useCallback(() => {
    // Increment run id so any in-flight auto loop will stop.
    autoRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (flowyAgentMode === "auto") {
      setApplyMode("auto");
      setAutoContinue(true);
    } else if (flowyAgentMode === "assist") {
      // Assist now auto-applies canvas edits; only run execution needs approval.
      setApplyMode("auto");
      setAutoContinue(false);
    } else {
      stopAutoRun();
      setApplyMode("manual");
      if (flowyAgentMode === "plan") {
        setAutoContinue(false);
      }
    }
  }, [flowyAgentMode, stopAutoRun]);

  useEffect(() => {
    if (isOpen) return;
    activePlanAbortRef.current?.abort();
  }, [isOpen]);

  const sleep = useCallback((ms: number) => new Promise((r) => setTimeout(r, ms)), []);

  const getFallbackCursorScreen = useCallback((): { x: number; y: number } => {
    return {
      x: Math.max(120, Math.round(window.innerWidth * 0.62)),
      y: Math.max(120, Math.round(window.innerHeight * 0.42)),
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setCursor((prev) => {
      const needsFallback = prev.x === 0 && prev.y === 0;
      const fallback = needsFallback ? getFallbackCursorScreen() : null;
      return {
        x: fallback ? fallback.x : prev.x,
        y: fallback ? fallback.y : prev.y,
        visible: true,
      };
    });
  }, [getFallbackCursorScreen, isOpen]);

  const getNodeCenterScreen = useCallback((nodeId: string): { x: number; y: number } | null => {
    try {
      const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`) as HTMLElement | null;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    } catch {
      return null;
    }
  }, []);

  const describeOperation = useCallback(
    (op: EditOperation): string => {
    switch (op.type) {
      case "addNode":
        return `Add ${op.nodeType}`;
      case "removeNode":
        return `Remove node (${op.nodeId})`;
      case "updateNode":
        if (nodeTypeById.get(op.nodeId) === "prompt") {
          const prompt = (op.data as any)?.prompt;
          if (typeof prompt === "string") {
            const cleaned = prompt.replace(/\s+/g, " ").trim();
            const preview = cleaned.slice(0, 42);
            return `Type prompt: "${preview}${cleaned.length > 42 ? "..." : ""}"`;
          }
        }
        return `Update node (${op.nodeId})`;
      case "addEdge":
        return `Connect ${op.source} -> ${op.target}`;
      case "removeEdge":
        return `Remove connection (${op.edgeId})`;
      case "moveNode":
        return `Move node (${op.nodeId})`;
      case "createGroup":
        return `Create group (${op.nodeIds.length} nodes)`;
      case "deleteGroup":
        return `Delete group (${op.groupId})`;
      case "updateGroup":
        return `Update group (${op.groupId})`;
      case "setNodeGroup":
        return `Set group for node (${op.nodeId})`;
    }
    return "Apply operation";
    },
    [nodeTypeById]
  );

  const applyOperationAtIndex = useCallback(
    async (index: number) => {
      if (!pendingOperations || !onApplyEdits) return;
      if (index < 0 || index >= pendingOperations.length) return;

      const op = pendingOperations[index];
      setIsExecutingStep(true);

      try {
        // For addNode we need to apply first, because the node doesn't exist yet.
        if (op.type !== "addNode") {
          if (op.type === "removeNode" || op.type === "updateNode") {
            const center = getNodeCenterScreen(op.nodeId);
            const pos = center ?? getFallbackCursorScreen();
            setCursor({ x: pos.x, y: pos.y, visible: true });
            await sleep(140);
          } else if (op.type === "addEdge") {
            // Move cursor to the source first (then we'll move it to target after the edge is created).
            const center = getNodeCenterScreen(op.source);
            const pos = center ?? getFallbackCursorScreen();
            setCursor({ x: pos.x, y: pos.y, visible: true });
            await sleep(140);
          }
        }

        if (op.type === "addNode") {
          onApplyEdits([op]);
          await sleep(50);

          if (op.nodeId) {
            const center = getNodeCenterScreen(op.nodeId);
            const pos = center ?? getFallbackCursorScreen();
            setCursor({ x: pos.x, y: pos.y, visible: true });
            // brief settle time so the cursor motion feels "live"
            await sleep(180);
          }
        } else {
          if (op.type === "updateNode" && nodeTypeById.get(op.nodeId) === "prompt") {
            const fullPrompt = (op.data as any)?.prompt;
            if (typeof fullPrompt === "string" && fullPrompt.trim().length > 0) {
              const baseData = { ...(op.data as any) };
              const total = fullPrompt.length;
              const steps = Math.max(8, Math.min(28, Math.ceil(total / 45)));
              const stepSize = Math.max(4, Math.ceil(total / steps));

              // Apply an initial empty prompt quickly so React Flow renders the "cursor typing" target.
              const initialOp: any = {
                ...op,
                data: { ...baseData, prompt: "" },
                __flowyTypingStart: true,
              };
              onApplyEdits([initialOp]);
              await sleep(25);

              for (let i = stepSize; i < total + 1; i += stepSize) {
                const partial = fullPrompt.slice(0, Math.min(i, total));
                const chunkOp: any = {
                  ...op,
                  data: { ...baseData, prompt: partial },
                  __flowyTypingChunk: true,
                };
                onApplyEdits([chunkOp]);
                await sleep(18);
              }

              // Ensure the final prompt is exactly correct.
              const finalOp: any = {
                ...op,
                data: { ...baseData, prompt: fullPrompt },
                __flowyTypingChunk: true,
              };
              onApplyEdits([finalOp]);
              await sleep(30);
            } else {
              // No prompt text to animate; apply directly.
              onApplyEdits([op]);
              await sleep(50);
            }
          } else {
            onApplyEdits([op]);
            await sleep(50);
          }

          const targetNodeId = op.type === "removeNode" || op.type === "updateNode" ? op.nodeId : undefined;
          if (targetNodeId) {
            const center = getNodeCenterScreen(targetNodeId);
            const pos = center ?? getFallbackCursorScreen();
            setCursor({ x: pos.x, y: pos.y, visible: true });
            await sleep(140);
          } else if (op.type === "addEdge") {
            const t = getNodeCenterScreen(op.target);
            const pos = t ?? getFallbackCursorScreen();
            setCursor({ x: pos.x, y: pos.y, visible: true });
            await sleep(160);
          }
        }

        setExecutionIndex(index + 1);
      } finally {
        setIsExecutingStep(false);
      }
    },
    [getFallbackCursorScreen, getNodeCenterScreen, nodeTypeById, onApplyEdits, pendingOperations, sleep]
  );

  const handleApproveStep = useCallback(async () => {
    await applyOperationAtIndex(executionIndex);
  }, [applyOperationAtIndex, executionIndex]);

  const resetExecution = useCallback(() => {
    setExecutionIndex(0);
    setIsExecutingStep(false);
    setCursor((c) => ({ ...c, visible: true }));
  }, []);

  const dismissPendingPlan = useCallback(() => {
    stopAutoRun();
    autoApplyStartedForOpsRef.current = null;
    setPendingOperations(null);
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    resetExecution();
    autoRunCompletedRef.current = true;
  }, [resetExecution, stopAutoRun]);

  useEffect(() => {
    if (!isOpen || !pendingOperations) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      dismissPendingPlan();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissPendingPlan, isOpen, pendingOperations]);

  useEffect(() => {
    if (!pendingOperations) return;
    setPlannerTimelineOpen(true);
  }, [pendingOperations]);

  useEffect(() => {
    if (!pendingOperations) return;
    if (executionIndex < pendingOperations.length) return;
    if (!pendingExecuteNodeIds || pendingExecuteNodeIds.length === 0) return;
    if (!onRunNodeIds) return;
    // Only Auto mode can execute workflows by itself.
    if (flowyAgentMode !== "auto") return;
    if (autoRunCompletedRef.current) return;
    autoRunCompletedRef.current = true;
    // Auto-run after all edits applied
    (async () => {
      setIsRunning(true);
      try {
        await onRunNodeIds(pendingExecuteNodeIds);
      } finally {
        setIsRunning(false);
      }

      // Optional: continue the agent loop by planning the next minimal stage
      // using the updated workflowState (now containing status/error/output fields).
      if (!autoContinue) return;
      const goal = lastGoalRef.current;
      if (!goal) return;
      if (autoContinueCountRef.current >= 3) return;
      autoContinueCountRef.current += 1;

      await requestPlan(
        `Continue the workflow toward the original user goal: "${goal}". ` +
          `Inspect the current workflow execution results (node status/error/output fields) and plan the next minimal stage. ` +
          `If the goal is already complete, return empty operations and explain completion.`,
        { suppressUserEcho: true }
      );
    })();
  }, [autoContinue, executionIndex, flowyAgentMode, onRunNodeIds, pendingExecuteNodeIds, pendingOperations, requestPlan]);

  // Auto-apply mode: run through all pending operations sequentially.
  useEffect(() => {
    if (!isOpen) return;
    if (applyMode !== "auto") return;
    if (!pendingOperations || !onApplyEdits) return;
    if (executionIndex !== 0) return;
    // Guard against starting duplicate auto-apply loops for the same plan.
    // This can happen when dependencies update before executionIndex increments.
    if (autoApplyStartedForOpsRef.current === pendingOperations) return;
    autoApplyStartedForOpsRef.current = pendingOperations;

    const runId = autoRunIdRef.current + 1;
    autoRunIdRef.current = runId;

    (async () => {
      for (let i = 0; i < pendingOperations.length; i++) {
        if (autoRunIdRef.current !== runId) return;
        await applyOperationAtIndex(i);
      }
    })();
    // No cleanup needed beyond runId checks.
  }, [applyMode, executionIndex, isOpen, onApplyEdits, pendingOperations, applyOperationAtIndex]);

  useEffect(() => {
    if (!pendingOperations) {
      autoApplyStartedForOpsRef.current = null;
    }
  }, [pendingOperations]);

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );
  const activeSession = useMemo(
    () => sortedSessions.find((s) => s.id === activeSessionId) ?? sortedSessions[0],
    [sortedSessions, activeSessionId]
  );

  const switchToSession = useCallback(
    (id: string) => {
      stopAutoRun();
      setActiveSessionId(id);
      setPendingOperations(null);
      setPendingExplanation(null);
      setPendingExecuteNodeIds(null);
      resetExecution();
      setErrorMessage(null);
      setHistoryMenuOpen(false);
    },
    [resetExecution, stopAutoRun]
  );

  const handleNewChat = useCallback(() => {
    const next = createSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setHistoryMenuOpen(false);
    setInput("");
    setPendingOperations(null);
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    setErrorMessage(null);
    setExecutionIndex(0);
    autoRunCompletedRef.current = true;
    autoContinueCountRef.current = 0;
  }, [createSession]);

  const modeSliderIndex = flowyAgentMode === "assist" ? 0 : flowyAgentMode === "auto" ? 1 : 2;
  const chatInputPlaceholder =
    flowyAgentMode === "plan"
      ? "Brainstorm workflows, prompts, and tradeoffs. Use @ to mention nodes."
      : flowyAgentMode === "auto"
        ? "Describe the outcome — Flowy can build and run. Use @ to mention nodes."
        : "Flowy auto-builds the canvas; approve before running nodes. Use @ to mention nodes.";

  if (!isOpen) return null;

  const footerStatusText = [
    isPlanning ? "Flowy is planning a response." : "",
    pendingOperations ? "Canvas changes waiting for your review." : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Flowy AI chat"
      data-testid="flowy-sidebar"
      className={`fixed z-40 flex flex-col overflow-hidden transition-all duration-200 ${
        isDocked
          ? "right-0 bottom-0 top-0 w-[480px] rounded-none border-l border-white/10 bg-neutral-900/90 backdrop-blur-xl shadow-xl"
          : "bottom-16 right-4 h-[min(576px,calc(100vh-136px))] max-h-[min(576px,calc(100vh-136px))] w-[480px] rounded-[24px] border border-white/[0.11] bg-[rgb(25,25,25)]/90 shadow-[0_8px_10px_-6px_rgba(0,0,0,0.1),0_20px_25px_-5px_rgba(0,0,0,0.1)] backdrop-blur-[12px]"
      }`}
    >
      <div className="relative z-10 flex w-full shrink-0 items-center justify-between p-2 border-b border-white/10">
        <div className="group relative z-[100] flex min-w-0 items-center gap-1">
          <button
            ref={historyButtonRef}
            type="button"
            aria-label="Chat history"
            aria-haspopup="listbox"
            aria-expanded={historyMenuOpen}
            onClick={() => setHistoryMenuOpen((o) => !o)}
            className="flex h-8 max-w-[200px] items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-sm leading-none tracking-tight text-neutral-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
          >
            <span className="max-w-[160px] truncate whitespace-nowrap">
              {activeSession?.title ?? "New Chat"}
            </span>
            <ChevronDown
              className={`size-3.5 shrink-0 text-neutral-400 transition-transform duration-200 ${
                historyMenuOpen ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
          {historyMenuOpen && (
            <div
              ref={historyMenuRef}
              role="listbox"
              aria-label="Previous chats"
              className="absolute left-0 top-[calc(100%+6px)] z-[120] w-[min(100vw-2rem,280px)] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 py-1 shadow-xl backdrop-blur-xl"
            >
              {sortedSessions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-neutral-500">No chats yet</div>
              ) : (
                sortedSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={s.id === activeSessionId}
                    onClick={() => switchToSession(s.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      s.id === activeSessionId
                        ? "bg-white/10 text-white"
                        : "text-neutral-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{s.title}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-center" role="toolbar" aria-label="Sidebar controls">
          <button
            type="button"
            aria-label="Custom prompt instructions"
            className="rounded-xl p-2 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings2 className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Start new chat"
            className="rounded-xl p-2 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            onClick={handleNewChat}
          >
            <SquarePen className="size-4" />
          </button>
          <button
            type="button"
            aria-label={isDocked ? "Undock panel" : "Dock panel"}
            className="rounded-xl p-2 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => setIsDocked((v) => !v)}
          >
            <PanelRightOpen className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Minimize chat"
          >
            <Minus className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative -mb-8 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div
          className="flowy-chat-scrollbar flex min-h-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden pb-16"
          onWheelCapture={(e) => e.stopPropagation()}
          style={{ touchAction: "pan-y", overflowAnchor: "none" as const }}
        >
          <div className="flex flex-col gap-6 py-4">
        {errorMessage && (
          <div className="mx-4 rounded-xl border border-red-800/60 bg-red-950/40 p-3 text-sm text-red-200">
            {errorMessage}
            <button
              className="mt-2 block text-xs text-red-300 underline hover:text-red-100"
              onClick={() => setErrorMessage(null)}
              type="button"
            >
              Dismiss
            </button>
          </div>
        )}

        {chatMessages.length === 0 && !errorMessage && (
          <div className="px-4 text-center text-sm text-neutral-500 py-8">
            {flowyAgentMode === "plan" ? (
              <>
                <p className="text-neutral-400">Chat mode — advice only (no canvas edits).</p>
                <p className="text-xs mt-2">
                  Example: “Give me a 3-node workflow for a product ad, with prompts to paste.”
                </p>
              </>
            ) : flowyAgentMode === "auto" ? (
              <>
                <p className="text-neutral-400">Auto mode — Flowy can add nodes, connect, and run.</p>
                <p className="text-xs mt-2">Example: “Turn this prompt into a video workflow with 3 variations.”</p>
              </>
            ) : (
              <>
                <p className="text-neutral-400">Assist mode — Flowy auto-applies canvas edits, asks before run.</p>
                <p className="text-xs mt-2">Example: “Add three nanoBanana nodes from this image, then I’ll pick one.”</p>
              </>
            )}
          </div>
        )}

        {chatMessages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="group/message flex select-text flex-col items-end gap-2.5 px-4 py-1">
              <div className="max-w-[85%] rounded-2xl bg-white/[0.1] px-4 py-2 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-sm">
                <div className="flowy-chat-md text-sm leading-[1.5]">
                  <ReactMarkdown components={FLOWY_CHAT_MD_COMPONENTS}>{m.text}</ReactMarkdown>
                </div>
              </div>
              <div className="flex items-center gap-1 pr-1 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100">
                <button
                  type="button"
                  aria-label="Copy message"
                  className="flex size-6 items-center justify-center rounded-lg text-neutral-400 outline-none transition-colors hover:bg-white/10 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-white/20"
                  onClick={() => void navigator.clipboard?.writeText(m.text)}
                >
                  <Copy className="size-3.5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div key={m.id} className="group/message flex w-full select-text flex-col gap-1 py-1">
              <div className="px-6">
                <div className="text-sm leading-[1.4] tracking-[-0.14px] text-neutral-100">
                  <div className="flowy-chat-md whitespace-normal break-words">
                    <ReactMarkdown components={FLOWY_CHAT_MD_COMPONENTS}>{m.text}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {isPlanning && (
          <div className="group/message flex w-full select-text flex-col gap-1 py-1">
            <div className="px-6">
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-neutral-300">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                <span>Flowy is thinking...</span>
              </div>
            </div>
          </div>
        )}

        {pendingOperations && (
          <div className="group/message flex w-full select-text flex-col gap-4 py-1">
            <div className="px-5">
              <div className="flex flex-col">
                <button
                  type="button"
                  className="group/head flex w-fit cursor-pointer select-none items-center gap-1 rounded-lg py-0.5 text-left transition-colors hover:opacity-90"
                  onClick={() => setPlannerTimelineOpen((o) => !o)}
                  aria-expanded={plannerTimelineOpen}
                >
                  <div className="flex size-6 shrink-0 items-center justify-center text-neutral-200">
                    <SquarePlus className="size-3.5" strokeWidth={2} aria-hidden />
                  </div>
                  <span className="text-xs font-medium leading-[1.4] tracking-[-0.12px] flowy-shimmer-text">
                    {executionIndex < pendingOperations.length
                      ? "Applying to canvas…"
                      : pendingExecuteNodeIds &&
                          pendingExecuteNodeIds.length > 0 &&
                          pendingRunApprovalRequired &&
                          flowyAgentMode === "assist"
                        ? "Waiting for run approval"
                        : "Plan applied"}
                  </span>
                  <span
                    className={`inline-flex shrink-0 text-neutral-300 transition-transform duration-200 ${
                      plannerTimelineOpen ? "rotate-90" : ""
                    }`}
                  >
                    <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden />
                  </span>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.19,1,0.22,1)]"
                  style={{ gridTemplateRows: plannerTimelineOpen ? "1fr" : "0fr" }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="select-none pt-1.5">
                      <div className="mb-3 flex flex-wrap items-center gap-2 px-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-neutral-500">Apply</span>
                        <span className="rounded-lg px-2 py-0.5 text-[11px] font-medium bg-emerald-500/15 text-emerald-300">
                          Auto
                        </span>
                        <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-500 select-none">
                          <input
                            type="checkbox"
                            className="accent-emerald-500"
                            checked={autoContinue}
                            onChange={(e) => setAutoContinue(e.target.checked)}
                            disabled={flowyAgentMode !== "auto" || isPlanning || isExecutingStep || isRunning}
                          />
                          Continue
                        </label>
                      </div>
                      {pendingOperations.map((op, idx) => {
                        const status =
                          idx < executionIndex ? "done" : idx === executionIndex ? "next" : "pending";
                        const lineTop = idx === 0 ? "min-h-1.5 w-px" : "min-h-1.5 w-px flex-1 bg-white/15";
                        const lineBot =
                          idx === pendingOperations.length - 1 ? "min-h-1.5 w-px" : "min-h-1.5 w-px flex-1 bg-white/15";
                        const labelClass =
                          status === "next"
                            ? "flowy-shimmer-text text-xs leading-tight"
                            : status === "done"
                              ? "text-xs leading-tight text-neutral-500 line-through decoration-neutral-600"
                              : "text-xs leading-tight text-neutral-500";
                        return (
                          <div key={idx} className="flex" aria-current={status === "next" ? "step" : undefined}>
                            <div className="flex w-6 shrink-0 flex-col items-center">
                              <div className={lineTop} />
                              <div className="flex size-6 shrink-0 items-center justify-center text-neutral-400">
                                <SquarePlus className="size-3.5" strokeWidth={2} aria-hidden />
                              </div>
                              <div className={lineBot} />
                            </div>
                            <div className="min-w-0 flex-1 self-center py-2 pl-1">
                              <span className={labelClass}>{describeOperation(op)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div
        data-testid="flowy-sidebar-footer"
        className="relative z-10 mt-auto w-full shrink-0 select-text border-t border-white/10"
        style={{ background: "#171717" }}
      >
        <div
          className="pointer-events-none absolute bottom-full left-0 right-0 h-12 bg-gradient-to-b from-transparent to-[#171717]"
          aria-hidden
        />
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {footerStatusText}
        </div>
        <div className="relative w-full">
          {(pendingOperations || isPlanning) && (
            <div
              className="pointer-events-none absolute inset-x-2 bottom-full top-[-3rem] rounded-t-[1.25rem] border border-b-0 border-white/10 opacity-80 transition-opacity duration-300"
              aria-hidden
            />
          )}
          {pendingOperations && (
            <div className="relative z-10 overflow-hidden px-3">
              <div className="pointer-events-auto flex w-full items-center justify-between gap-2 py-2 pl-1 pr-0.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="relative flex size-4 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-sm">
                    <LayoutGrid className="size-2.5 text-neutral-300" strokeWidth={2} aria-hidden />
                  </div>
                  <p className="truncate text-xs text-neutral-400">
                    {executionIndex < pendingOperations.length
                      ? applyMode === "auto"
                        ? "Applying edits to the canvas…"
                        : "How does this look? Apply each step when ready."
                      : pendingExecuteNodeIds &&
                          pendingExecuteNodeIds.length > 0 &&
                          pendingRunApprovalRequired &&
                          flowyAgentMode === "assist"
                        ? "Run the connected nodes next?"
                        : "All proposed edits are applied."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Dismiss proposed changes"
                    className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full py-1.5 pl-2 pr-1 text-[11px] text-neutral-400 transition-colors hover:bg-white/10"
                    onClick={dismissPendingPlan}
                  >
                    <span className="leading-none">Cancel</span>
                    <span className="rounded px-1 font-mono text-[10px] text-neutral-500">Esc</span>
                  </button>
                  {executionIndex < pendingOperations.length ? (
                    <>
                      {(isExecutingStep || isRunning) && (
                        <button
                          type="button"
                          onClick={() => stopAutoRun()}
                          className="flex h-7 shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-[11px] font-medium text-neutral-200 hover:bg-white/10"
                        >
                          Stop
                        </button>
                      )}
                    </>
                  ) : pendingExecuteNodeIds &&
                    pendingExecuteNodeIds.length > 0 &&
                    pendingRunApprovalRequired &&
                    flowyAgentMode === "assist" &&
                    onRunNodeIds ? (
                    <button
                      type="button"
                      onClick={async () => {
                        if (isRunning) return;
                        setIsRunning(true);
                        try {
                          await onRunNodeIds(pendingExecuteNodeIds);
                        } finally {
                          setIsRunning(false);
                        }
                      }}
                      disabled={isRunning || isPlanning || isExecutingStep}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.14] px-2.5 text-[11px] font-medium text-emerald-300 backdrop-blur-md transition-[filter] hover:brightness-125"
                    >
                      {isRunning ? "Running..." : "Run"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={dismissPendingPlan}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.14] px-2.5 text-[11px] font-medium text-emerald-300 backdrop-blur-md transition-[filter] hover:brightness-125"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="relative z-10 w-full px-2 pb-2 pt-0">
          <form
            className="relative w-full overflow-visible rounded-[1.25rem] border border-white/10 bg-[#222222] pb-1.5 pl-3 pr-1.5 pt-3 shadow-inner backdrop-blur-[12px] focus-within:border-white/20"
            onSubmit={(e) => {
              e.preventDefault();
              void handlePlan();
            }}
          >
            <div className="flex w-full flex-col gap-2.5">
              {isPlanning && (
                <div className="-mt-1 flex items-center gap-2 px-1 text-[11px] text-neutral-400">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Flowy is thinking...</span>
                </div>
              )}
              {contextNodeChips.length > 0 && (
                <div
                  role="list"
                  aria-label="Selected nodes"
                  className="-ml-3 -mr-1.5 -mt-3 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <div className="flex w-max gap-1.5 pb-1 pl-1.5 pr-1 pt-1.5">
                    {contextNodeChips.map((chip) => {
                      const isSelected = chip.source === "selected";
                      return (
                        <span
                          key={chip.id}
                          role="listitem"
                          className="group/chip inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] py-[3px] pl-1 pr-2"
                          title={`${chip.label} (${chip.type})`}
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="max-w-[120px] truncate text-[11px] font-medium text-neutral-100">
                              {chip.label}
                            </span>
                            <span className="text-left text-[10px] text-neutral-400">
                              {chip.type}
                            </span>
                          </span>
                          {!isSelected && (
                            <button
                              type="button"
                              className="hidden size-4 items-center justify-center rounded-full border border-white/10 bg-[#222] text-neutral-300 transition-colors hover:text-white group-hover/chip:flex"
                              aria-label={`Remove ${chip.label}`}
                              onClick={() =>
                                setMentionedNodeIds((prev) => prev.filter((id) => id !== chip.id))
                              }
                            >
                              x
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {imageAttachments.length > 0 && (
                <div
                  role="list"
                  aria-label="Attached images"
                  className="-ml-3 -mr-1.5 -mt-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  <div className="flex w-max gap-1.5 pb-1 pl-1.5 pr-1 pt-1">
                    {imageAttachments.map((img) => (
                      <span
                        key={img.id}
                        role="listitem"
                        className="group/chip inline-flex shrink-0 items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] py-[3px] pl-1 pr-2"
                        title={img.name}
                      >
                        <span className="size-7 overflow-hidden rounded-md border border-white/10">
                          <img src={img.dataUrl} alt="" className="size-full object-cover" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="max-w-[110px] truncate text-[11px] font-medium text-neutral-100">
                            {img.name}
                          </span>
                          <span className="text-left text-[10px] text-neutral-400">Image</span>
                        </span>
                        <button
                          type="button"
                          className="hidden size-4 items-center justify-center rounded-full border border-white/10 bg-[#222] text-neutral-300 transition-colors hover:text-white group-hover/chip:flex"
                          aria-label={`Remove ${img.name}`}
                          onClick={() =>
                            setImageAttachments((prev) => prev.filter((x) => x.id !== img.id))
                          }
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative w-full pr-2" data-flowy-chat-input>
                <label htmlFor={footerInputId} className="sr-only">
                  Chat message
                </label>
                <textarea
                  id={footerInputId}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handlePlan();
                    }
                  }}
                  placeholder={chatInputPlaceholder}
                  disabled={isPlanning}
                  className="max-h-[200px] min-h-[22px] w-full resize-none bg-transparent text-sm leading-snug text-neutral-100 outline-none placeholder:text-neutral-500"
                />
              </div>
              <div className="flex w-full items-center gap-1">
                <div
                  className="relative grid w-[min(100%,13.75rem)] shrink-0 grid-cols-3 rounded-xl bg-[#313131] p-1"
                  role="radiogroup"
                  aria-label="Chat mode"
                >
                  <div className="pointer-events-none absolute inset-1" aria-hidden>
                    <div
                      className="h-full w-1/3 rounded-lg bg-white/10 transition-transform duration-200 ease-out"
                      style={{ transform: `translateX(${modeSliderIndex * 100}%)` }}
                    />
                  </div>
                  {(["assist", "auto", "plan"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={flowyAgentMode === m}
                      onClick={() => setFlowyAgentMode(m)}
                      disabled={isPlanning || isExecutingStep || isRunning}
                      className={`relative z-10 rounded-lg px-1 py-0.5 text-[11px] font-medium leading-[1.25] tracking-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
                        flowyAgentMode === m ? "text-white" : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {m === "assist" ? "Assist" : m === "auto" ? "Auto" : "Chat"}
                    </button>
                  ))}
                </div>
                <div className="min-w-0 flex-1" />
                <div className="flex shrink-0 items-center gap-0.5">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleImageFilesSelected(e.target.files)}
                  />
                  <button
                    type="button"
                    className="flex size-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                    aria-label="Attach images"
                    title="Attach images"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isPlanning || isExecutingStep || isRunning}
                  >
                    <Paperclip className="size-4" strokeWidth={1.5} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNodePickerOpen(true)}
                    disabled={isPlanning || isExecutingStep || isRunning}
                    className="flex size-8 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
                    aria-label="Mention nodes"
                    title="Mention nodes (@)"
                  >
                    <AtSign className="size-4" strokeWidth={1.5} aria-hidden />
                  </button>
                  <div className="relative ml-0.5 h-10 w-10 shrink-0">
                    <div className="absolute inset-0 rounded-[1.25rem] bg-white/10 backdrop-blur-md">
                      <button
                        type="submit"
                        disabled={isPlanning || !input.trim()}
                        className="flex size-full items-center justify-center rounded-[1.15rem] p-1 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Send message"
                      >
                        <svg className="size-[22px]" fill="currentColor" viewBox="0 0 36 36" aria-hidden>
                          <path
                            clipRule="evenodd"
                            fillRule="evenodd"
                            d="M18 0C8.05887 0 0 8.05887 0 18C0 27.9411 8.05887 36 18 36C27.9411 36 36 27.9411 36 18C36 8.05887 27.9411 0 18 0ZM25.7025 16.8428C26.3415 17.4819 26.3415 18.518 25.7025 19.157C25.0634 19.796 24.0273 19.796 23.3883 19.157L19.6364 15.4051V24.5454C19.6364 25.4491 18.9038 26.1817 18 26.1817C17.0963 26.1817 16.3637 25.4491 16.3637 24.5454V15.4049L12.6116 19.157C11.9725 19.796 10.9364 19.796 10.2974 19.157C9.65834 18.518 9.65834 17.4819 10.2974 16.8428L16.8428 10.2974C17.0113 10.1289 17.2075 10.0048 17.4166 9.92517C17.6029 9.85424 17.7995 9.81855 17.9962 9.81811L17.9986 9.81811L18 9.8181C18.0151 9.8181 18.0301 9.81831 18.0451 9.81871C18.2321 9.82385 18.4184 9.86086 18.5951 9.92972C18.6217 9.94017 18.6508 9.95233 18.6767 9.96411C18.8098 10.0247 18.9335 10.1026 19.0447 10.1949C19.0833 10.227 19.1208 10.2612 19.157 10.2974L19.1681 10.3084L25.7025 16.8428Z"
                          />
                        </svg>
                      </button>
                    </div>
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[1.25rem] border border-white/10"
                    />
                  </div>
                </div>
              </div>
            </div>
          </form>
          </div>
        </div>
        <div
          className="px-3 pb-1.5 pt-0 text-center text-[12px] leading-snug text-neutral-600"
          style={{ background: "#171717" }}
        >
          <span className="text-neutral-500">Flowy is experimental.</span>{" "}
          <span className="text-neutral-600">
            Chat = advice only · Assist = auto-build + approve run · Auto = build &amp; run
          </span>
        </div>
      </div>

      {/* Custom instructions modal */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center"
          onMouseDown={() => setIsSettingsOpen(false)}
        >
          <div
            className="bg-neutral-900 border border-white/10 rounded-2xl shadow-xl w-[560px] max-w-[92vw]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <h4 className="text-sm font-medium text-neutral-100">Custom instructions</h4>
                <p className="text-xs text-neutral-400">
                  Applied to every message in this panel session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
                aria-label="Close instructions"
              >
                <Minus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="Example: Prefer concise answers first; only edit canvas when I explicitly ask."
                className="w-full min-h-[140px] bg-neutral-900/40 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500 resize-y"
              />
              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCustomInstructions("")}
                  className="px-3 py-2 text-xs text-neutral-300 hover:text-neutral-100 transition-colors rounded-lg border border-neutral-600 bg-neutral-800/30"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-3 py-2 text-xs text-white hover:bg-blue-500 transition-colors rounded-lg bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Node context picker (@ mention) */}
      {isNodePickerOpen && workflowState && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center"
          onMouseDown={() => setIsNodePickerOpen(false)}
        >
          <div
            className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl w-[520px] max-w-[92vw]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-neutral-700 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <h4 className="text-sm font-medium text-neutral-200">Node context (@)</h4>
                <p className="text-xs text-neutral-400">Select nodes to give Flowy more accurate context.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsNodePickerOpen(false)}
                className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
                aria-label="Close node context picker"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              <input
                type="text"
                value={nodePickerQuery}
                onChange={(e) => setNodePickerQuery(e.target.value)}
                placeholder="Search by custom title or type..."
                className="w-full bg-neutral-900/40 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
              />

              <div className="mt-3 max-h-[320px] overflow-y-auto pr-1">
                {nodePickerItems.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-6 text-center">No nodes match.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {nodePickerItems.slice(0, 60).map((n) => {
                      const id = n.id;
                      const customTitle = (n.data as any)?.customTitle;
                      const label = typeof customTitle === "string" && customTitle.trim().length ? customTitle : n.type;
                      const active = contextNodeIds.includes(id);

                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setMentionedNodeIds((prev) => {
                              const has = prev.includes(id);
                              // toggling: only mentioned nodes are toggled; canvas-selected remain active via props.
                              return has ? prev.filter((x) => x !== id) : [...prev, id];
                            });
                          }}
                          className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                            active
                              ? "bg-blue-900/20 border-blue-700/50 text-blue-200"
                              : "bg-neutral-800/30 border-neutral-700 text-neutral-300 hover:bg-neutral-800/60"
                          }`}
                        >
                          <div className="text-sm truncate">{label}</div>
                          <div className="text-[11px] text-neutral-500">{n.type}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMentionedNodeIds([]);
                    setNodePickerQuery("");
                  }}
                  className="px-3 py-2 text-xs text-neutral-300 hover:text-neutral-100 transition-colors rounded-lg border border-neutral-600 bg-neutral-800/30"
                >
                  Clear mentions
                </button>
                <button
                  type="button"
                  onClick={() => setIsNodePickerOpen(false)}
                  className="px-3 py-2 text-xs text-white hover:bg-blue-500 transition-colors rounded-lg bg-blue-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cursor overlay (purely visual, no DOM clicking) */}
      {cursor.visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              left: cursor.x,
              top: cursor.y,
              transform: "translate(-50%, -50%)",
              zIndex: 2147483647,
              pointerEvents: "none",
              transition: "left 220ms ease, top 220ms ease, opacity 220ms ease",
              opacity: isExecutingStep ? 1 : 0.95,
            }}
            className="flex items-center gap-2 rounded-md border border-purple-700/70 bg-purple-900/45 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_26px_rgba(76,29,149,0.45)] backdrop-blur px-2 py-1"
          >
            <MousePointerClick size={18} color="#F3E8FF" />
            <span className="text-[11px] text-purple-100 font-semibold">agent</span>
          </div>,
          document.body
        )}
    </div>
  );
}

