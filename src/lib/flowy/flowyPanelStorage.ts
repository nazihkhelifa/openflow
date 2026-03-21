/**
 * Persist Flowy agent panel UI state (chat sessions, dock, custom instructions).
 */

export const FLOWY_SESSIONS_KEY = "openflows-flowy-sessions";
export const FLOWY_ACTIVE_SESSION_KEY = "openflows-flowy-active-session";
export const FLOWY_CUSTOM_INSTRUCTIONS_KEY = "openflows-flowy-custom-instructions";
export const FLOWY_DOCKED_KEY = "openflows-flowy-docked";
export const FLOWY_AGENT_MODE_KEY = "openflows-flowy-agent-mode";
/** JSON: { "provider": "openai" | "google", "model": string } for Flowy panel → Python planner */
export const FLOWY_PLANNER_LLM_KEY = "openflows-flowy-planner-llm";
export const FLOWY_ENFORCE_CANVAS_CONTROL_KEY = "openflows-flowy-enforce-canvas-control";
export const FLOWY_REQUIRE_CAUTION_APPROVAL_KEY = "openflows-flowy-require-caution-approval";
export const FLOWY_STYLE_MEMORY_KEY = "openflows-flowy-style-memory";
export const FLOWY_CANVAS_STATE_MEMORY_KEY = "openflows-flowy-canvas-state-memory";

export const FLOWY_MAX_STORED_SESSIONS = 50;

export type FlowyAgentMode = "plan" | "assist";

export type StoredAppliedPlan = {
  operations: string[];
  executedNodeIds?: string[];
  timestamp: number;
};

export type StoredChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  appliedPlan?: StoredAppliedPlan;
};

export type StoredChatSession = {
  id: string;
  title: string;
  messages: StoredChatMsg[];
  createdAt: number;
};

function _scopedKey(baseKey: string, scopeId?: string | null): string {
  const cleanScope = typeof scopeId === "string" ? scopeId.trim() : "";
  return cleanScope ? `${baseKey}:${cleanScope}` : baseKey;
}

export function createEmptyFlowySession(): StoredChatSession {
  const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { id, title: "New Chat", messages: [], createdAt: Date.now() };
}

export function parseStoredSessions(raw: string | null): StoredChatSession[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    const out: StoredChatSession[] = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const s = item as Record<string, unknown>;
      if (typeof s.id !== "string" || !Array.isArray(s.messages)) continue;
      out.push({
        id: s.id,
        title: typeof s.title === "string" ? s.title : "Chat",
        messages: (s.messages as StoredChatMsg[]).filter(
          (m) => m && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
        ),
        createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function loadFlowyPanelSessions(
  scopeId?: string | null
): { sessions: StoredChatSession[]; activeId: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const scopedSessionsKey = _scopedKey(FLOWY_SESSIONS_KEY, scopeId);
    const scopedActiveKey = _scopedKey(FLOWY_ACTIVE_SESSION_KEY, scopeId);
    let sessions = parseStoredSessions(localStorage.getItem(scopedSessionsKey));
    // Backward-compatibility: if scoped storage is empty, allow fallback to old global key.
    if (!sessions?.length && scopeId) {
      sessions = parseStoredSessions(localStorage.getItem(FLOWY_SESSIONS_KEY));
    }
    if (!sessions?.length) return null;
    const trimmed = [...sessions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, FLOWY_MAX_STORED_SESSIONS);
    const storedActive = localStorage.getItem(scopedActiveKey) ?? (scopeId ? localStorage.getItem(FLOWY_ACTIVE_SESSION_KEY) : null);
    const activeId =
      storedActive && trimmed.some((s) => s.id === storedActive) ? storedActive : trimmed[0].id;
    return { sessions: trimmed, activeId };
  } catch {
    return null;
  }
}

export function saveFlowyPanelSessions(
  sessions: StoredChatSession[],
  activeId: string,
  scopeId?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    const scopedSessionsKey = _scopedKey(FLOWY_SESSIONS_KEY, scopeId);
    const scopedActiveKey = _scopedKey(FLOWY_ACTIVE_SESSION_KEY, scopeId);
    const trimmed = [...sessions]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, FLOWY_MAX_STORED_SESSIONS);
    localStorage.setItem(scopedSessionsKey, JSON.stringify(trimmed));
    localStorage.setItem(scopedActiveKey, activeId);
  } catch {
    /* quota or private mode */
  }
}

