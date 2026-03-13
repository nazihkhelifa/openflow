import { useSyncExternalStore, useCallback } from "react";

const INLINE_PARAMS_KEY = "openflows-inline-parameters";

// Subscribers for reactive updates
const subscribers = new Set<() => void>();

// Get current value from localStorage
function getSnapshot(): boolean {
  try {
    return localStorage.getItem(INLINE_PARAMS_KEY) === "true";
  } catch {
    return false;
  }
}

// Server-side snapshot (always false)
function getServerSnapshot(): boolean {
  return false;
}

// Subscribe to changes
function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

// Notify all subscribers of changes
function notifySubscribers() {
  subscribers.forEach((callback) => callback());
}

export function useInlineParameters() {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setInlineParameters = useCallback((value: boolean) => {
    try {
      localStorage.setItem(INLINE_PARAMS_KEY, String(value));
    } catch {
      // localStorage not available
    }
    notifySubscribers();
  }, []);

  return { inlineParametersEnabled: enabled, setInlineParameters };
}
