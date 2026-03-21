"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditOperation } from "@/lib/chat/editOperations";
import { executeOperationWithMouse, type OrchestratorDeps } from "@/lib/flowy/agentCanvasOrchestrator";
import {
  buildOpenflowAgentSnapshot,
  describeOpenflowUiCommand,
  executeOpenflowAgentCommands,
  parseOpenflowUiCommandsFromJson,
  type OpenflowAgentCommand,
  type OpenflowAgentExecutorDeps,
} from "@/lib/flowy/openflowAgentCommands";
import { useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  LayoutGrid,
  Loader2,
  Minus,
  Paperclip,
  PanelRightOpen,
  Settings2,
  Sparkles,
  SquarePen,
  SquarePlus,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import { capFlowyChatHistory } from "@/lib/flowy/capFlowyChatHistory";
import {
  createEmptyFlowySession,
  loadCanvasStateMemory,
  loadCustomInstructions,
  loadDockedPreference,
  loadEnforceCanvasControl,
  loadFlowyAgentMode,
  loadFlowyPanelSessions,
  loadFlowyPlannerLlm,
  loadRequireCautionApproval,
  loadStyleMemory,
  FLOWY_PLANNER_LLM_OPTIONS,
  saveCanvasStateMemory,
  saveCustomInstructions,
  saveDockedPreference,
  saveEnforceCanvasControl,
  saveFlowyAgentMode,
  saveFlowyPanelSessions,
  saveFlowyPlannerLlm,
  saveRequireCautionApproval,
  saveStyleMemory,
  styleMemoryToPromptContext,
  updateStyleMemoryEntry,
  flowyPlannerLlmOptionId,
  type CanvasStateMemory,
  type FlowyAgentMode,
  type FlowyPlannerLlmChoice,
  type StoredChatSession,
  type StyleMemory,
} from "@/lib/flowy/flowyPanelStorage";
import { getProviderSettings, loadNodeDefaults } from "@/store/utils/localStorage";

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

type DecompositionStage = {
  id: string;
  title: string;
  instruction: string;
  dependsOn: string[];
  expectedOutput: string;
  requiresExecution: boolean;
};

type DecompositionInfo = {
  stages: DecompositionStage[];
  currentStageIndex: number;
  totalStages: number;
  overallStrategy: string;
  estimatedComplexity: string;
  isLastStage: boolean;
};

type PlannerStageEvent = {
  progress?: string;
  detail?: string;
  stageId?: string;
  stageTitle?: string;
  status?: "running" | "done" | "failed";
  source?: string;
};

type QualityCheck = {
  verdict: "accept" | "refine" | "regenerate" | "error_recovery";
  confidence: number;
  assessment: string;
  issues: string[];
  refinementSuggestion?: string | null;
  nextAction?: string | null;
};

type FlowyPlanResponse = {
  assistantText: string;
  operations: EditOperation[];
  requiresApproval?: boolean;
  approvalReason?: string;
  executeNodeIds?: string[];
  runApprovalRequired?: boolean;
  enforceCanvasControl?: boolean;
  safetyPolicy?: {
    riskSummary?: { safe?: number; caution?: number; destructive?: number };
    requireCautionApproval?: boolean;
    destructiveRequiresApproval?: boolean;
  };
  postApplyCheck?: {
    ok?: boolean;
    predictedNodeDelta?: number;
    predictedEdgeDelta?: number;
    warnings?: string[];
  };
  telemetry?: {
    routerBypassed?: boolean;
    agentMode?: string;
    operationCount?: number;
    selectedNodeCount?: number;
    attachmentsCount?: number;
    validationOk?: boolean;
    qualityCheckRequested?: boolean;
  };
  /** LLM parser output: preferred EditOperation types (ordered) + execution bias. */
  intentSignals?: {
    canvasOperationHints?: string[];
    asksExecuteNodes?: boolean;
    rationale?: string;
    visualAssessmentRequest?: boolean;
    planEditRequest?: boolean;
    asksUpscale?: boolean;
    asksSplitGrid?: boolean;
    asksExtractFrame?: boolean;
    asksModelTune?: boolean;
    asksEaseCurveEdit?: boolean;
    asksSwitchRulesEdit?: boolean;
  };
  /** `chat` = conversational reply only, `plan` = edit operations, `control` = backend-classified control intent. */
  mode?: "chat" | "plan" | "control";
  agentControl?: {
    intent:
      | "next_stage"
      | "prev_stage"
      | "goto_stage"
      | "show_stages"
      | "clear_plan"
      | "stop"
      | "run_now"
      | "dismiss_changes";
    stageNumber?: number | null;
    reason?: string;
  };
  decomposition?: DecompositionInfo;
  qualityCheck?: QualityCheck;
  /** Raw planner output; parsed client-side with parseOpenflowUiCommandsFromJson */
  uiCommands?: unknown[];
};

type AppliedPlanRecord = {
  operations: string[];
  uiCommands?: string[];
  executedNodeIds?: string[];
  timestamp: number;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  appliedPlan?: AppliedPlanRecord;
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

function remapOperationNodeIds(op: EditOperation, idMap: Map<string, string>): EditOperation {
  const mapId = (id: string | undefined): string | undefined => (id ? idMap.get(id) ?? id : id);

  switch (op.type) {
    case "addEdge":
      return {
        ...op,
        source: mapId(op.source) ?? op.source,
        target: mapId(op.target) ?? op.target,
      };
    case "updateNode":
    case "removeNode":
    case "moveNode":
    case "setNodeGroup":
      return {
        ...op,
        nodeId: mapId(op.nodeId) ?? op.nodeId,
      } as EditOperation;
    case "createGroup":
      return {
        ...op,
        nodeIds: op.nodeIds.map((id) => mapId(id) ?? id),
      };
    default:
      return op;
  }
}

function _escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function linkifyNodeIds(text: string, nodeIds: string[]): string {
  if (!text || nodeIds.length === 0) return text;
  const sorted = [...nodeIds].sort((a, b) => b.length - a.length);
  const pattern = sorted.map(_escapeRegExp).join("|");
  if (!pattern) return text;
  const re = new RegExp(`(?<!\\]\\()\\b(${pattern})\\b`, "g");
  return text.replace(re, (_m, id: string) => `[${id}](node://${id})`);
}

function inferVisionAttachmentsFromWorkflow(
  workflowState: WorkflowState | undefined,
  selectedNodeIds: string[] | undefined
): ChatImageAttachment[] {
  if (!workflowState?.nodes?.length) return [];

  const selected = new Set(selectedNodeIds ?? []);
  const candidates: Array<{ nodeId: string; label: string; url: string }> = [];

  const pushCandidate = (nodeId: string, label: string, raw: unknown) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const url = raw.trim();
    const isImageData = url.startsWith("data:image/");
    const isImageHttp = /^https?:\/\//i.test(url);
    if (!isImageData && !isImageHttp) return;
    candidates.push({ nodeId, label, url });
  };

  for (const n of workflowState.nodes) {
    const data = (n.data ?? {}) as Record<string, unknown>;
    const label = typeof data.customTitle === "string" && data.customTitle.trim()
      ? data.customTitle.trim()
      : n.type;
    // Most common output/image fields across nodes.
    pushCandidate(n.id, label, data.outputImage);
    pushCandidate(n.id, label, data.image);
    pushCandidate(n.id, label, data.capturedImage);
    pushCandidate(n.id, label, data.sourceImage);
  }

  // Prioritize selected-node outputs, then others.
  const ordered = [
    ...candidates.filter((c) => selected.has(c.nodeId)),
    ...candidates.filter((c) => !selected.has(c.nodeId)),
  ];

  const seen = new Set<string>();
  const out: ChatImageAttachment[] = [];
  for (const c of ordered) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({
      id: `vision-${c.nodeId}-${out.length + 1}`,
      name: `${c.label} output`,
      mimeType: "image/*",
      dataUrl: c.url,
    });
    if (out.length >= 6) break;
  }

  return out;
}

