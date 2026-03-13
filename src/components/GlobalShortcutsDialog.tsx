"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";

export function GlobalShortcutsDialog() {
  const isOpen = useWorkflowStore((state) => state.shortcutsDialogOpen);
  const setOpen = useWorkflowStore((state) => state.setShortcutsDialogOpen);

  return (
    <KeyboardShortcutsDialog
      isOpen={isOpen}
      onClose={() => setOpen(false)}
    />
  );
}
