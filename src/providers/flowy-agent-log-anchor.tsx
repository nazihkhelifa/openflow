"use client";

import { createContext, useContext, useRef, type RefObject } from "react";

/** DOM id for portaled thread menu (Header `aria-controls` + FlowyAgentPanel portal). */
export const FLOWY_AGENT_LOG_THREADS_MENU_ID = "flowy-agent-log-threads-menu";

export const FlowyAgentLogAnchorContext = createContext<RefObject<HTMLButtonElement | null> | null>(
  null
);

export function FlowyAgentLogAnchorProvider({ children }: { children: React.ReactNode }) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  return (
    <FlowyAgentLogAnchorContext.Provider value={anchorRef}>{children}</FlowyAgentLogAnchorContext.Provider>
  );
}

export function useFlowyAgentLogAnchorRef() {
  return useContext(FlowyAgentLogAnchorContext);
}