function extractStyleSignals(text: string): {
  models: string[];
  styles: string[];
  aspectRatios: string[];
  patterns: string[];
} {
  const source = text.toLowerCase();
  const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));

  const models: string[] = [];
  const modelMatchers = [
    "nano banana",
    "nano-banana-2",
    "imagen 4",
    "imagen",
    "seedream",
    "flux",
    "kling",
    "veo",
    "runway",
    "midjourney",
    "sdxl",
    "gemini",
    "claude",
    "gpt-4.1",
  ];
  for (const m of modelMatchers) {
    if (source.includes(m)) models.push(m);
  }

  const styles: string[] = [];
  const styleMatchers = [
    "cinematic",
    "photoreal",
    "photorealistic",
    "grunge",
    "zine",
    "punk",
    "vintage",
    "minimalist",
    "anime",
    "3d render",
    "illustration",
    "editorial",
    "moody",
    "film grain",
  ];
  for (const s of styleMatchers) {
    if (source.includes(s)) styles.push(s);
  }
  const styleFlag = source.match(/--style\s+([a-z0-9_\-]+)/i);
  if (styleFlag?.[1]) styles.push(`style:${styleFlag[1]}`);

  const aspectRatios: string[] = [];
  const ratioRegex = /\b([1-9]\d?)\s*[:x\/]\s*([1-9]\d?)\b/g;
  for (const match of source.matchAll(ratioRegex)) {
    aspectRatios.push(`${match[1]}:${match[2]}`);
  }
  if (source.includes("--ar")) {
    const arMatch = source.match(/--ar\s*([1-9]\d?)\s*[:x\/]\s*([1-9]\d?)/);
    if (arMatch) aspectRatios.push(`${arMatch[1]}:${arMatch[2]}`);
  }

  const patterns: string[] = [];
  if (source.includes("instagram")) patterns.push("instagram-post");
  if (source.includes("poster")) patterns.push("poster-design");
  if (source.includes("collage")) patterns.push("collage-workflow");
  if (source.includes("video")) patterns.push("video-pipeline");
  if (source.includes("brand")) patterns.push("brand-creative");
  if (source.includes("camera") || source.includes("lens")) patterns.push("camera-direction");
  if (source.includes("palette") || source.includes("color grade")) patterns.push("color-palette");
  if (source.includes("close-up") || source.includes("wide shot")) patterns.push("shot-composition");
  const cameraMatch = source.match(/\b(\d{2,3}mm|f\/\d(?:\.\d+)?)\b/g);
  if (cameraMatch?.length) patterns.push(...cameraMatch.map((v) => `camera:${v}`));
  const colorTerms = ["teal", "orange", "amber", "magenta", "cyan", "pastel", "monochrome", "duotone"];
  for (const c of colorTerms) {
    if (source.includes(c)) patterns.push(`palette:${c}`);
  }

  return {
    models: uniq(models),
    styles: uniq(styles),
    aspectRatios: uniq(aspectRatios),
    patterns: uniq(patterns),
  };
}

function buildModelCatalogFromNodeDefaults(defaults: Record<string, any>): Record<string, Array<{ provider: string; modelId: string; displayName: string }>> {
  const collect = (entry: any): Array<{ provider: string; modelId: string; displayName: string }> => {
    if (!entry) return [];
    const picked: Array<{ provider: string; modelId: string; displayName: string }> = [];
    const models = Array.isArray(entry.selectedModels)
      ? entry.selectedModels
      : entry.selectedModel
        ? [entry.selectedModel]
        : [];
    for (const m of models) {
      if (!m || typeof m !== "object") continue;
      const provider = String((m as any).provider ?? "").trim();
      const modelId = String((m as any).modelId ?? "").trim();
      const displayName = String((m as any).displayName ?? modelId).trim();
      if (!modelId) continue;
      picked.push({ provider, modelId, displayName });
    }
    return picked;
  };

  const llmPresets = Array.isArray(defaults.llmPresets)
    ? defaults.llmPresets
    : defaults.llm
      ? [defaults.llm]
      : [];
  const llmModels = llmPresets
    .map((p: any) => ({
      provider: String(p?.provider ?? "").trim(),
      modelId: String(p?.model ?? "").trim(),
      displayName: String(p?.model ?? "").trim(),
    }))
    .filter((x) => x.modelId);

  return {
    generateImage: collect(defaults.generateImage),
    generateImageUpscale: collect((defaults as any).generateImageUpscale),
    generateVideo: collect(defaults.generateVideo),
    generate3d: collect(defaults.generate3d),
    generateAudio: collect(defaults.generateAudio),
    prompt: llmModels,
  };
}

function sanitizeCanvasStateForMemory(state: WorkflowState | undefined): unknown {
  if (!state) return null;
  const compact = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (value.startsWith("data:image/")) return "[data:image]";
      if (value.startsWith("data:audio/")) return "[data:audio]";
      if (value.startsWith("data:video/")) return "[data:video]";
      return value.length > 240 ? `${value.slice(0, 240)}...` : value;
    }
    if (Array.isArray(value)) return value.slice(0, 40).map(compact);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = compact(v);
      return out;
    }
    return value;
  };
  return {
    nodes: (state.nodes ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      groupId: n.groupId ?? null,
      data: compact(n.data),
    })),
    edges: (state.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
    groups: state.groups ?? {},
  };
}

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

