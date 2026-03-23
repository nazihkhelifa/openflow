"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { generateWorkflowId, useWorkflowStore } from "@/store/workflowStore";
import { getDefaultProjectDirectory } from "@/store/utils/localStorage";
import { useInlineParameters } from "@/hooks/useInlineParameters";
import { ensureProjectSubfolderPath } from "@/lib/project-directory-path";

export type NewProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, directoryPath: string) => void;
};

export function NewProjectModal({ isOpen, onClose, onSave }: NewProjectModalProps) {
  const workflowThumbnail = useWorkflowStore((s) => s.workflowThumbnail);
  const setWorkflowThumbnail = useWorkflowStore((s) => s.setWorkflowThumbnail);
  const setUseExternalImageStorage = useWorkflowStore((s) => s.setUseExternalImageStorage);
  const { inlineParametersEnabled, setInlineParameters } = useInlineParameters();

  const [name, setName] = useState("");
  const [directoryPath, setDirectoryPath] = useState("");
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);
  const [externalStorage, setExternalStorage] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("untitled");
    setDirectoryPath(getDefaultProjectDirectory() || "");
    setLocalThumbnail(null);
    setWorkflowThumbnail(null);
    setExternalStorage(true);
    setError(null);
    setIsValidating(false);
    setIsBrowsing(false);
  }, [isOpen, setWorkflowThumbnail]);

  const handleBrowse = async () => {
    setIsBrowsing(true);
    setError(null);
    try {
      const response = await fetch("/api/browse-directory");
      const result = await response.json();
      if (!result.success) {
        setError(result.error || "Failed to open directory picker");
        return;
      }
      if (result.cancelled) return;
      if (result.path) setDirectoryPath(result.path);
    } catch (err) {
      setError(
        `Failed to open directory picker: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }
    if (!directoryPath.trim()) {
      setError("Project directory is required");
      return;
    }

    const fullProjectPath = ensureProjectSubfolderPath(directoryPath, name);
    if (
      !(
        fullProjectPath.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(fullProjectPath) ||
        fullProjectPath.startsWith("\\\\")
      )
    ) {
      setError("Project directory must be an absolute path (starting with /, a drive letter, or a UNC path)");
      return;
    }

    setIsValidating(true);
    setError(null);
    try {
      const response = await fetch(`/api/workflow?path=${encodeURIComponent(fullProjectPath)}`);
      const result = await response.json();
      if (result.exists && !result.isDirectory) {
        setError("Project path is not a directory");
        setIsValidating(false);
        return;
      }

      setUseExternalImageStorage(externalStorage);
      const id = generateWorkflowId();
      onSave(id, name.trim(), fullProjectPath);
      setIsValidating(false);
    } catch (err) {
      setError(
        `Failed to validate directory: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setIsValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isValidating && !isBrowsing) {
      void handleCreate();
    }
    if (e.key === "Escape") onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-labelledby="new-project-title"
        className="flex max-h-[min(640px,90dvh)] w-[min(100%,28rem)] flex-col overflow-hidden rounded-2xl border border-secondary bg-surface-container shadow-2xl backdrop-blur-glass outline-none"
        onKeyDown={handleKeyDown}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 id="new-project-title" className="text-lg font-semibold text-stitch-fg">
            New project
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-lg text-stitch-muted transition-colors hover:bg-state-hover hover:text-stitch-fg"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flowy-chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
          <div className="space-y-4">
            <p className="text-xs text-stitch-muted">
              Choose a name, folder, and optional thumbnail. You can change these later in project
              settings.
            </p>

            <div>
              <label className="mb-1 block text-sm text-stitch-muted">Project name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="my-project"
                autoFocus
                className="w-full rounded-lg border border-secondary bg-state-enabled px-3 py-2 text-sm text-stitch-fg outline-none transition-colors focus:border-white/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm text-stitch-muted">Project directory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directoryPath}
                  onChange={(e) => {
                    setDirectoryPath(e.target.value);
                    setError(null);
                  }}
                  placeholder="/path/to/projects"
                  className="min-w-0 flex-1 rounded-lg border border-secondary bg-state-enabled px-3 py-2 text-sm text-stitch-fg outline-none transition-colors focus:border-white/20"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowse()}
                  disabled={isBrowsing}
                  className="shrink-0 rounded-lg bg-state-active px-3 py-2 text-sm text-stitch-fg transition-colors hover:bg-state-hover disabled:opacity-50"
                >
                  {isBrowsing ? "…" : "Browse"}
                </button>
              </div>
              <p className="mt-1 text-xs text-stitch-muted">
                Pre-filled from your default directory in Preferences when available.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm text-stitch-muted">Project thumbnail</label>
              <div className="flex items-start gap-3">
                <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-secondary bg-state-enabled">
                  {localThumbnail || workflowThumbnail ? (
                    <img
                      src={localThumbnail || workflowThumbnail || ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <img
                      src="/thumbnail.jpeg"
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || !file.type.startsWith("image/")) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const dataUrl = reader.result as string;
                        setLocalThumbnail(dataUrl);
                        setWorkflowThumbnail(dataUrl);
                      };
                      reader.readAsDataURL(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => thumbnailInputRef.current?.click()}
                    className="rounded-lg bg-state-active px-3 py-1.5 text-sm text-stitch-fg transition-colors hover:bg-state-hover"
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalThumbnail("/thumbnail.jpeg");
                      setWorkflowThumbnail("/thumbnail.jpeg");
                    }}
                    className="px-3 py-1.5 text-left text-sm text-stitch-muted transition-colors hover:text-stitch-fg"
                  >
                    Use default
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <span className="text-sm text-stitch-fg">Embed images as base64</span>
                  <p className="text-xs text-stitch-muted">
                    Larger workflow files; can hit memory limits on very large workflows.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!externalStorage}
                  onClick={() => setExternalStorage((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${!externalStorage ? "bg-blue-500" : "bg-neutral-600"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${!externalStorage ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                  />
                </button>
              </label>
            </div>

            <div className="border-t border-white/10 pt-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <div>
                  <span className="text-sm text-stitch-fg">Show model settings on nodes</span>
                  <p className="text-xs text-stitch-muted">
                    Show model parameters inside generation nodes instead of the side panel.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inlineParametersEnabled}
                  onClick={() => setInlineParameters(!inlineParametersEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${inlineParametersEnabled ? "bg-blue-500" : "bg-neutral-600"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${inlineParametersEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`}
                  />
                </button>
              </label>
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stitch-muted transition-colors hover:text-stitch-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isValidating || isBrowsing}
            className="rounded-lg bg-stitch-fg px-4 py-2 text-sm font-medium text-neutral-950 transition-colors hover:bg-[#e8eaed] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isValidating ? "Validating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