export function loadCustomInstructions(scopeId?: string | null): string {
  if (typeof window === "undefined") return "";
  try {
    const scopedKey = _scopedKey(FLOWY_CUSTOM_INSTRUCTIONS_KEY, scopeId);
    const scoped = localStorage.getItem(scopedKey);
    if (scoped !== null) return scoped;
    if (scopeId) return localStorage.getItem(FLOWY_CUSTOM_INSTRUCTIONS_KEY) ?? "";
    return "";
  } catch {
    return "";
  }
}

export function saveCustomInstructions(text: string, scopeId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(_scopedKey(FLOWY_CUSTOM_INSTRUCTIONS_KEY, scopeId), text);
  } catch {
    /* ignore */
  }
}

export function loadDockedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(FLOWY_DOCKED_KEY) === "1";
}

export function saveDockedPreference(docked: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLOWY_DOCKED_KEY, docked ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadFlowyAgentMode(): FlowyAgentMode {
  if (typeof window === "undefined") return "assist";
  try {
    const v = localStorage.getItem(FLOWY_AGENT_MODE_KEY);
    if (v === "plan" || v === "assist") return v;
  } catch {
    /* ignore */
  }
  return "assist";
}

export function saveFlowyAgentMode(mode: FlowyAgentMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLOWY_AGENT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export type FlowyPlannerLlmProvider = "openai" | "google";

export type FlowyPlannerLlmChoice = {
  provider: FlowyPlannerLlmProvider;
  model: string;
};

/** Options shown in the Flowy chat panel (must match backend `content_writer.py` support). */
export const FLOWY_PLANNER_LLM_OPTIONS: Array<{
  provider: FlowyPlannerLlmProvider;
  model: string;
  label: string;
}> = [
  { provider: "google", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "google", model: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { provider: "google", model: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { provider: "google", model: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { provider: "openai", model: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
];

const DEFAULT_FLOWY_PLANNER_LLM: FlowyPlannerLlmChoice = {
  provider: "openai",
  model: "gpt-4.1-mini",
};

function _coercePlannerLlm(raw: unknown): FlowyPlannerLlmChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const provider = o.provider === "google" || o.provider === "openai" ? o.provider : null;
  const model = typeof o.model === "string" ? o.model.trim() : "";
  if (!provider || !model) return null;
  const ok = FLOWY_PLANNER_LLM_OPTIONS.some((x) => x.provider === provider && x.model === model);
  return ok ? { provider, model } : null;
}

export function loadFlowyPlannerLlm(): FlowyPlannerLlmChoice {
  if (typeof window === "undefined") return DEFAULT_FLOWY_PLANNER_LLM;
  try {
    const raw = localStorage.getItem(FLOWY_PLANNER_LLM_KEY);
    if (!raw) return DEFAULT_FLOWY_PLANNER_LLM;
    const parsed = _coercePlannerLlm(JSON.parse(raw));
    return parsed ?? DEFAULT_FLOWY_PLANNER_LLM;
  } catch {
    return DEFAULT_FLOWY_PLANNER_LLM;
  }
}

export function saveFlowyPlannerLlm(choice: FlowyPlannerLlmChoice): void {
  if (typeof window === "undefined") return;
  try {
    const ok = FLOWY_PLANNER_LLM_OPTIONS.some(
      (x) => x.provider === choice.provider && x.model === choice.model
    );
    if (!ok) return;
    localStorage.setItem(FLOWY_PLANNER_LLM_KEY, JSON.stringify(choice));
  } catch {
    /* ignore */
  }
}

export function flowyPlannerLlmOptionId(choice: FlowyPlannerLlmChoice): string {
  return `${choice.provider}:${choice.model}`;
}

export function loadEnforceCanvasControl(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(FLOWY_ENFORCE_CANVAS_CONTROL_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function saveEnforceCanvasControl(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLOWY_ENFORCE_CANVAS_CONTROL_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadRequireCautionApproval(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FLOWY_REQUIRE_CAUTION_APPROVAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveRequireCautionApproval(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FLOWY_REQUIRE_CAUTION_APPROVAL_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type StyleMemoryEntry = {
  key: string;
  value: string;
  frequency: number;
  lastUsed: number;
};

export type StyleMemory = {
  preferredModels: StyleMemoryEntry[];
  preferredStyles: StyleMemoryEntry[];
  preferredAspectRatios: StyleMemoryEntry[];
  commonPatterns: StyleMemoryEntry[];
};

export type CanvasStateMemory = {
  previous: unknown | null;
  current: unknown | null;
  updatedAt: number;
};

const EMPTY_STYLE_MEMORY: StyleMemory = {
  preferredModels: [],
  preferredStyles: [],
  preferredAspectRatios: [],
  commonPatterns: [],
};

export function loadStyleMemory(scopeId?: string | null): StyleMemory {
  if (typeof window === "undefined") return { ...EMPTY_STYLE_MEMORY };
  try {
    const scopedKey = _scopedKey(FLOWY_STYLE_MEMORY_KEY, scopeId);
    const raw = localStorage.getItem(scopedKey) ?? (scopeId ? localStorage.getItem(FLOWY_STYLE_MEMORY_KEY) : null);
    if (!raw) return { ...EMPTY_STYLE_MEMORY };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_STYLE_MEMORY };
    return {
      preferredModels: Array.isArray(parsed.preferredModels) ? parsed.preferredModels : [],
      preferredStyles: Array.isArray(parsed.preferredStyles) ? parsed.preferredStyles : [],
      preferredAspectRatios: Array.isArray(parsed.preferredAspectRatios) ? parsed.preferredAspectRatios : [],
      commonPatterns: Array.isArray(parsed.commonPatterns) ? parsed.commonPatterns : [],
    };
  } catch {
    return { ...EMPTY_STYLE_MEMORY };
  }
}

export function saveStyleMemory(memory: StyleMemory, scopeId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed: StyleMemory = {
      preferredModels: memory.preferredModels.slice(0, 10),
      preferredStyles: memory.preferredStyles.slice(0, 15),
      preferredAspectRatios: memory.preferredAspectRatios.slice(0, 8),
      commonPatterns: memory.commonPatterns.slice(0, 10),
    };
    localStorage.setItem(_scopedKey(FLOWY_STYLE_MEMORY_KEY, scopeId), JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function loadCanvasStateMemory(scopeId?: string | null): CanvasStateMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const scopedKey = _scopedKey(FLOWY_CANVAS_STATE_MEMORY_KEY, scopeId);
    const raw = localStorage.getItem(scopedKey) ?? (scopeId ? localStorage.getItem(FLOWY_CANVAS_STATE_MEMORY_KEY) : null);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      previous: (parsed as any).previous ?? null,
      current: (parsed as any).current ?? null,
      updatedAt: typeof (parsed as any).updatedAt === "number" ? (parsed as any).updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveCanvasStateMemory(memory: CanvasStateMemory, scopeId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(_scopedKey(FLOWY_CANVAS_STATE_MEMORY_KEY, scopeId), JSON.stringify(memory));
  } catch {
    /* ignore */
  }
}

export function updateStyleMemoryEntry(
  memory: StyleMemory,
  category: keyof StyleMemory,
  key: string,
  value: string,
): StyleMemory {
  const entries = [...memory[category]];
  const existing = entries.findIndex((e) => e.key === key);
  if (existing >= 0) {
    entries[existing] = {
      ...entries[existing],
      value,
      frequency: entries[existing].frequency + 1,
      lastUsed: Date.now(),
    };
  } else {
    entries.push({ key, value, frequency: 1, lastUsed: Date.now() });
  }
  entries.sort((a, b) => b.frequency - a.frequency || b.lastUsed - a.lastUsed);
  return { ...memory, [category]: entries };
}

export function styleMemoryToPromptContext(memory: StyleMemory): string {
  const parts: string[] = [];
  const top = (entries: StyleMemoryEntry[], n: number) =>
    entries.slice(0, n).map((e) => e.value);

  const models = top(memory.preferredModels, 3);
  if (models.length) parts.push(`Preferred models: ${models.join(", ")}`);

  const styles = top(memory.preferredStyles, 5);
  if (styles.length) parts.push(`Preferred styles: ${styles.join(", ")}`);

  const ratios = top(memory.preferredAspectRatios, 3);
  if (ratios.length) parts.push(`Preferred aspect ratios: ${ratios.join(", ")}`);

  const patterns = top(memory.commonPatterns, 3);
  if (patterns.length) parts.push(`Common workflow patterns: ${patterns.join(", ")}`);

  if (!parts.length) return "";
  return `User style preferences (learned from prior sessions):\n${parts.join("\n")}`;
}