function AppliedPlanWidget({ plan }: { plan: AppliedPlanRecord }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mx-5 mt-1.5">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="group flex w-fit cursor-pointer items-center gap-1.5 rounded-lg py-0.5 text-left transition-colors hover:opacity-90"
      >
        <div className="flex size-5 shrink-0 items-center justify-center text-emerald-400/70">
          <SquarePlus className="size-3" strokeWidth={2} aria-hidden />
        </div>
        <span className="text-[11px] font-medium text-emerald-400/80">
          {plan.operations.length} operation{plan.operations.length !== 1 ? "s" : ""} applied
        </span>
        {plan.executedNodeIds && plan.executedNodeIds.length > 0 && (
          <span className="text-[10px] text-emerald-400/50">
            + {plan.executedNodeIds.length} executed
          </span>
        )}
        <ChevronRight
          className={`size-3 text-neutral-500 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {isExpanded && (
        <div className="ml-2 mt-1 border-l border-white/10 pl-3 pb-1">
          {plan.operations.map((desc, i) => (
            <div key={i} className="flex items-start gap-1.5 py-0.5">
              <div className="mt-[5px] size-1.5 shrink-0 rounded-full bg-emerald-500/50" />
              <span className="text-[11px] leading-snug text-neutral-400">{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlowyAgentPanel({
  isOpen,
  onClose,
  onApplyEdits,
  onRunNodeIds,
  onStopWorkflow,
  workflowState,
  selectedNodeIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApplyEdits?: (operations: EditOperation[]) => { applied: number; skipped: string[] };
  onRunNodeIds?: (nodeIds: string[], opts?: { signal?: AbortSignal }) => void | Promise<void>;
  /** Stops in-flight node execution (AbortController on the workflow store). */
  onStopWorkflow?: () => void;
  workflowState?: WorkflowState;
  selectedNodeIds?: string[];
}) {
  const { screenToFlowPosition, setCenter, getViewport } = useReactFlow();
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const storeUpdateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const setNavigationTarget = useWorkflowStore((s) => s.setNavigationTarget);
  const sessionScopeId = workflowId || "global";
  const flowToScreenPosition = useCallback(
    (pos: { x: number; y: number }) => {
      const vp = getViewport();
      const pane = document.querySelector(".react-flow");
      const rect = pane?.getBoundingClientRect() ?? { left: 0, top: 0 };
      return {
        x: pos.x * vp.zoom + vp.x + rect.left,
        y: pos.y * vp.zoom + vp.y + rect.top,
      };
    },
    [getViewport]
  );

  const createSession = useCallback((title = "New Chat"): ChatSession => {
    const base = createEmptyFlowySession();
    return { ...base, title };
  }, []);

  const seed = useMemo(() => createEmptyFlowySession(), []);

  const [sessions, setSessions] = useState<ChatSession[]>(() => [{ ...seed, title: "New Chat" }]);
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
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
  const [enforceCanvasControl, setEnforceCanvasControl] = useState<boolean>(() => loadEnforceCanvasControl());
  const [requireCautionApproval, setRequireCautionApproval] = useState<boolean>(() => loadRequireCautionApproval());
  const [plannerLlm, setPlannerLlm] = useState<FlowyPlannerLlmChoice>(() => loadFlowyPlannerLlm());
  const plannerLlmRef = useRef(plannerLlm);
  plannerLlmRef.current = plannerLlm;
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
  const [pendingUiCommands, setPendingUiCommands] = useState<OpenflowAgentCommand[] | null>(null);
  const pendingUiCommandsApplyRef = useRef<OpenflowAgentCommand[]>([]);
  const resetPendingUiCommands = useCallback(() => {
    pendingUiCommandsApplyRef.current = [];
    setPendingUiCommands(null);
  }, []);
  const [pendingExplanation, setPendingExplanation] = useState<string | null>(null);
  const [pendingExecuteNodeIds, setPendingExecuteNodeIds] = useState<string[] | null>(null);
  const [pendingRunApprovalRequired, setPendingRunApprovalRequired] = useState<boolean>(true);
  const [executionIndex, setExecutionIndex] = useState<number>(0);
  const [applyMode, setApplyMode] = useState<"manual" | "auto">("manual");
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
  const [clickRipple, setClickRipple] = useState<{ x: number; y: number; id: number } | null>(null);
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isExecutingStep, setIsExecutingStep] = useState(false);
  const [cursorActionLabel, setCursorActionLabel] = useState<string>("agent");
  const [plannerProgress, setPlannerProgress] = useState<string | null>(null);
  const [plannerStageEvent, setPlannerStageEvent] = useState<PlannerStageEvent | null>(null);
  const autoRunIdRef = useRef(0);
  const autoRunCompletedRef = useRef(false);
  const autoApplyStartedForOpsRef = useRef<EditOperation[] | null>(null);
  const plannedToActualNodeIdRef = useRef<Map<string, string>>(new Map());
  const activePlanAbortRef = useRef<AbortController | null>(null);
  /** Flowy-approved node runs: abort skips remaining nodes; `onStopWorkflow` cancels current `executeWorkflow`. */
  const flowyRunAbortRef = useRef<AbortController | null>(null);
  const lastGoalRef = useRef<string | null>(null);
  const [activeDecomposition, setActiveDecomposition] = useState<DecompositionInfo | null>(null);
  const activeDecompositionRef = useRef<DecompositionInfo | null>(null);
  activeDecompositionRef.current = activeDecomposition;
  const [styleMemory, setStyleMemory] = useState<StyleMemory | null>(null);
  const styleMemoryRef = useRef<StyleMemory | null>(null);
  styleMemoryRef.current = styleMemory;
  const [canvasStateMemory, setCanvasStateMemory] = useState<CanvasStateMemory | null>(null);
  const lastCanvasSnapshotRef = useRef<string>("");

  // Hydrate sessions from localStorage for the current workflow scope.
  useEffect(() => {
    const loaded = loadFlowyPanelSessions(sessionScopeId);
    if (loaded) {
      setSessions(loaded.sessions as ChatSession[]);
      setActiveSessionId(loaded.activeId);
    } else {
      const fresh = createEmptyFlowySession() as ChatSession;
      setSessions([{ ...fresh, title: "New Chat" }]);
      setActiveSessionId(fresh.id);
    }
    setCustomInstructions(loadCustomInstructions(sessionScopeId));
    setStyleMemory(loadStyleMemory(sessionScopeId));
    setCanvasStateMemory(loadCanvasStateMemory(sessionScopeId));
    lastCanvasSnapshotRef.current = "";
    setStorageReady(true);
  }, [sessionScopeId]);

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
    saveFlowyPanelSessions(sessions as StoredChatSession[], activeSessionId, sessionScopeId);
  }, [storageReady, sessions, activeSessionId, sessionScopeId]);

  useEffect(() => {
    saveCustomInstructions(customInstructions, sessionScopeId);
  }, [customInstructions, sessionScopeId]);

  useEffect(() => {
    if (!styleMemory) return;
    saveStyleMemory(styleMemory, sessionScopeId);
  }, [sessionScopeId, styleMemory]);

  useEffect(() => {
    const snapshot = sanitizeCanvasStateForMemory(workflowState);
    const nextJson = JSON.stringify(snapshot ?? null);
    if (!nextJson || nextJson === lastCanvasSnapshotRef.current) return;
    const memory: CanvasStateMemory = {
      previous: lastCanvasSnapshotRef.current ? JSON.parse(lastCanvasSnapshotRef.current) : null,
      current: snapshot,
      updatedAt: Date.now(),
    };
    lastCanvasSnapshotRef.current = nextJson;
    setCanvasStateMemory(memory);
    saveCanvasStateMemory(memory, sessionScopeId);
  }, [workflowState, sessionScopeId]);

  useEffect(() => {
    saveDockedPreference(isDocked);
  }, [isDocked]);

  useEffect(() => {
    saveFlowyAgentMode(flowyAgentMode);
  }, [flowyAgentMode]);

  useEffect(() => {
    saveEnforceCanvasControl(enforceCanvasControl);
  }, [enforceCanvasControl]);

  useEffect(() => {
    saveRequireCautionApproval(requireCautionApproval);
  }, [requireCautionApproval]);

  useEffect(() => {
    saveFlowyPlannerLlm(plannerLlm);
  }, [plannerLlm]);

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

  const allNodeIds = useMemo(
    () => (workflowState?.nodes ?? []).map((n) => n.id).filter(Boolean),
    [workflowState]
  );

  const renderChatMarkdown = useCallback(
    (text: string) => {
      const linked = linkifyNodeIds(text, allNodeIds);
      return (
        <ReactMarkdown
          components={{
            ...FLOWY_CHAT_MD_COMPONENTS,
            a: ({ href, children }) => {
              if (typeof href === "string" && href.startsWith("node://")) {
                const nodeId = href.slice("node://".length);
                return (
                  <button
                    type="button"
                    className="rounded bg-white/10 px-1 py-px text-sky-300 underline underline-offset-2 hover:text-sky-200"
                    onClick={() => {
                      // Select only this node in-place, then center canvas on it.
                      useWorkflowStore.setState((state) => ({
                        nodes: state.nodes.map((n) => ({ ...n, selected: n.id === nodeId })),
                        edges: state.edges.map((e) => ({ ...e, selected: false })),
                      }));
                      setNavigationTarget(nodeId);
                    }}
                    title={`Focus node ${nodeId}`}
                  >
                    {children}
                  </button>
                );
              }
              return (
                <a
                  href={href}
                  className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {linked}
        </ReactMarkdown>
      );
    },
    [allNodeIds, setNavigationTarget]
  );

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

  const cancelFlowyNodeRun = useCallback(() => {
    flowyRunAbortRef.current?.abort();
    onStopWorkflow?.();
  }, [onStopWorkflow]);

  const runFlowyPendingNodes = useCallback(
    async (nodeIds: string[]): Promise<boolean> => {
      if (!onRunNodeIds || nodeIds.length === 0) return false;
      const ac = new AbortController();
      flowyRunAbortRef.current = ac;
      setIsRunning(true);
      try {
        await onRunNodeIds(nodeIds, { signal: ac.signal });
        return !ac.signal.aborted;
      } finally {
        if (flowyRunAbortRef.current === ac) flowyRunAbortRef.current = null;
        setIsRunning(false);
      }
    },
    [onRunNodeIds]
  );

  const requestPlan = useCallback(
    async (message: string, opts?: { suppressUserEcho?: boolean; stageIndex?: number; decompositionStages?: DecompositionStage[]; runQualityCheck?: boolean }) => {
      const trimmed = message.trim();
      if (!trimmed || isPlanning) return;

      const sessionId = activeSessionIdRef.current;
      const agentModeAtStart = flowyAgentModeRef.current;


      const priorMessages = sessionsRef.current.find((s) => s.id === sessionId)?.messages ?? [];
      const chatHistoryPayload = capFlowyChatHistory(
        priorMessages.map((m) => ({ role: m.role, text: m.text }))
      );

      setErrorMessage(null);
      setIsPlanning(true);
      setPlannerProgress(null);
      setPlannerStageEvent(null);
      activePlanAbortRef.current?.abort();
      const abortController = new AbortController();
      activePlanAbortRef.current = abortController;

      if (!opts?.suppressUserEcho) {
        const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", text: trimmed };
        updateSessionMessages(sessionId, (prev) => [...prev, userMsg]);
      }

      try {
        const styleCtx = styleMemoryRef.current ? styleMemoryToPromptContext(styleMemoryRef.current) : "";
        const nodeDefaults = loadNodeDefaults();
        const modelCatalog = buildModelCatalogFromNodeDefaults(nodeDefaults as Record<string, any>);
        const providerSettings = getProviderSettings();
        const selectedNodes = (stateForRequest?.nodes ?? []).filter((n) => contextNodeIds.includes(n.id));
        const selectedNodeControls = selectedNodes
          .slice(0, 12)
          .map((n) => {
            const data = (n.data ?? {}) as Record<string, unknown>;
            const selectedModel = data.selectedModel as Record<string, unknown> | undefined;
            const modelText = selectedModel
              ? `${String(selectedModel.provider ?? "provider?")}:${String(selectedModel.modelId ?? "model?")}`
              : (typeof data.model === "string" ? data.model : "(none)");
            const aspect = typeof data.aspectRatio === "string" ? data.aspectRatio : "(n/a)";
            return `${n.id} [${n.type}] model=${modelText}, aspectRatio=${aspect}, resolution=${String(data.resolution ?? "(n/a)")}`;
          })
          .join("\n");
        const providerEnabledSummary = Object.entries(providerSettings.providers ?? {})
          .filter(([, cfg]) => Boolean((cfg as any)?.enabled))
          .map(([k]) => k)
          .join(", ");
        const defaultsContext = [
          "Project preferences and node defaults (current project):",
          `Enabled providers: ${providerEnabledSummary || "(none)"}`,
          `NodeDefaults.generateImage default: ${JSON.stringify(nodeDefaults.generateImage ?? {}, null, 0)}`,
          `NodeDefaults.generateImageUpscale default: ${JSON.stringify((nodeDefaults as any).generateImageUpscale ?? {}, null, 0)}`,
          `NodeDefaults.generateVideo default: ${JSON.stringify(nodeDefaults.generateVideo ?? {}, null, 0)}`,
          `NodeDefaults.generate3d default: ${JSON.stringify(nodeDefaults.generate3d ?? {}, null, 0)}`,
          `NodeDefaults.generateAudio default: ${JSON.stringify(nodeDefaults.generateAudio ?? {}, null, 0)}`,
          `NodeDefaults.llm presets: ${JSON.stringify(nodeDefaults.llmPresets ?? (nodeDefaults.llm ? [nodeDefaults.llm] : []), null, 0)}`,
          "Editable node fields policy: You may update selectedModel/model/aspectRatio/resolution/useGoogleSearch/useImageSearch/temperature/maxTokens/provider and other node-specific generation params when user intent asks for model or quality tuning. For generateImage, prefer a single updateNode with aspectRatio: the right-hand Control Panel only exists while that image node is the only selected node on the canvas — assist mode selects and clicks the node, waits for the panel, then changes aspect via Control Panel (inline params off), node top toolbar, or expanded inline settings. Prompt (LLM) nodes do not use that image aspect control; use updateNode for temperature/model/provider on prompt nodes as usual.",
          selectedNodeControls
            ? `Selected node settings snapshot:\n${selectedNodeControls}`
            : "Selected node settings snapshot: (none)",
        ].join("\n");
        let fullMessage = trimmed;
        if (customInstructions.trim().length || styleCtx || defaultsContext.trim().length) {
          const parts: string[] = [];
          if (customInstructions.trim().length) parts.push(`Custom instructions:\n${customInstructions.trim()}`);
          if (styleCtx) parts.push(styleCtx);
          if (defaultsContext.trim().length) parts.push(defaultsContext);
          parts.push(`User request:\n${trimmed}`);
          fullMessage = parts.join("\n\n");
        }
        const inferredVisionAttachments = inferVisionAttachmentsFromWorkflow(
          stateForRequest,
          contextNodeIds
        );
        const mergedAttachments = [...imageAttachments, ...inferredVisionAttachments].slice(0, 8);
        const dedupedAttachments = mergedAttachments.filter(
          (a, idx, arr) => arr.findIndex((x) => x.dataUrl === a.dataUrl) === idx
        );

        let openflowUiSnapshot: string | undefined;
        try {
          openflowUiSnapshot = buildOpenflowAgentSnapshot().text;
        } catch {
          openflowUiSnapshot = undefined;
        }

        const llm = plannerLlmRef.current;
        const body: Record<string, unknown> = {
          message: fullMessage,
          workflowState: stateForRequest,
          selectedNodeIds: contextNodeIds,
          chatHistory: chatHistoryPayload,
          agentMode: agentModeAtStart,
          attachments: dedupedAttachments,
          modelCatalog,
          canvasStateMemory,
          enforceCanvasControl,
          requireCautionApproval,
          openflowUiSnapshot,
          provider: llm.provider,
          model: llm.model,
        };
        if (opts?.stageIndex !== undefined) body.stageIndex = opts.stageIndex;
        if (opts?.decompositionStages) body.decompositionStages = opts.decompositionStages;
        if (opts?.runQualityCheck) body.runQualityCheck = true;

        const useStreaming = process.env.NEXT_PUBLIC_FLOWY_STREAM_PLAN === "1";
        const parseSseLines = (buffer: string) => {
          const events: Array<{ event: string; data: any }> = [];
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const chunk = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (!chunk) continue;
            const lines = chunk.split("\n");
            let event = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) event = line.slice(6).trim();
              if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            try {
              events.push({ event, data: data ? JSON.parse(data) : null });
            } catch {
              events.push({ event, data: data || null });
            }
          }
          return { events, rest: buffer };
        };

        let data: (({ ok: boolean; error?: string; progressEvents?: Array<{ progress: string; detail: string }> } & FlowyPlanResponse) & {
          debugLastText?: string;
        }) | null = null;

        if (useStreaming) {
          const streamRes = await fetch("/api/flowy/plan/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify(body),
          });
          if (!streamRes.ok || !streamRes.body) {
            const errText = await streamRes.text().catch(() => "");
            throw new Error(errText || `Plan stream failed (${streamRes.status})`);
          }
          const reader = streamRes.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseLines(buffer);
            buffer = parsed.rest;
            for (const evt of parsed.events) {
              if (evt.event === "progress" && evt.data) {
                const p = evt.data as PlannerStageEvent;
                setPlannerProgress(p.detail || p.progress || "Planning...");
                setPlannerStageEvent(p);
              } else if (evt.event === "result" && evt.data) {
                data = evt.data as any;
              } else if (evt.event === "error" && evt.data) {
                const msg =
                  typeof evt.data?.error === "string"
                    ? evt.data.error
                    : "Planner stream returned an error.";
                throw new Error(msg);
              }
            }
          }
          if (!data) throw new Error("Planner stream ended without result payload.");
        } else {
          const res = await fetch("/api/flowy/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: abortController.signal,
            body: JSON.stringify(body),
          });

          if (!res.ok) {
            const err = await res.json().catch(() => null);
            throw new Error(err?.error || `Plan failed (${res.status})`);
          }

          const payload = (await res.json()) as any;
          data = payload;
          if (payload?.progressEvents?.length) {
            const last = payload.progressEvents[payload.progressEvents.length - 1];
            setPlannerProgress(last.detail || last.progress);
            setPlannerStageEvent(last as PlannerStageEvent);
          }
        }

        if (!data) {
          throw new Error("Planner returned empty response.");
        }
        if (!data.ok) {
          const debugSnippet =
            typeof data.debugLastText === "string" && data.debugLastText.trim().length
              ? `\n\nLLM output (truncated):\n${data.debugLastText.slice(0, 800)}`
              : "";
          throw new Error((data.error || "Plan failed") + debugSnippet);
        }

        if (data.mode === "control" && data.agentControl) {
          const sessionId = activeSessionIdRef.current;
          const pushAssistant = (text: string) => {
            updateSessionMessages(sessionId, (prev) => [
              ...prev,
              { id: `a-${Date.now()}`, role: "assistant", text },
            ]);
            scrollToBottom();
          };
          const ctrl = data.agentControl;
          const decomp = activeDecompositionRef.current;

          if (ctrl.intent === "show_stages") {
            if (!decomp || decomp.totalStages === 0) {
              pushAssistant(data.assistantText || "No active stage plan yet.");
            } else {
              const lines = decomp.stages.map((s, idx) => {
                const mark = idx < decomp.currentStageIndex ? "[x]" : idx === decomp.currentStageIndex ? "[>]" : "[ ]";
                return `${mark} ${idx + 1}. ${s.title || `Stage ${idx + 1}`}`;
              });
              pushAssistant(`Current plan stages:\n${lines.join("\n")}`);
            }
            setInput("");
            return;
          }

          if (ctrl.intent === "clear_plan") {
            setActiveDecomposition(null);
            pushAssistant(data.assistantText || "Plan cleared.");
            setInput("");
            return;
          }

          if (ctrl.intent === "stop") {
            autoRunIdRef.current += 1;
            autoRunCompletedRef.current = true;
            autoApplyStartedForOpsRef.current = null;
            setIsExecutingStep(false);
            pushAssistant(data.assistantText || "Stopped current automation.");
            setInput("");
            return;
          }

          if (ctrl.intent === "dismiss_changes") {
            setPendingOperations(null);
            resetPendingUiCommands();
            setPendingExplanation(null);
            setPendingExecuteNodeIds(null);
            setPendingRunApprovalRequired(true);
            setExecutionIndex(0);
            autoRunCompletedRef.current = true;
            pushAssistant(data.assistantText || "Dismissed pending changes.");
            setInput("");
            return;
          }

          if (ctrl.intent === "run_now") {
            if (!pendingExecuteNodeIds || pendingExecuteNodeIds.length === 0 || !onRunNodeIds) {
              pushAssistant("No runnable node set is pending right now.");
              setInput("");
              return;
            }
            if (flowyRunAbortRef.current) {
              cancelFlowyNodeRun();
              pushAssistant(data.assistantText || "Stopped the workflow run.");
              setInput("");
              return;
            }
            setInput("");
            const finished = await runFlowyPendingNodes(pendingExecuteNodeIds);
            if (!finished) {
              pushAssistant("Run stopped.");
              setInput("");
              return;
            }
            pushAssistant(data.assistantText || "Run triggered for pending execution nodes.");
            setPendingOperations(null);
            resetPendingUiCommands();
            setPendingExplanation(null);
            setPendingExecuteNodeIds(null);
            setPendingRunApprovalRequired(true);
            setExecutionIndex(0);
            autoRunCompletedRef.current = true;
            return;
          }

          if (!decomp || decomp.totalStages === 0) {
            pushAssistant("No active multi-stage plan yet.");
            setInput("");
            return;
          }

          if (ctrl.intent === "next_stage") {
            const nextIdx = Math.min(decomp.currentStageIndex + 1, decomp.totalStages - 1);
            if (nextIdx === decomp.currentStageIndex) {
              pushAssistant("Already at the last stage.");
              setInput("");
              return;
            }
            setInput("");
            await requestPlan(lastGoalRef.current || "Continue workflow", {
              suppressUserEcho: true,
              stageIndex: nextIdx,
              decompositionStages: decomp.stages,
            });
            return;
          }

          if (ctrl.intent === "prev_stage") {
            const prevIdx = Math.max(decomp.currentStageIndex - 1, 0);
            if (prevIdx === decomp.currentStageIndex) {
              pushAssistant("Already at the first stage.");
              setInput("");
              return;
            }
            setInput("");
            await requestPlan(lastGoalRef.current || "Continue workflow", {
              suppressUserEcho: true,
              stageIndex: prevIdx,
              decompositionStages: decomp.stages,
            });
            return;
          }

          if (ctrl.intent === "goto_stage") {
            const target = Math.min(Math.max(Number(ctrl.stageNumber || 1) - 1, 0), decomp.totalStages - 1);
            if (target === decomp.currentStageIndex) {
              pushAssistant(`Already on stage ${target + 1}.`);
              setInput("");
              return;
            }
            setInput("");
            await requestPlan(lastGoalRef.current || "Continue workflow", {
              suppressUserEcho: true,
              stageIndex: target,
              decompositionStages: decomp.stages,
            });
            return;
          }
        }

        const assistantText = data.assistantText ?? "";
        let ops = data.operations ?? [];
        let mode: "chat" | "plan" = data.mode === "chat" ? "chat" : "plan";
        if (!opts?.suppressUserEcho) {
          lastGoalRef.current = trimmed;
        }
        if (agentModeAtStart === "plan") {
          mode = "chat";
          ops = [];
        }

        if (data.decomposition) {
          setActiveDecomposition(data.decomposition);
        }

        let displayText = assistantText;
        if (data.qualityCheck) {
          const qc = data.qualityCheck;
          const verdictEmoji = qc.verdict === "accept" ? "✓" : qc.verdict === "refine" ? "↻" : qc.verdict === "error_recovery" ? "⚠" : "↺";
          const qcSummary = `\n\n**Quality check** ${verdictEmoji} ${qc.verdict} (${Math.round(qc.confidence * 100)}%): ${qc.assessment}`;
          displayText += qcSummary;
        }
        if (data.safetyPolicy?.riskSummary) {
          const rs = data.safetyPolicy.riskSummary;
          const safetySummary =
            `\n\n**Safety policy**: safe=${rs.safe ?? 0}, caution=${rs.caution ?? 0}, destructive=${rs.destructive ?? 0}` +
            (data.requiresApproval && data.approvalReason ? ` · approval: ${data.approvalReason}` : "");
          displayText += safetySummary;
        }
        if (data.postApplyCheck && data.postApplyCheck.ok === false) {
          const warn = (data.postApplyCheck.warnings ?? []).join(", ") || "post-apply verification warning";
          displayText += `\n\n**Post-apply check**: ${warn}`;
        }

        if (mode === "chat") {
          setPendingOperations(null);
          resetPendingUiCommands();
          setPendingExplanation(null);
          setPendingExecuteNodeIds(null);
          setPendingRunApprovalRequired(true);
          setExecutionIndex(0);
          autoRunCompletedRef.current = true;
        } else {
          const uiParsed = parseOpenflowUiCommandsFromJson(data.uiCommands);
          pendingUiCommandsApplyRef.current = uiParsed;
          setPendingUiCommands(uiParsed);
          setPendingOperations(ops);
          setPendingExplanation(displayText);
          setExecutionIndex(0);
          setPendingExecuteNodeIds(data.executeNodeIds ?? null);
          setPendingRunApprovalRequired(data.runApprovalRequired ?? true);
          autoRunCompletedRef.current = false;
        }
        setCursor((c) => ({ ...c, visible: true }));
        updateSessionMessages(sessionId, (prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: "assistant", text: displayText },
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
        setPlannerProgress(null);
        setPlannerStageEvent(null);
      }
    },
    [
      cancelFlowyNodeRun,
      contextNodeIds,
      customInstructions,
      imageAttachments,
      isPlanning,
      onRunNodeIds,
      resetPendingUiCommands,
      requireCautionApproval,
      runFlowyPendingNodes,
      scrollToBottom,
      stateForRequest,
      updateSessionMessages,
      canvasStateMemory,
      enforceCanvasControl,
    ]
  );

  const handlePlan = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const signals = extractStyleSignals(trimmed);
    setStyleMemory((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const m of signals.models) {
        next = updateStyleMemoryEntry(next, "preferredModels", `model:${m}`, m);
      }
      for (const s of signals.styles) {
        next = updateStyleMemoryEntry(next, "preferredStyles", `style:${s}`, s);
      }
      for (const r of signals.aspectRatios) {
        next = updateStyleMemoryEntry(next, "preferredAspectRatios", `ratio:${r}`, r);
      }
      for (const p of signals.patterns) {
        next = updateStyleMemoryEntry(next, "commonPatterns", `pattern:${p}`, p);
      }
      return next;
    });
    setInput("");
    await requestPlan(trimmed);
    setImageAttachments([]);
  }, [input, requestPlan]);

  const handleSuggestNextStep = useCallback(() => {
    void requestPlan(
      "Next step: use the execution digest and graph — wire missing edges, run pending generators, fix errors, or add a small refinement. Minimal operations; empty operations if nothing is needed.",
      { suppressUserEcho: false }
    );
  }, [requestPlan]);

  const handleQuickFollowUp = useCallback(
    (instruction: string) => {
      void requestPlan(instruction, { suppressUserEcho: false });
    },
    [requestPlan]
  );

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

  const stopAutoRun = useCallback(() => {
    // Increment run id so any in-flight auto loop will stop.
    autoRunIdRef.current += 1;
  }, []);

  useEffect(() => {
    if (flowyAgentMode === "assist") {
      // Assist now auto-applies canvas edits; only run execution needs approval.
      setApplyMode("auto");
    } else {
      stopAutoRun();
      setApplyMode("manual");
    }
  }, [flowyAgentMode, stopAutoRun]);

  useEffect(() => {
    if (isOpen) return;
    activePlanAbortRef.current?.abort();
  }, [isOpen]);

  const sleep = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, ms)), []);

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
      case "clearCanvas":
        return "Clear entire canvas";
    }
    return "Apply operation";
    },
    [nodeTypeById]
  );

  const handleApprove = useCallback(async () => {
    if (pendingOperations == null || !onApplyEdits) return;
    const uiBatch = pendingUiCommandsApplyRef.current;
    if (uiBatch.length > 0) {
      const uiDeps: OpenflowAgentExecutorDeps = {
        sleep,
        setCursor: (partial) => {
          if (partial.x !== undefined || partial.y !== undefined) {
            const x = partial.x ?? cursorPosRef.current.x;
            const y = partial.y ?? cursorPosRef.current.y;
            cursorPosRef.current = { x, y };
            setCursor({ x, y, visible: true });
          }
          if (partial.actionLabel !== undefined) {
            setCursorActionLabel(partial.actionLabel);
          }
        },
        storeUpdateNodeData,
      };
      await executeOpenflowAgentCommands(uiBatch, uiDeps);
    }
    const uiLabels = uiBatch.map(describeOpenflowUiCommand);
    pendingUiCommandsApplyRef.current = [];
    setPendingUiCommands(null);

    const remappedOps = pendingOperations.map((op) =>
      remapOperationNodeIds(op, plannedToActualNodeIdRef.current)
    );
    const opDescriptions = remappedOps.map((op) => describeOperation(op));
    onApplyEdits(remappedOps);
    const planRecord: AppliedPlanRecord = {
      operations: opDescriptions,
      uiCommands: uiLabels.length > 0 ? uiLabels : undefined,
      executedNodeIds: pendingExecuteNodeIds ?? undefined,
      timestamp: Date.now(),
    };
    const sessionId = activeSessionIdRef.current;
    updateSessionMessages(sessionId, (prev) => {
      const msgs = [...prev];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && !msgs[i].appliedPlan) {
          msgs[i] = { ...msgs[i], appliedPlan: planRecord };
          return msgs;
        }
      }
      return msgs;
    });
    setPendingOperations(null);
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    autoRunCompletedRef.current = true;
    setExecutionIndex(0);
    plannedToActualNodeIdRef.current.clear();
  }, [
    describeOperation,
    onApplyEdits,
    pendingExecuteNodeIds,
    pendingOperations,
    sleep,
    storeUpdateNodeData,
    updateSessionMessages,
  ]);

  const orchestratorDeps = useMemo<OrchestratorDeps>(
    () => ({
      setCursor: (partial) => {
        if (partial.x !== undefined || partial.y !== undefined) {
          const x = partial.x ?? cursorPosRef.current.x;
          const y = partial.y ?? cursorPosRef.current.y;
          cursorPosRef.current = { x, y };
          setCursor({ x, y, visible: true });
        }
        if (partial.actionLabel !== undefined) {
          setCursorActionLabel(partial.actionLabel);
        }
        if (partial.clickRipple !== undefined) {
          setClickRipple(partial.clickRipple);
        }
      },
      getCursorPos: () => cursorPosRef.current,
      sleep,
      applyOps: (ops) => onApplyEdits?.(ops),
      storeUpdateNodeData: (nodeId, data) => storeUpdateNodeData(nodeId, data),
      screenToFlowPosition,
      flowToScreenPosition,
      setCenter: (x, y, opts) => setCenter(x, y, opts),
      getViewportZoom: () => getViewport().zoom,
      ensureNodeSelected: (nodeId) => {
        const { nodes, onNodesChange } = useWorkflowStore.getState();
        onNodesChange(
          nodes.map((n) => ({
            type: "select" as const,
            id: n.id,
            selected: n.id === nodeId,
          }))
        );
      },
    }),
    [flowToScreenPosition, getViewport, onApplyEdits, screenToFlowPosition, setCenter, sleep, storeUpdateNodeData]
  );

  const applyOperationAtIndex = useCallback(
    async (index: number) => {
      if (!pendingOperations || !onApplyEdits) return;
      if (index < 0 || index >= pendingOperations.length) return;

      const originalOp = pendingOperations[index];
      const op = remapOperationNodeIds(originalOp, plannedToActualNodeIdRef.current);
      setIsExecutingStep(true);

      try {
        const uiBatch = pendingUiCommandsApplyRef.current;
        if (uiBatch.length > 0) {
          const uiDeps: OpenflowAgentExecutorDeps = {
            sleep,
            setCursor: (partial) =>
              orchestratorDeps.setCursor(partial as Parameters<OrchestratorDeps["setCursor"]>[0]),
            storeUpdateNodeData,
          };
          await executeOpenflowAgentCommands(uiBatch, uiDeps);
          pendingUiCommandsApplyRef.current = [];
          setPendingUiCommands(null);
        }
        const actualNodeId = await executeOperationWithMouse(op, orchestratorDeps);
        if (originalOp.type === "addNode" && originalOp.nodeId && actualNodeId) {
          plannedToActualNodeIdRef.current.set(originalOp.nodeId, actualNodeId);
        }
        setExecutionIndex(index + 1);
      } finally {
        setIsExecutingStep(false);
      }
    },
    [onApplyEdits, orchestratorDeps, pendingOperations, sleep, storeUpdateNodeData]
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
    const uiDismissLabels =
      pendingUiCommands && pendingUiCommands.length > 0
        ? pendingUiCommands.map((c) => describeOpenflowUiCommand(c))
        : [];
    if (
      (pendingOperations && pendingOperations.length > 0) ||
      uiDismissLabels.length > 0
    ) {
      const opDescriptions = (pendingOperations ?? []).map((op) => describeOperation(op));
      const planRecord: AppliedPlanRecord = {
        operations: opDescriptions,
        uiCommands: uiDismissLabels.length > 0 ? uiDismissLabels : undefined,
        executedNodeIds: pendingExecuteNodeIds ?? undefined,
        timestamp: Date.now(),
      };
      const sessionId = activeSessionIdRef.current;
      updateSessionMessages(sessionId, (prev) => {
        const msgs = [...prev];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant" && !msgs[i].appliedPlan) {
            msgs[i] = { ...msgs[i], appliedPlan: planRecord };
            return msgs;
          }
        }
        return msgs;
      });
    }
    stopAutoRun();
    autoApplyStartedForOpsRef.current = null;
    plannedToActualNodeIdRef.current.clear();
    setPendingOperations(null);
    resetPendingUiCommands();
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    resetExecution();
    autoRunCompletedRef.current = true;
  }, [
    describeOperation,
    describeOpenflowUiCommand,
    pendingExecuteNodeIds,
    pendingOperations,
    pendingUiCommands,
    resetExecution,
    resetPendingUiCommands,
    stopAutoRun,
    updateSessionMessages,
  ]);

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

  // Auto-apply mode: Openflow UI commands first, then pending operations sequentially.
  useEffect(() => {
    if (!isOpen) return;
    if (applyMode !== "auto") return;
    if (pendingOperations == null || !onApplyEdits) return;
    if (executionIndex !== 0) return;
    // Guard against starting duplicate auto-apply loops for the same plan.
    // This can happen when dependencies update before executionIndex increments.
    if (autoApplyStartedForOpsRef.current === pendingOperations) return;
    autoApplyStartedForOpsRef.current = pendingOperations;

    const runId = autoRunIdRef.current + 1;
    autoRunIdRef.current = runId;

    (async () => {
      const uiBatch = pendingUiCommandsApplyRef.current;
      if (uiBatch.length > 0) {
        const uiDeps: OpenflowAgentExecutorDeps = {
          sleep,
          setCursor: (partial) => orchestratorDeps.setCursor(partial as Parameters<OrchestratorDeps["setCursor"]>[0]),
          storeUpdateNodeData,
        };
        await executeOpenflowAgentCommands(uiBatch, uiDeps);
        pendingUiCommandsApplyRef.current = [];
        setPendingUiCommands(null);
      }
      for (let i = 0; i < pendingOperations.length; i++) {
        if (autoRunIdRef.current !== runId) return;
        await applyOperationAtIndex(i);
      }
    })();
    // No cleanup needed beyond runId checks.
  }, [
    applyMode,
    applyOperationAtIndex,
    executionIndex,
    isOpen,
    onApplyEdits,
    orchestratorDeps,
    pendingOperations,
    sleep,
    storeUpdateNodeData,
  ]);

  useEffect(() => {
    if (!pendingOperations) {
      autoApplyStartedForOpsRef.current = null;
      plannedToActualNodeIdRef.current.clear();
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
      resetPendingUiCommands();
      setPendingExplanation(null);
      setPendingExecuteNodeIds(null);
      resetExecution();
      setErrorMessage(null);
      setHistoryMenuOpen(false);
    },
    [resetExecution, resetPendingUiCommands, stopAutoRun]
  );

  const handleNewChat = useCallback(() => {
    const next = createSession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setHistoryMenuOpen(false);
    setInput("");
    setPendingOperations(null);
    resetPendingUiCommands();
    setPendingExplanation(null);
    setPendingExecuteNodeIds(null);
    setErrorMessage(null);
    setExecutionIndex(0);
    autoRunCompletedRef.current = true;
    setActiveDecomposition(null);
  }, [createSession, resetPendingUiCommands]);

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      const current = sessions.find((s) => s.id === sessionId);
      if (!current) return;
      const nextTitle = window.prompt("Rename chat", current.title);
      if (nextTitle == null) return;
      const trimmed = nextTitle.trim();
      if (!trimmed) return;
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed.slice(0, 64) } : s))
      );
    },
    [sessions]
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const target = sessions.find((s) => s.id === sessionId);
      if (!target) return;
      const ok = window.confirm(`Delete chat "${target.title}"?`);
      if (!ok) return;

      stopAutoRun();
      setPendingOperations(null);
      resetPendingUiCommands();
      setPendingExplanation(null);
      setPendingExecuteNodeIds(null);
      resetExecution();
      setErrorMessage(null);
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== sessionId);
        if (remaining.length === 0) {
          const fresh = createSession();
          setActiveSessionId(fresh.id);
          return [fresh];
        }
        if (sessionId === activeSessionId) {
          setActiveSessionId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeSessionId, createSession, resetExecution, resetPendingUiCommands, sessions, stopAutoRun]
  );

  const modeSliderIndex = flowyAgentMode === "assist" ? 0 : 1;
  const styleMemorySummary = useMemo(() => {
    if (!styleMemory) {
      return {
        models: 0,
        styles: 0,
        ratios: 0,
        patterns: 0,
        topModels: [] as string[],
        topStyles: [] as string[],
        topRatios: [] as string[],
        topPatterns: [] as string[],
      };
    }
    const top = (arr: Array<{ value: string }>, n: number) =>
      arr
        .map((x) => x.value.trim())
        .filter(Boolean)
        .slice(0, n);
    return {
      models: styleMemory.preferredModels.length,
      styles: styleMemory.preferredStyles.length,
      ratios: styleMemory.preferredAspectRatios.length,
      patterns: styleMemory.commonPatterns.length,
      topModels: top(styleMemory.preferredModels, 3),
      topStyles: top(styleMemory.preferredStyles, 3),
      topRatios: top(styleMemory.preferredAspectRatios, 3),
      topPatterns: top(styleMemory.commonPatterns, 3),
    };
  }, [styleMemory]);
  const canvasStateMemorySummary = useMemo(() => {
    const prev = canvasStateMemory?.previous as any;
    const curr = canvasStateMemory?.current as any;
    const countNodes = (x: any) => (Array.isArray(x?.nodes) ? x.nodes.length : 0);
    const countEdges = (x: any) => (Array.isArray(x?.edges) ? x.edges.length : 0);
    const countGroups = (x: any) => {
      const g = x?.groups;
      return g && typeof g === "object" ? Object.keys(g).length : 0;
    };
    return {
      updatedAt: canvasStateMemory?.updatedAt ?? null,
      previousNodes: countNodes(prev),
      previousEdges: countEdges(prev),
      previousGroups: countGroups(prev),
      currentNodes: countNodes(curr),
      currentEdges: countEdges(curr),
      currentGroups: countGroups(curr),
    };
  }, [canvasStateMemory]);
  const memoryInspectorText = useMemo(() => {
    return [
      `projectScope: ${sessionScopeId}`,
      `workflowId: ${workflowId ?? "(none)"}`,
      `agentMode: ${flowyAgentMode}`,
      `sessions: ${sessions.length}`,
      `activeSessionId: ${activeSessionId}`,
      `customInstructionsChars: ${customInstructions.trim().length}`,
      `styleMemory: models=${styleMemorySummary.models}, styles=${styleMemorySummary.styles}, ratios=${styleMemorySummary.ratios}, patterns=${styleMemorySummary.patterns}`,
      `canvasStateMemory: updatedAt=${canvasStateMemorySummary.updatedAt ?? 0}, previous(nodes=${canvasStateMemorySummary.previousNodes}, edges=${canvasStateMemorySummary.previousEdges}, groups=${canvasStateMemorySummary.previousGroups}), current(nodes=${canvasStateMemorySummary.currentNodes}, edges=${canvasStateMemorySummary.currentEdges}, groups=${canvasStateMemorySummary.currentGroups})`,
      styleMemorySummary.topModels.length ? `topModels: ${styleMemorySummary.topModels.join(" | ")}` : "",
      styleMemorySummary.topStyles.length ? `topStyles: ${styleMemorySummary.topStyles.join(" | ")}` : "",
      styleMemorySummary.topRatios.length ? `topAspectRatios: ${styleMemorySummary.topRatios.join(" | ")}` : "",
      styleMemorySummary.topPatterns.length ? `topPatterns: ${styleMemorySummary.topPatterns.join(" | ")}` : "",
      canvasStateMemory?.previous ? `canvasPrevious: ${JSON.stringify(canvasStateMemory.previous)}` : "",
      canvasStateMemory?.current ? `canvasCurrent: ${JSON.stringify(canvasStateMemory.current)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    sessionScopeId,
    workflowId,
    flowyAgentMode,
    sessions.length,
    activeSessionId,
    customInstructions,
    styleMemorySummary,
    canvasStateMemory,
    canvasStateMemorySummary,
  ]);
  const chatInputPlaceholder =
    flowyAgentMode === "plan"
      ? "Brainstorm workflows, prompts, and tradeoffs. Use @ to mention nodes."
      : "Flowy auto-builds the canvas; approve before running nodes. Use @ to mention nodes.";

  if (!isOpen) return null;

  const footerStatusText = [
    isPlanning ? "Flowy is planning a response." : "",
    pendingOperations ? "Canvas changes waiting for your review." : "",
    pendingUiCommands && pendingUiCommands.length > 0
      ? `Openflow UI: ${pendingUiCommands.length} step${pendingUiCommands.length === 1 ? "" : "s"} will run before canvas edits.`
      : "",
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
                  <div
                    key={s.id}
                    role="option"
                    aria-selected={s.id === activeSessionId}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-sm ${
                      s.id === activeSessionId ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/10"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => switchToSession(s.id)}
                      className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left hover:text-white"
                    >
                      {s.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRenameSession(s.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
                      title="Rename chat"
                      aria-label={`Rename ${s.title}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSession(s.id)}
                      className="rounded px-1.5 py-0.5 text-[10px] text-rose-300/70 hover:bg-rose-500/20 hover:text-rose-200"
                      title="Delete chat"
                      aria-label={`Delete ${s.title}`}
                    >
                      Delete
                    </button>
                  </div>
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
                  {renderChatMarkdown(m.text)}
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
                    {renderChatMarkdown(m.text)}
                  </div>
                </div>
              </div>
              {m.appliedPlan && m.appliedPlan.operations.length > 0 && (
                <AppliedPlanWidget plan={m.appliedPlan} />
              )}
            </div>
          )
        )}

        {(activeDecomposition && activeDecomposition.totalStages > 0) || plannerStageEvent ? (
          <div className="mx-4 my-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-neutral-200">
              <Sparkles className="size-3 shrink-0" aria-hidden />
              <span className="font-medium">
                {activeDecomposition && activeDecomposition.totalStages > 0
                  ? `Todo stages (${activeDecomposition.currentStageIndex + 1}/${activeDecomposition.totalStages})`
                  : (plannerStageEvent?.stageTitle || "Planning")}
              </span>
            </div>
            {activeDecomposition && activeDecomposition.totalStages > 0 ? (
              <div className="space-y-1.5">
                {activeDecomposition.stages.map((s, i) => {
                  const done = i < activeDecomposition.currentStageIndex;
                  const current = i === activeDecomposition.currentStageIndex;
                  return (
                    <div
                      key={s.id}
                      className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 ${
                        current
                          ? "border-blue-500/40 bg-blue-500/10"
                          : done
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {done ? (
                          <Check className="size-3.5 text-emerald-300" aria-hidden />
                        ) : (
                          <Circle className={`size-3.5 ${current ? "text-blue-300" : "text-neutral-500"}`} aria-hidden />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-[11px] font-medium ${
                            done
                              ? "text-neutral-300 line-through decoration-neutral-500"
                              : current
                                ? "text-blue-200"
                                : "text-neutral-300"
                          }`}
                        >
                          {s.title || `Stage ${i + 1}`}
                        </div>
                        {s.instruction ? (
                          <div className="mt-0.5 text-[10px] leading-snug text-neutral-400">
                            {s.instruction}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                <Circle className="size-3.5 text-blue-300" aria-hidden />
                <span>{plannerStageEvent?.detail || plannerProgress || "Flowy is thinking..."}</span>
              </div>
            )}
          </div>
        ) : null}

        {isPlanning && (
          <div className="group/message flex w-full select-text flex-col gap-1 py-1">
            <div className="px-6">
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-neutral-300">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                <span>{plannerStageEvent?.detail || plannerProgress || "Flowy is thinking..."}</span>
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
                    {pendingUiCommands && pendingUiCommands.length > 0
                      ? applyMode === "auto"
                        ? `Running Openflow UI… (${pendingUiCommands.length} step${pendingUiCommands.length === 1 ? "" : "s"})`
                        : `Openflow UI first (${pendingUiCommands.length} step${pendingUiCommands.length === 1 ? "" : "s"})`
                      : executionIndex < pendingOperations.length
                        ? `Building on canvas… (${executionIndex + 1}/${pendingOperations.length})`
                        : pendingExecuteNodeIds &&
                            pendingExecuteNodeIds.length > 0 &&
                            pendingRunApprovalRequired &&
                            flowyAgentMode === "assist"
                          ? "Ready to run — approve to execute"
                          : "Applied to canvas ✓"}
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
                      </div>
                      {pendingUiCommands && pendingUiCommands.length > 0 ? (
                        <div className="mb-3 px-0.5">
                          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-violet-300/90">
                            Openflow UI (before canvas)
                          </div>
                          <ul className="space-y-1">
                            {pendingUiCommands.map((cmd, uidx) => (
                              <li
                                key={`ui-cmd-${uidx}`}
                                className="text-xs leading-snug text-violet-200/80"
                              >
                                {describeOpenflowUiCommand(cmd)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
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
                              ? "text-xs leading-tight text-emerald-400/70"
                              : "text-xs leading-tight text-neutral-500";
                        const StepIcon =
                          status === "done"
                            ? Check
                            : status === "next"
                              ? Loader2
                              : Circle;
                        const iconClass =
                          status === "done"
                            ? "size-3.5 text-emerald-400"
                            : status === "next"
                              ? "size-3.5 text-purple-400 animate-spin"
                              : "size-2.5 text-neutral-600";
                        return (
                          <div key={idx} className="flex" aria-current={status === "next" ? "step" : undefined}>
                            <div className="flex w-6 shrink-0 flex-col items-center">
                              <div className={lineTop} />
                              <div className="flex size-6 shrink-0 items-center justify-center">
                                <StepIcon className={iconClass} strokeWidth={2.5} aria-hidden />
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
          {(pendingOperations ||
            isPlanning ||
            (pendingUiCommands && pendingUiCommands.length > 0)) && (
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
                    {pendingUiCommands && pendingUiCommands.length > 0
                      ? applyMode === "auto"
                        ? `Running Openflow UI… (${pendingUiCommands.length})`
                        : `Openflow UI: ${pendingUiCommands.length} step${pendingUiCommands.length === 1 ? "" : "s"} before canvas.`
                      : executionIndex < pendingOperations.length
                        ? applyMode === "auto"
                          ? `Building workflow on canvas… (${executionIndex + 1}/${pendingOperations.length})`
                          : "Apply each step when ready."
                        : pendingExecuteNodeIds &&
                            pendingExecuteNodeIds.length > 0 &&
                            pendingRunApprovalRequired &&
                            flowyAgentMode === "assist"
                          ? "Workflow is ready — run to generate?"
                          : "All edits applied to canvas."}
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
                  {(pendingUiCommands && pendingUiCommands.length > 0) ||
                  executionIndex < pendingOperations.length ? (
                    <>
                      {applyMode === "auto" &&
                        (isExecutingStep ||
                          (pendingUiCommands && pendingUiCommands.length > 0)) && (
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
                        if (isRunning) {
                          cancelFlowyNodeRun();
                          return;
                        }
                        const ids = pendingExecuteNodeIds;
                        if (!ids?.length || !onRunNodeIds) return;
                        const finished = await runFlowyPendingNodes(ids);
                        if (!finished) return;

                        dismissPendingPlan();

                        const goal = lastGoalRef.current;
                        if (!goal) return;

                        await new Promise((r) => setTimeout(r, 800));

                        const decomp = activeDecompositionRef.current;
                        if (decomp && !decomp.isLastStage) {
                          const nextIdx = decomp.currentStageIndex + 1;
                          await requestPlan(goal, {
                            suppressUserEcho: true,
                            stageIndex: nextIdx,
                            decompositionStages: decomp.stages,
                          });
                        } else {
                          await requestPlan(
                            `Execution just finished for the goal: "${goal}". ` +
                              `Check the execution digest — inspect node status, errors, and outputs. ` +
                              `If the result looks good, summarize what was produced. ` +
                              `If there are errors or missing outputs, fix them. ` +
                              `If more stages are needed, plan the next one.`,
                            { suppressUserEcho: true, runQualityCheck: true }
                          );
                        }
                      }}
                      disabled={isPlanning || isExecutingStep}
                      title={isRunning ? "Stop workflow run" : "Run pending nodes"}
                      aria-pressed={isRunning}
                      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-medium backdrop-blur-md transition-[filter] ${
                        isRunning
                          ? "border-neutral-300 bg-white text-neutral-900 shadow-sm hover:bg-neutral-100"
                          : "border-emerald-400/30 bg-emerald-500/[0.14] text-emerald-300 hover:brightness-125"
                      }`}
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-900" aria-hidden />
                          <span className="size-2 shrink-0 rounded-full bg-neutral-900" aria-hidden />
                          <span>Stop</span>
                        </>
                      ) : (
                        "Run"
                      )}
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
              <div className="flex w-full flex-wrap items-center gap-1">
                <div
                  className="relative grid w-[min(100%,10rem)] shrink-0 grid-cols-2 rounded-xl bg-[#313131] p-1"
                  role="radiogroup"
                  aria-label="Chat mode"
                >
                  <div className="pointer-events-none absolute inset-1" aria-hidden>
                    <div
                      className="h-full w-1/2 rounded-lg bg-white/10 transition-transform duration-200 ease-out"
                      style={{ transform: `translateX(${modeSliderIndex * 100}%)` }}
                    />
                  </div>
                  {(["assist", "plan"] as const).map((m) => (
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
                      {m === "assist" ? "Assist" : "Chat"}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="flowy-planner-model">
                  Planner model
                </label>
                <select
                  id="flowy-planner-model"
                  aria-label="Planner model"
                  value={flowyPlannerLlmOptionId(plannerLlm)}
                  onChange={(e) => {
                    const id = e.target.value;
                    const opt = FLOWY_PLANNER_LLM_OPTIONS.find(
                      (o) => flowyPlannerLlmOptionId({ provider: o.provider, model: o.model }) === id
                    );
                    if (opt) setPlannerLlm({ provider: opt.provider, model: opt.model });
                  }}
                  disabled={isPlanning || isExecutingStep || isRunning}
                  className="min-w-0 max-w-[min(100%,14rem)] shrink rounded-lg border border-white/10 bg-[#313131] px-2 py-1 text-[11px] font-medium text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
                >
                  {FLOWY_PLANNER_LLM_OPTIONS.map((o) => (
                    <option
                      key={flowyPlannerLlmOptionId({ provider: o.provider, model: o.model })}
                      value={flowyPlannerLlmOptionId({ provider: o.provider, model: o.model })}
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="min-w-0 flex-1 basis-[4rem]" />
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
            Chat = advice only · Assist = auto-build + approve run
          </span>
          <span className="ml-1 text-neutral-700">
            · Controls: next stage, prev stage, goto stage 2, show stages, run now, stop, clear plan
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
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs font-medium text-neutral-200">Agent execution policy</div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-neutral-300">
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                    <span>Enforce canvas-control-first in Assist mode</span>
                    <input
                      type="checkbox"
                      checked={enforceCanvasControl}
                      onChange={(e) => setEnforceCanvasControl(e.target.checked)}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                    <span>Require approval for caution-tier edits</span>
                    <input
                      type="checkbox"
                      checked={requireCautionApproval}
                      onChange={(e) => setRequireCautionApproval(e.target.checked)}
                      className="h-4 w-4 accent-blue-500"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Project agent memory</div>
                    <div className="text-[11px] text-neutral-500">
                      Scope: <span className="font-mono text-neutral-400">{sessionScopeId}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(memoryInspectorText);
                      } catch {
                        // ignore clipboard errors
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-neutral-300 hover:bg-white/[0.08]"
                    title="Copy memory snapshot"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
                  <div>
                    Sessions: <span className="text-neutral-300">{sessions.length}</span>
                  </div>
                  <div>
                    Active: <span className="font-mono text-neutral-300">{activeSessionId}</span>
                  </div>
                  <div>
                    Style models: <span className="text-neutral-300">{styleMemorySummary.models}</span>
                  </div>
                  <div>
                    Styles: <span className="text-neutral-300">{styleMemorySummary.styles}</span>
                  </div>
                </div>
                <div className="mb-2 rounded-lg border border-white/10 bg-black/20 p-2 text-[11px] text-neutral-400">
                  <div className="mb-1 text-neutral-300">Canvas state memory</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <div>
                      Previous:{" "}
                      <span className="text-neutral-300">
                        {canvasStateMemorySummary.previousNodes}n / {canvasStateMemorySummary.previousEdges}e / {canvasStateMemorySummary.previousGroups}g
                      </span>
                    </div>
                    <div>
                      Current:{" "}
                      <span className="text-neutral-300">
                        {canvasStateMemorySummary.currentNodes}n / {canvasStateMemorySummary.currentEdges}e / {canvasStateMemorySummary.currentGroups}g
                      </span>
                    </div>
                    <div className="col-span-2">
                      Updated:{" "}
                      <span className="text-neutral-300">
                        {canvasStateMemorySummary.updatedAt
                          ? new Date(canvasStateMemorySummary.updatedAt).toLocaleString()
                          : "not yet"}
                      </span>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-neutral-400 hover:text-neutral-200">
                      Show canvas previous/current JSON
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] leading-relaxed text-neutral-300 whitespace-pre-wrap">
{JSON.stringify(canvasStateMemory ?? {}, null, 2)}
                    </pre>
                  </details>
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-[11px] text-neutral-400 hover:text-neutral-200">
                    Show full memory snapshot
                  </summary>
                  <pre className="mt-2 max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] leading-relaxed text-neutral-300 whitespace-pre-wrap">
{memoryInspectorText}
                  </pre>
                </details>
              </div>
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

      {/* Agent mouse cursor */}
      {cursor.visible &&
        isExecutingStep &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              left: cursor.x,
              top: cursor.y,
              zIndex: 2147483647,
              pointerEvents: "none",
            }}
          >
            {/* Mouse pointer SVG — tip at (0,0) */}
            <svg
              width="24" height="24" viewBox="0 0 24 24" fill="none"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
            >
              <path d="M5 3l14 8.5-6.5 1.5L9 19.5 5 3z" fill="#a855f7" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            {/* Action label badge */}
            <div
              className="absolute left-5 top-5 whitespace-nowrap rounded-md border border-purple-700/70 bg-purple-900/80 px-2 py-0.5 text-[10px] font-semibold text-purple-100 shadow-lg backdrop-blur-sm"
            >
              {cursorActionLabel}
            </div>
          </div>,
          document.body
        )}

      {/* Click ripple effect */}
      {clickRipple &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            key={clickRipple.id}
            aria-hidden="true"
            style={{
              position: "fixed",
              left: clickRipple.x,
              top: clickRipple.y,
              transform: "translate(-50%, -50%)",
              zIndex: 2147483646,
              pointerEvents: "none",
            }}
          >
            <div
              className="h-8 w-8 rounded-full border-2 border-purple-400/80 bg-purple-500/20 animate-ping"
              style={{ animationDuration: "600ms", animationIterationCount: 1 }}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

