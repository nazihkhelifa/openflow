"use client";

import { useState, useEffect, useRef } from "react";
import { generateWorkflowId, useWorkflowStore } from "@/store/workflowStore";
import { ProviderType, ProviderSettings, NodeDefaultsConfig, LLMProvider, LLMModelType, LLMNodeDefaults } from "@/types";
import { CanvasNavigationSettings, PanMode, ZoomMode, SelectionMode } from "@/types/canvas";
import { EnvStatusResponse } from "@/app/api/env-status/route";
import {
  loadNodeDefaults,
  saveNodeDefaults,
  getDefaultProjectDirectory,
  setDefaultProjectDirectory,
} from "@/store/utils/localStorage";
import { ProviderModel } from "@/lib/providers/types";
import { ReactFlowProvider } from "@xyflow/react";
import { ModelSearchDialog } from "@/components/modals/ModelSearchDialog";
import { useInlineParameters } from "@/hooks/useInlineParameters";
import { SlidersHorizontal, FolderOpen, Key, Box, X } from "lucide-react";

// LLM provider and model options (mirrored from LLMGenerateNode)
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

// Provider icons
const GeminiIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
  </svg>
);

const ReplicateIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 1000 1000" fill="currentColor">
    <polygon points="1000,427.6 1000,540.6 603.4,540.6 603.4,1000 477,1000 477,427.6" />
    <polygon points="1000,213.8 1000,327 364.8,327 364.8,1000 238.4,1000 238.4,213.8" />
    <polygon points="1000,0 1000,113.2 126.4,113.2 126.4,1000 0,1000 0,0" />
  </svg>
);

const FalIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 1855 1855" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M1181.65 78C1212.05 78 1236.42 101.947 1239.32 131.261C1265.25 392.744 1480.07 600.836 1750.02 625.948C1780.28 628.764 1805 652.366 1805 681.816V1174.18C1805 1203.63 1780.28 1227.24 1750.02 1230.05C1480.07 1255.16 1265.25 1463.26 1239.32 1724.74C1236.42 1754.05 1212.05 1778 1181.65 1778H673.354C642.951 1778 618.585 1754.05 615.678 1724.74C589.754 1463.26 374.927 1255.16 104.984 1230.05C74.7212 1227.24 50 1203.63 50 1174.18V681.816C50 652.366 74.7213 628.764 104.984 625.948C374.927 600.836 589.754 392.744 615.678 131.261C618.585 101.946 642.951 78 673.353 78H1181.65ZM402.377 926.561C402.377 1209.41 638.826 1438.71 930.501 1438.71C1222.18 1438.71 1458.63 1209.41 1458.63 926.561C1458.63 643.709 1222.18 414.412 930.501 414.412C638.826 414.412 402.377 643.709 402.377 926.561Z" />
  </svg>
);

const WaveSpeedIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 512 512" fill="currentColor">
    <path d="M308.946 153.758C314.185 153.758 318.268 158.321 317.516 163.506C306.856 237.02 270.334 302.155 217.471 349.386C211.398 354.812 203.458 357.586 195.315 357.586H127.562C117.863 357.586 110.001 349.724 110.001 340.025V333.552C110.001 326.82 113.882 320.731 119.792 317.505C176.087 286.779 217.883 232.832 232.32 168.537C234.216 160.09 241.509 153.758 250.167 153.758H308.946Z" />
    <path d="M183.573 153.758C188.576 153.758 192.592 157.94 192.069 162.916C187.11 210.12 160.549 250.886 122.45 275.151C116.916 278.676 110 274.489 110 267.928V171.318C110 161.62 117.862 153.758 127.56 153.758H183.573Z" />
    <path d="M414.815 153.758C425.503 153.758 433.734 163.232 431.799 173.743C420.697 234.038 398.943 290.601 368.564 341.414C362.464 351.617 351.307 357.586 339.419 357.586H274.228C266.726 357.586 262.611 348.727 267.233 342.819C306.591 292.513 334.86 233.113 348.361 168.295C350.104 159.925 357.372 153.758 365.922 153.758H414.815Z" />
  </svg>
);

// Get provider icon component
const getProviderIcon = (provider: ProviderType) => {
  switch (provider) {
    case "gemini":
      return <GeminiIcon />;
    case "replicate":
      return <ReplicateIcon />;
    case "fal":
      return <FalIcon />;
    case "wavespeed":
      return <WaveSpeedIcon />;
    default:
      return null;
  }
};

interface ProjectSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, directoryPath: string) => void;
  onDuplicate?: (name: string, directoryPath: string) => void;
  mode: "new" | "settings" | "duplicate";
}

export function ProjectSetupModal({
  isOpen,
  onClose,
  onSave,
  onDuplicate,
  mode,
}: ProjectSetupModalProps) {
  const sanitizeProjectFolderName = (projectName: string): string => {
    return projectName
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\.+$/g, "")
      .trim();
  };

  const joinPathForPlatform = (basePath: string, folderName: string): string => {
    const trimmedBase = basePath.trim();
    const separator = /^[A-Za-z]:[\\\/]/.test(trimmedBase) || trimmedBase.startsWith("\\\\") ? "\\" : "/";
    const endsWithSeparator = trimmedBase.endsWith("/") || trimmedBase.endsWith("\\");
    return `${trimmedBase}${endsWithSeparator ? "" : separator}${folderName}`;
  };

  const getPathBasename = (fullPath: string): string => {
    const withoutTrailingSeparator = fullPath.trim().replace(/[\\/]+$/, "");
    const parts = withoutTrailingSeparator.split(/[\\/]/);
    return parts[parts.length - 1] || "";
  };

  const ensureProjectSubfolderPath = (basePath: string, projectName: string): string => {
    const trimmedBase = basePath.trim();
    const sanitizedFolder = sanitizeProjectFolderName(projectName);
    if (!sanitizedFolder) return trimmedBase;

    const basename = getPathBasename(trimmedBase);
    if (basename.toLowerCase() === sanitizedFolder.toLowerCase()) {
      return trimmedBase;
    }

    return joinPathForPlatform(trimmedBase, sanitizedFolder);
  };

  const {
    workflowName,
    workflowThumbnail,
    saveDirectoryPath,
    useExternalImageStorage,
    setUseExternalImageStorage,
    setWorkflowThumbnail,
    providerSettings,
    updateProviderApiKey,
    toggleProvider,
    maxConcurrentCalls,
    setMaxConcurrentCalls,
    canvasNavigationSettings,
    updateCanvasNavigationSettings,
    edgeStyle,
    setEdgeStyle,
  } = useWorkflowStore();

  // Inline parameters hook
  const { inlineParametersEnabled, setInlineParameters } = useInlineParameters();

  // Tab state - "preferences" = app-wide + canvas, "project" = this project only
  const [activeTab, setActiveTab] = useState<"preferences" | "project" | "providers" | "nodeDefaults">("preferences");

  // Project tab state
  const [name, setName] = useState("");
  const [directoryPath, setDirectoryPath] = useState("");
  const [localThumbnail, setLocalThumbnail] = useState<string | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [defaultProjectDirectory, setDefaultProjectDirectoryLocal] = useState("");
  const [isBrowsingDefault, setIsBrowsingDefault] = useState(false);
  const [externalStorage, setExternalStorage] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provider tab state
  const [localProviders, setLocalProviders] = useState<ProviderSettings>(providerSettings);
  const [showApiKey, setShowApiKey] = useState<Record<ProviderType, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    replicate: false,
    fal: false,
    kie: false,
    wavespeed: false,
  });
  const [overrideActive, setOverrideActive] = useState<Record<ProviderType, boolean>>({
    gemini: false,
    openai: false,
    anthropic: false,
    replicate: false,
    fal: false,
    kie: false,
    wavespeed: false,
  });
  const [envStatus, setEnvStatus] = useState<EnvStatusResponse | null>(null);

  // Node defaults tab state
  const [localNodeDefaults, setLocalNodeDefaults] = useState<NodeDefaultsConfig>({});
  const [showImageModelDialog, setShowImageModelDialog] = useState(false);
  const [showVideoModelDialog, setShowVideoModelDialog] = useState(false);
  const [show3dModelDialog, setShow3dModelDialog] = useState(false);
  const [modelDialogReplace, setModelDialogReplace] = useState<{ key: "generateImage" | "generateVideo" | "generate3d"; index: number } | null>(null);

  // Canvas tab state
  const [localCanvasSettings, setLocalCanvasSettings] = useState<CanvasNavigationSettings>(canvasNavigationSettings);

  // Pre-fill when opening in settings mode
  useEffect(() => {
    if (isOpen) {
      if (mode === "new") {
        setActiveTab("project");
      } else if (mode === "settings") {
        setActiveTab("preferences");
      }

      if (mode === "settings") {
        setName(workflowName || "");
        setDirectoryPath(saveDirectoryPath || "");
        setLocalThumbnail(workflowThumbnail || null);
        setDefaultProjectDirectoryLocal(getDefaultProjectDirectory());
        setExternalStorage(useExternalImageStorage);
      } else if (mode === "duplicate") {
        setName(workflowName ? `Copy of ${workflowName}` : "Copy of Untitled");
        setDirectoryPath("");
        setLocalThumbnail(workflowThumbnail || null);
        setExternalStorage(useExternalImageStorage);
      } else {
        setName("");
        setDirectoryPath(getDefaultProjectDirectory() || "");
        setLocalThumbnail(null);
        setWorkflowThumbnail(null);
        setExternalStorage(true);
      }
      setDefaultProjectDirectoryLocal(getDefaultProjectDirectory());

      // Sync local providers state
      setLocalProviders(providerSettings);
      setShowApiKey({ gemini: false, openai: false, anthropic: false, replicate: false, fal: false, kie: false, wavespeed: false });
      // Initialize override as active if user already has a key set
      setOverrideActive({
        gemini: !!providerSettings.providers.gemini?.apiKey,
        openai: !!providerSettings.providers.openai?.apiKey,
        anthropic: !!providerSettings.providers.anthropic?.apiKey,
        replicate: !!providerSettings.providers.replicate?.apiKey,
        fal: !!providerSettings.providers.fal?.apiKey,
        kie: !!providerSettings.providers.kie?.apiKey,
        wavespeed: !!providerSettings.providers.wavespeed?.apiKey,
      });
      setError(null);

      // Load node defaults
      setLocalNodeDefaults(loadNodeDefaults());
      setShowImageModelDialog(false);
      setShowVideoModelDialog(false);
      setShow3dModelDialog(false);

      // Sync canvas settings
      setLocalCanvasSettings(canvasNavigationSettings);

      // Fetch env status
      fetch("/api/env-status")
        .then((res) => res.json())
        .then((data: EnvStatusResponse) => setEnvStatus(data))
        .catch(() => setEnvStatus(null));
    }
  }, [isOpen, mode, workflowName, workflowThumbnail, saveDirectoryPath, useExternalImageStorage, providerSettings, canvasNavigationSettings]);

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

      if (result.cancelled) {
        return;
      }

      if (result.path) {
        setDirectoryPath(result.path);
      }
    } catch (err) {
      setError(
        `Failed to open directory picker: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleBrowseDefault = async () => {
    setIsBrowsingDefault(true);
    setError(null);
    try {
      const response = await fetch("/api/browse-directory");
      const result = await response.json();
      if (result.success && !result.cancelled && result.path) {
        setDefaultProjectDirectoryLocal(result.path);
      }
    } finally {
      setIsBrowsingDefault(false);
    }
  };

  const handleSaveGeneral = () => {
    setDefaultProjectDirectory(defaultProjectDirectory.trim());
    onClose();
  };

  const handleSaveProject = async () => {
    if (mode !== "settings" && !name.trim()) {
      setError("Project name is required");
      return;
    }

    if (mode !== "settings" && !directoryPath.trim()) {
      setError("Project directory is required");
      return;
    }

    if (mode === "settings") {
      setUseExternalImageStorage(externalStorage);
      if (name.trim() && directoryPath.trim()) {
        const fullProjectPath = ensureProjectSubfolderPath(directoryPath, name);
        const id = useWorkflowStore.getState().workflowId || generateWorkflowId();
        onSave(id, name.trim(), fullProjectPath);
      }
      onClose();
      return;
    }

    const fullProjectPath = ensureProjectSubfolderPath(directoryPath, name);

    if (!(fullProjectPath.startsWith("/") || /^[A-Za-z]:[\\\/]/.test(fullProjectPath) || fullProjectPath.startsWith("\\\\"))) {
      setError("Project directory must be an absolute path (starting with /, a drive letter, or a UNC path)");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      // Validate path shape when it already exists
      const response = await fetch(
        `/api/workflow?path=${encodeURIComponent(fullProjectPath)}`
      );
      const result = await response.json();

      if (result.exists && !result.isDirectory) {
        setError("Project path is not a directory");
        setIsValidating(false);
        return;
      }

      setUseExternalImageStorage(externalStorage);
      if (mode === "duplicate" && onDuplicate) {
        onDuplicate(name.trim(), fullProjectPath);
      } else {
        const id = mode === "new" ? generateWorkflowId() : useWorkflowStore.getState().workflowId || generateWorkflowId();
        onSave(id, name.trim(), fullProjectPath);
      }
      setIsValidating(false);
    } catch (err) {
      setError(
        `Failed to validate directory: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setIsValidating(false);
    }
  };

  const handleSaveProviders = () => {
    // Save each provider's settings
    const providerIds: ProviderType[] = ["gemini", "openai", "anthropic", "replicate", "fal", "kie", "wavespeed"];
    for (const providerId of providerIds) {
      const local = localProviders.providers[providerId];
      const current = providerSettings.providers[providerId];

      if (!local || !current) continue;

      // Update enabled state if changed
      if (local.enabled !== current.enabled) {
        toggleProvider(providerId, local.enabled);
      }

      // Update API key if changed
      if (local.apiKey !== current.apiKey) {
        updateProviderApiKey(providerId, local.apiKey);
      }
    }
    onClose();
  };

  const handleSaveNodeDefaults = () => {
    saveNodeDefaults(localNodeDefaults);
    onClose();
  };

  const handleSaveCanvas = () => {
    updateCanvasNavigationSettings(localCanvasSettings);
    onClose();
  };

  const handleSave = () => {
    if (activeTab === "preferences") {
      handleSaveGeneral();
      handleSaveCanvas();
      saveNodeDefaults(localNodeDefaults);
    } else if (activeTab === "project") {
      handleSaveProject();
    } else if (activeTab === "providers") {
      handleSaveProviders();
    } else {
      handleSaveNodeDefaults();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isValidating && !isBrowsing) {
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const updateLocalProvider = (
    providerId: ProviderType,
    updates: { enabled?: boolean; apiKey?: string | null }
  ) => {
    setLocalProviders((prev) => ({
      providers: {
        ...prev.providers,
        [providerId]: {
          ...prev.providers[providerId],
          ...updates,
        },
      },
    }));
  };

  if (!isOpen) return null;

  const tabs = [
    { id: "preferences" as const, label: "Preferences", icon: SlidersHorizontal },
    { id: "project" as const, label: "Project", icon: FolderOpen },
    { id: "providers" as const, label: "Providers", icon: Key },
    { id: "nodeDefaults" as const, label: "Node Defaults", icon: Box },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <div
        className="h-[720px] w-[90%] max-w-[1440px] rounded-2xl border border-neutral-700/80 bg-neutral-900/95 shadow-2xl overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-full w-auto gap-6 min-h-0">
          {/* Sidebar - hide when duplicate */}
          {mode !== "duplicate" && (
            <div
              role="tablist"
              aria-orientation="vertical"
              className="flex shrink-0 flex-col gap-0 w-[228px] items-stretch border-r border-neutral-700/50 bg-neutral-900/80 p-3"
            >
              <div className="px-2 py-1.5 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Settings
              </div>
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex h-8 flex-row items-center gap-2 border-none p-2 rounded-lg w-full text-left transition-colors duration-200 ${
                      isActive
                        ? "bg-neutral-700/80 text-white font-medium border-b-0"
                        : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Content area */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between px-8 pt-8 pb-4">
              <h2 className="text-xl font-semibold text-neutral-100">
                {mode === "new" ? "New Project" : mode === "duplicate" ? "Duplicate Project" : activeTab === "project" && name.trim()
                  ? `Project (${name.trim()})`
                  : tabs.find((t) => t.id === activeTab)?.label ?? "Settings"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-8 pb-8">

        {/* Preferences Tab - app-wide preferences + canvas */}
        {activeTab === "preferences" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="text-xs text-neutral-500 mb-2">
                App-wide defaults. Used for all new projects and the projects list.
              </p>
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Default project directory
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={defaultProjectDirectory}
                    onChange={(e) => setDefaultProjectDirectoryLocal(e.target.value)}
                    placeholder="/Users/username/projects"
                    className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseDefault}
                    disabled={isBrowsingDefault}
                    className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-sm rounded-lg transition-colors"
                  >
                    {isBrowsingDefault ? "..." : "Browse"}
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Base folder for the projects list and for creating new projects. Set once and reuse for all projects.
                </p>
              </div>
            </div>

            <div className="border-t border-neutral-700/50 pt-6 space-y-3">
              <p className="text-xs text-neutral-500 mb-2">Canvas navigation and interaction.</p>
              {/* Edge Style */}
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-100">Edge Style</span>
                    <p className="text-xs text-neutral-400">
                      {edgeStyle === "angular" && "Straight lines with right angles"}
                      {edgeStyle === "curved" && "Smooth curved connectors"}
                    </p>
                  </div>
                  <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                    <button
                      type="button"
                      onClick={() => setEdgeStyle("angular")}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 flex items-center justify-center gap-1.5 ${
                        edgeStyle === "angular"
                          ? "bg-neutral-700 text-neutral-100 font-medium"
                          : "text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h4l4-8 4 8h4" />
                      </svg>
                      Angular
                    </button>
                    <button
                      type="button"
                      onClick={() => setEdgeStyle("curved")}
                      className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 flex items-center justify-center gap-1.5 ${
                        edgeStyle === "curved"
                          ? "bg-neutral-700 text-neutral-100 font-medium"
                          : "text-neutral-400 hover:text-neutral-300"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c0 0 4-8 8-8s8 8 8 8" />
                      </svg>
                      Curved
                    </button>
                  </div>
                </div>
              </div>
              {/* Pan Mode */}
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-100">Pan Mode</span>
                    <p className="text-xs text-neutral-400">
                      {localCanvasSettings.panMode === "space" && "Hold Space and drag to pan"}
                      {localCanvasSettings.panMode === "middleMouse" && "Click and drag with middle mouse button"}
                      {localCanvasSettings.panMode === "always" && "Pan without holding any keys"}
                    </p>
                  </div>
                  <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                    {([
                      { value: "space" as PanMode, label: "Space + Drag" },
                      { value: "middleMouse" as PanMode, label: "Middle Mouse" },
                      { value: "always" as PanMode, label: "Always On" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, panMode: option.value })}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                          localCanvasSettings.panMode === option.value
                            ? "bg-neutral-700 text-neutral-100 font-medium"
                            : "text-neutral-400 hover:text-neutral-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Zoom Mode */}
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-100">Zoom Mode</span>
                    <p className="text-xs text-neutral-400">
                      {localCanvasSettings.zoomMode === "altScroll" && "Hold Alt and scroll to zoom"}
                      {localCanvasSettings.zoomMode === "ctrlScroll" && "Hold Ctrl/Cmd and scroll to zoom"}
                      {localCanvasSettings.zoomMode === "scroll" && "Scroll to zoom without modifier keys"}
                    </p>
                  </div>
                  <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                    {([
                      { value: "altScroll" as ZoomMode, label: "Alt + Scroll" },
                      { value: "ctrlScroll" as ZoomMode, label: "Ctrl + Scroll" },
                      { value: "scroll" as ZoomMode, label: "Scroll" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, zoomMode: option.value })}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                          localCanvasSettings.zoomMode === option.value
                            ? "bg-neutral-700 text-neutral-100 font-medium"
                            : "text-neutral-400 hover:text-neutral-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Selection Mode */}
              <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-100">Selection Mode</span>
                    <p className="text-xs text-neutral-400">
                      {localCanvasSettings.selectionMode === "click" && "Click to select nodes"}
                      {localCanvasSettings.selectionMode === "altDrag" && "Hold Alt and drag to select"}
                      {localCanvasSettings.selectionMode === "shiftDrag" && "Hold Shift and drag to select"}
                    </p>
                  </div>
                  <div className="flex gap-1 p-0.5 bg-neutral-800 rounded-md">
                    {([
                      { value: "click" as SelectionMode, label: "Click" },
                      { value: "altDrag" as SelectionMode, label: "Alt + Drag" },
                      { value: "shiftDrag" as SelectionMode, label: "Shift + Drag" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLocalCanvasSettings({ ...localCanvasSettings, selectionMode: option.value })}
                        className={`flex-1 px-2 py-1.5 text-xs rounded transition-all duration-150 ${
                          localCanvasSettings.selectionMode === option.value
                            ? "bg-neutral-700 text-neutral-100 font-medium"
                            : "text-neutral-400 hover:text-neutral-300"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Default model selection - which model auto-selects when creating new nodes */}
            <div className="border-t border-neutral-700/50 pt-6 space-y-3">
              <p className="text-xs text-neutral-500 mb-2">Which model is auto-selected when creating new nodes. Configure the list in Node Defaults.</p>
              {/* Image default */}
              <div className="flex items-center justify-between gap-4 py-2">
                <label className="text-sm text-neutral-300 shrink-0 w-24">Image</label>
                <select
                  value={(() => {
                    const models = localNodeDefaults.generateImage?.selectedModels ?? (localNodeDefaults.generateImage?.selectedModel ? [localNodeDefaults.generateImage.selectedModel] : []);
                    const idx = localNodeDefaults.generateImage?.defaultModelIndex ?? 0;
                    return models.length > 0 ? Math.min(idx, models.length - 1) : 0;
                  })()}
                  onChange={(e) => setLocalNodeDefaults(prev => ({
                    ...prev,
                    generateImage: { ...prev.generateImage, defaultModelIndex: parseInt(e.target.value, 10) },
                  }))}
                  className="flex-1 max-w-xs px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  {(() => {
                    const models = localNodeDefaults.generateImage?.selectedModels ?? (localNodeDefaults.generateImage?.selectedModel ? [localNodeDefaults.generateImage.selectedModel] : []);
                    return models.length > 0
                      ? models.map((m, i) => <option key={i} value={i}>{m.displayName}</option>)
                      : <option value={0}>Add models in Node Defaults</option>;
                  })()}
                </select>
              </div>
              {/* Video default */}
              <div className="flex items-center justify-between gap-4 py-2">
                <label className="text-sm text-neutral-300 shrink-0 w-24">Video</label>
                <select
                  value={(() => {
                    const models = localNodeDefaults.generateVideo?.selectedModels ?? (localNodeDefaults.generateVideo?.selectedModel ? [localNodeDefaults.generateVideo.selectedModel] : []);
                    const idx = localNodeDefaults.generateVideo?.defaultModelIndex ?? 0;
                    return models.length > 0 ? Math.min(idx, models.length - 1) : 0;
                  })()}
                  onChange={(e) => setLocalNodeDefaults(prev => ({
                    ...prev,
                    generateVideo: { ...prev.generateVideo, defaultModelIndex: parseInt(e.target.value, 10) },
                  }))}
                  className="flex-1 max-w-xs px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  {(() => {
                    const models = localNodeDefaults.generateVideo?.selectedModels ?? (localNodeDefaults.generateVideo?.selectedModel ? [localNodeDefaults.generateVideo.selectedModel] : []);
                    return models.length > 0
                      ? models.map((m, i) => <option key={i} value={i}>{m.displayName}</option>)
                      : <option value={0}>Add models in Node Defaults</option>;
                  })()}
                </select>
              </div>
              {/* 3D default */}
              <div className="flex items-center justify-between gap-4 py-2">
                <label className="text-sm text-neutral-300 shrink-0 w-24">3D</label>
                <select
                  value={(() => {
                    const models = localNodeDefaults.generate3d?.selectedModels ?? (localNodeDefaults.generate3d?.selectedModel ? [localNodeDefaults.generate3d.selectedModel] : []);
                    const idx = localNodeDefaults.generate3d?.defaultModelIndex ?? 0;
                    return models.length > 0 ? Math.min(idx, models.length - 1) : 0;
                  })()}
                  onChange={(e) => setLocalNodeDefaults(prev => ({
                    ...prev,
                    generate3d: { ...prev.generate3d, defaultModelIndex: parseInt(e.target.value, 10) },
                  }))}
                  className="flex-1 max-w-xs px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  {(() => {
                    const models = localNodeDefaults.generate3d?.selectedModels ?? (localNodeDefaults.generate3d?.selectedModel ? [localNodeDefaults.generate3d.selectedModel] : []);
                    return models.length > 0
                      ? models.map((m, i) => <option key={i} value={i}>{m.displayName}</option>)
                      : <option value={0}>Add models in Node Defaults</option>;
                  })()}
                </select>
              </div>
              {/* LLM default */}
              <div className="flex items-center justify-between gap-4 py-2">
                <label className="text-sm text-neutral-300 shrink-0 w-24">LLM</label>
                <select
                  value={(() => {
                    const presets = localNodeDefaults.llmPresets ?? (localNodeDefaults.llm ? [localNodeDefaults.llm] : []);
                    const idx = localNodeDefaults.defaultLlmPresetIndex ?? 0;
                    return presets.length > 0 ? Math.min(idx, presets.length - 1) : 0;
                  })()}
                  onChange={(e) => setLocalNodeDefaults(prev => ({
                    ...prev,
                    defaultLlmPresetIndex: parseInt(e.target.value, 10),
                  }))}
                  className="flex-1 max-w-xs px-3 py-2 text-sm bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 focus:outline-none focus:border-neutral-500"
                >
                  {(() => {
                    const presets = localNodeDefaults.llmPresets ?? (localNodeDefaults.llm ? [localNodeDefaults.llm] : []);
                    return presets.length > 0
                      ? presets.map((p, i) => (
                          <option key={i} value={i}>
                            {LLM_PROVIDERS.find(x => x.value === p.provider)?.label ?? p.provider} / {LLM_MODELS[p.provider || "google"]?.find(m => m.value === p.model)?.label ?? p.model}
                          </option>
                        ))
                      : <option value={0}>Add presets in Node Defaults</option>;
                  })()}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Project Tab - this project only */}
        {activeTab === "project" && (
          <div className="space-y-4">
            <p className="text-xs text-neutral-500 mb-2">
              Settings for this project only.
            </p>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Project Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
                autoFocus
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Project directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directoryPath}
                  onChange={(e) => setDirectoryPath(e.target.value)}
                  placeholder="/Users/username/projects/my-project"
                  className="flex-1 px-3 py-2 bg-neutral-900 border border-neutral-600 rounded-lg text-neutral-100 text-sm focus:outline-none focus:border-neutral-500"
                />
                <button
                  type="button"
                  onClick={handleBrowse}
                  disabled={isBrowsing}
                  className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-sm rounded-lg transition-colors"
                >
                  {isBrowsing ? "..." : "Browse"}
                </button>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Save location for this project. When creating new, this is pre-filled from the default directory in General.
              </p>
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Project thumbnail
              </label>
              <div className="flex gap-3 items-start">
                <div className="w-24 h-14 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-600 shrink-0">
                  {(localThumbnail || workflowThumbnail) ? (
                    <img
                      src={localThumbnail || workflowThumbnail || ""}
                      alt="Thumbnail"
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
                <div className="flex flex-col gap-1.5 flex-1">
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
                    className="px-3 py-1.5 text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded-lg transition-colors"
                  >
                    Upload image
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalThumbnail("/thumbnail.jpeg");
                      setWorkflowThumbnail("/thumbnail.jpeg");
                    }}
                    className="px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
                  >
                    Use default
                  </button>
                </div>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                Cover image for the project card. JPG, PNG, or WebP.
              </p>
            </div>

            <div className="pt-2 border-t border-neutral-700">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-sm text-neutral-200">Embed images as base64</span>
                  <p className="text-xs text-neutral-400">
                    Embeds all images in workflow, larger workflow files. Can hit memory limits on very large workflows.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!externalStorage}
                  onClick={() => setExternalStorage(externalStorage ? false : true)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${!externalStorage ? "bg-blue-500" : "bg-neutral-600"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${!externalStorage ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </button>
              </label>
            </div>

            <div className="pt-2 border-t border-neutral-700">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div>
                  <span className="text-sm text-neutral-200">Show model settings on nodes</span>
                  <p className="text-xs text-neutral-400">
                    Show model parameters inside generation nodes instead of the side panel
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={inlineParametersEnabled}
                  onClick={() => setInlineParameters(!inlineParametersEnabled)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${inlineParametersEnabled ? "bg-blue-500" : "bg-neutral-600"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${inlineParametersEnabled ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </button>
              </label>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        )}

        {/* Providers Tab Content */}
        {activeTab === "providers" && (
          <div className="space-y-3">
            {/* Gemini Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">Google Gemini</span>
                {envStatus?.gemini && !overrideActive.gemini ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, gemini: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.gemini ? "text" : "password"}
                      value={localProviders.providers.gemini?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("gemini", { apiKey: e.target.value || null })}
                      placeholder="AIza..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, gemini: !prev.gemini }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.gemini ? "Hide" : "Show"}
                    </button>
                    {envStatus?.gemini && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, gemini: false }));
                          updateLocalProvider("gemini", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* OpenAI Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">OpenAI</span>
                {envStatus?.openai && !overrideActive.openai ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, openai: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.openai ? "text" : "password"}
                      value={localProviders.providers.openai?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("openai", { apiKey: e.target.value || null })}
                      placeholder="sk-..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, openai: !prev.openai }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.openai ? "Hide" : "Show"}
                    </button>
                    {envStatus?.openai && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, openai: false }));
                          updateLocalProvider("openai", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Anthropic Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">Anthropic</span>
                {envStatus?.anthropic && !overrideActive.anthropic ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, anthropic: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.anthropic ? "text" : "password"}
                      value={localProviders.providers.anthropic?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("anthropic", { apiKey: e.target.value || null })}
                      placeholder="sk-ant-..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, anthropic: !prev.anthropic }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.anthropic ? "Hide" : "Show"}
                    </button>
                    {envStatus?.anthropic && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, anthropic: false }));
                          updateLocalProvider("anthropic", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Replicate Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">Replicate</span>
                {envStatus?.replicate && !overrideActive.replicate ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, replicate: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.replicate ? "text" : "password"}
                      value={localProviders.providers.replicate?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("replicate", { apiKey: e.target.value || null })}
                      placeholder="r8_..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, replicate: !prev.replicate }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.replicate ? "Hide" : "Show"}
                    </button>
                    {envStatus?.replicate && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, replicate: false }));
                          updateLocalProvider("replicate", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* fal.ai Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">fal.ai</span>
                {envStatus?.fal && !overrideActive.fal ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, fal: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.fal ? "text" : "password"}
                      value={localProviders.providers.fal?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("fal", { apiKey: e.target.value || null })}
                      placeholder="..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, fal: !prev.fal }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.fal ? "Hide" : "Show"}
                    </button>
                    {envStatus?.fal && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, fal: false }));
                          updateLocalProvider("fal", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Kie.ai Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">Kie.ai</span>
                {envStatus?.kie && !overrideActive.kie ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, kie: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.kie ? "text" : "password"}
                      value={localProviders.providers.kie?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("kie", { apiKey: e.target.value || null })}
                      placeholder="..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, kie: !prev.kie }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.kie ? "Hide" : "Show"}
                    </button>
                    {envStatus?.kie && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, kie: false }));
                          updateLocalProvider("kie", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* WaveSpeed Provider */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">WaveSpeed</span>
                {envStatus?.wavespeed && !overrideActive.wavespeed ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">Configured via .env</span>
                    <button
                      type="button"
                      onClick={() => setOverrideActive((prev) => ({ ...prev, wavespeed: true }))}
                      className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                    >
                      Override
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type={showApiKey.wavespeed ? "text" : "password"}
                      value={localProviders.providers.wavespeed?.apiKey || ""}
                      onChange={(e) => updateLocalProvider("wavespeed", { apiKey: e.target.value || null })}
                      placeholder="..."
                      className="w-48 px-2 py-1 bg-neutral-800 border border-neutral-600 rounded-lg text-neutral-100 text-xs focus:outline-none focus:border-neutral-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((prev) => ({ ...prev, wavespeed: !prev.wavespeed }))}
                      className="text-xs text-neutral-400 hover:text-neutral-200"
                    >
                      {showApiKey.wavespeed ? "Hide" : "Show"}
                    </button>
                    {envStatus?.wavespeed && (
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideActive((prev) => ({ ...prev, wavespeed: false }));
                          updateLocalProvider("wavespeed", { apiKey: null });
                        }}
                        className="text-xs text-neutral-500 hover:text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-neutral-400 mt-2">
              Add API keys via <code className="px-1 py-0.5 bg-neutral-800 rounded">.env.local</code> for better security. Keys added here override .env and are stored in your browser.
            </p>
          </div>
        )}

        {/* Node Defaults Tab Content */}
        {activeTab === "nodeDefaults" && (
          <div className="space-y-3">
            {/* GenerateImage Section */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-neutral-100">Default Image Models</span>
                <p className="text-xs text-neutral-500">Multiple models available when creating new image nodes. First is default.</p>
                {(() => {
                  const models = localNodeDefaults.generateImage?.selectedModels ?? (localNodeDefaults.generateImage?.selectedModel ? [localNodeDefaults.generateImage.selectedModel] : []);
                  return (
                    <div className="space-y-2">
                      {models.map((m, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-neutral-800/50 rounded">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
                            {getProviderIcon(m.provider)}
                            <span className="truncate">{m.displayName}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setModelDialogReplace({ key: "generateImage", index: i }); setShowImageModelDialog(true); }} className="px-2 py-0.5 text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded">Change</button>
                            <button type="button" onClick={() => {
                              const arr = models.filter((_, j) => j !== i);
                              setLocalNodeDefaults(prev => ({
                                ...prev,
                                generateImage: arr.length ? { ...prev.generateImage, selectedModels: arr } : undefined,
                              }));
                            }} className="text-neutral-500 hover:text-red-400 text-xs">×</button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => { setModelDialogReplace(null); setShowImageModelDialog(true); }} className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors">
                        {models.length ? "Add Model" : "Select Model"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* GenerateVideo Section */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-neutral-100">Default Video Models</span>
                <p className="text-xs text-neutral-500">Multiple models available when creating new video nodes.</p>
                {(() => {
                  const models = localNodeDefaults.generateVideo?.selectedModels ?? (localNodeDefaults.generateVideo?.selectedModel ? [localNodeDefaults.generateVideo.selectedModel] : []);
                  return (
                    <div className="space-y-2">
                      {models.map((m, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-neutral-800/50 rounded">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
                            {getProviderIcon(m.provider)}
                            <span className="truncate">{m.displayName}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setModelDialogReplace({ key: "generateVideo", index: i }); setShowVideoModelDialog(true); }} className="px-2 py-0.5 text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded">Change</button>
                            <button type="button" onClick={() => {
                              const arr = models.filter((_, j) => j !== i);
                              setLocalNodeDefaults(prev => ({
                                ...prev,
                                generateVideo: arr.length ? { ...prev.generateVideo, selectedModels: arr } : undefined,
                              }));
                            }} className="text-neutral-500 hover:text-red-400 text-xs">×</button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => { setModelDialogReplace(null); setShowVideoModelDialog(true); }} className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors">
                        {models.length ? "Add Model" : "Select Model"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Generate3D Section */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-neutral-100">Default 3D Models</span>
                <p className="text-xs text-neutral-500">Multiple models available when creating new 3D nodes.</p>
                {(() => {
                  const models = localNodeDefaults.generate3d?.selectedModels ?? (localNodeDefaults.generate3d?.selectedModel ? [localNodeDefaults.generate3d.selectedModel] : []);
                  return (
                    <div className="space-y-2">
                      {models.map((m, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-neutral-800/50 rounded">
                          <div className="flex items-center gap-1.5 text-xs text-neutral-300 min-w-0">
                            {getProviderIcon(m.provider)}
                            <span className="truncate">{m.displayName}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => { setModelDialogReplace({ key: "generate3d", index: i }); setShow3dModelDialog(true); }} className="px-2 py-0.5 text-[10px] bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded">Change</button>
                            <button type="button" onClick={() => {
                              const arr = models.filter((_, j) => j !== i);
                              setLocalNodeDefaults(prev => ({
                                ...prev,
                                generate3d: arr.length ? { ...prev.generate3d, selectedModels: arr } : undefined,
                              }));
                            }} className="text-neutral-500 hover:text-red-400 text-xs">×</button>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={() => { setModelDialogReplace(null); setShow3dModelDialog(true); }} className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors">
                        {models.length ? "Add Model" : "Select Model"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* LLM Section - multiple presets */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-neutral-100">Default LLM Presets</span>
                <p className="text-xs text-neutral-500">Multiple presets available for prompt nodes. First is default.</p>
                {(() => {
                  const presets = localNodeDefaults.llmPresets ?? (localNodeDefaults.llm ? [localNodeDefaults.llm] : []);
                  const updatePreset = (i: number, updates: Partial<LLMNodeDefaults>) => {
                    const next = presets.map((p, j) => j === i ? { ...p, ...updates } : p);
                    setLocalNodeDefaults(prev => ({
                      ...prev,
                      llmPresets: next,
                      llm: next.length === 1 ? next[0] : undefined,
                    }));
                  };
                  const addPreset = () => {
                    const def: LLMNodeDefaults = { provider: "google", model: "gemini-3-flash-preview", temperature: 0.7, maxTokens: 8192 };
                    setLocalNodeDefaults(prev => ({
                      ...prev,
                      llmPresets: [...(prev.llmPresets ?? (prev.llm ? [prev.llm] : [])), def],
                      llm: undefined,
                    }));
                  };
                  const removePreset = (i: number) => {
                    const next = presets.filter((_, j) => j !== i);
                    setLocalNodeDefaults(prev => ({
                      ...prev,
                      llmPresets: next.length ? next : undefined,
                      llm: next.length === 1 ? next[0] : undefined,
                    }));
                  };
                  return (
                    <div className="space-y-3">
                      {presets.map((p, i) => (
                        <div key={i} className="p-2 bg-neutral-800/50 rounded border border-neutral-700 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-neutral-300">Preset {i + 1}</span>
                            <button type="button" onClick={() => removePreset(i)} className="text-neutral-500 hover:text-red-400 text-xs">×</button>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-neutral-500 w-16">Provider</label>
                            <select
                              value={p.provider || "google"}
                              onChange={(e) => {
                                const prov = e.target.value as LLMProvider;
                                updatePreset(i, { provider: prov, model: LLM_MODELS[prov][0].value });
                              }}
                              className="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-100"
                            >
                              {LLM_PROVIDERS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-neutral-500 w-16">Model</label>
                            <select
                              value={p.model || LLM_MODELS[p.provider || "google"][0].value}
                              onChange={(e) => updatePreset(i, { model: e.target.value as LLMModelType })}
                              className="flex-1 px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-100"
                            >
                              {LLM_MODELS[p.provider || "google"].map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-neutral-500 w-16">Temp</label>
                            <input type="range" min="0" max={(p.provider || "google") === "anthropic" ? "1" : "2"} step="0.1" value={p.temperature ?? 0.7}
                              onChange={(e) => updatePreset(i, { temperature: parseFloat(e.target.value) })}
                              className="flex-1 h-1 bg-neutral-700 rounded accent-neutral-400" />
                            <span className="text-xs text-neutral-400 w-8">{(p.temperature ?? 0.7).toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-neutral-500 w-16">Tokens</label>
                            <input type="range" min="256" max="16384" step="256" value={p.maxTokens ?? 8192}
                              onChange={(e) => updatePreset(i, { maxTokens: parseInt(e.target.value, 10) })}
                              className="flex-1 h-1 bg-neutral-700 rounded accent-neutral-400" />
                            <span className="text-xs text-neutral-400 w-12">{(p.maxTokens ?? 8192).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                      <button type="button" onClick={addPreset} className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-200 rounded transition-colors">
                        {presets.length ? "Add Preset" : "Add Preset (uses system default until set)"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Execution Section */}
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-700">
              <div className="flex flex-col gap-3">
                <span className="text-sm font-medium text-neutral-100">Execution Settings</span>

                {/* Concurrency slider */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-400 w-32">
                    Max Parallel Calls: {maxConcurrentCalls}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={maxConcurrentCalls}
                    onChange={(e) => setMaxConcurrentCalls(parseInt(e.target.value, 10))}
                    className="flex-1 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-neutral-400"
                  />
                </div>
                <p className="text-xs text-neutral-400">
                  Maximum number of nodes to execute in parallel during workflow execution.
                  Higher values may improve speed but increase API rate limit risk.
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mt-2">
              These defaults are applied when creating nodes via keyboard shortcuts (Shift+G, Shift+L, etc).
            </p>
          </div>
        )}

        </div>

            {/* Fixed footer */}
            <div className="flex justify-end gap-2 px-8 py-5 border-t border-neutral-700/50 shrink-0">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={activeTab === "project" && (isValidating || isBrowsing)}
                className="px-4 py-2 text-sm bg-white text-neutral-900 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {activeTab === "project"
                  ? (isValidating ? "Validating..." : mode === "new" ? "Create" : mode === "duplicate" ? "Duplicate" : "Save")
                  : "Save"
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Model Selection Dialogs - wrapped in ReactFlowProvider for useReactFlow (required even when only selecting, not adding nodes) */}
      {showImageModelDialog && (
        <ReactFlowProvider>
          <ModelSearchDialog
            isOpen={showImageModelDialog}
            onClose={() => { setShowImageModelDialog(false); setModelDialogReplace(null); }}
            onModelSelected={(model: ProviderModel) => {
              const entry = { provider: model.provider, modelId: model.id, displayName: model.name };
              const models = localNodeDefaults.generateImage?.selectedModels ?? (localNodeDefaults.generateImage?.selectedModel ? [localNodeDefaults.generateImage.selectedModel] : []);
              const rep = modelDialogReplace?.key === "generateImage" ? modelDialogReplace : null;
              const newModels = rep ? models.map((m, i) => i === rep.index ? entry : m) : [...models, entry];
              setLocalNodeDefaults(prev => ({
                ...prev,
                generateImage: { ...prev.generateImage, selectedModels: newModels }
              }));
              setShowImageModelDialog(false);
              setModelDialogReplace(null);
            }}
            initialCapabilityFilter="image"
          />
        </ReactFlowProvider>
      )}
      {showVideoModelDialog && (
        <ReactFlowProvider>
          <ModelSearchDialog
            isOpen={showVideoModelDialog}
            onClose={() => { setShowVideoModelDialog(false); setModelDialogReplace(null); }}
            onModelSelected={(model: ProviderModel) => {
              const entry = { provider: model.provider, modelId: model.id, displayName: model.name };
              const models = localNodeDefaults.generateVideo?.selectedModels ?? (localNodeDefaults.generateVideo?.selectedModel ? [localNodeDefaults.generateVideo.selectedModel] : []);
              const rep = modelDialogReplace?.key === "generateVideo" ? modelDialogReplace : null;
              const newModels = rep ? models.map((m, i) => i === rep.index ? entry : m) : [...models, entry];
              setLocalNodeDefaults(prev => ({
                ...prev,
                generateVideo: { ...prev.generateVideo, selectedModels: newModels }
              }));
              setShowVideoModelDialog(false);
              setModelDialogReplace(null);
            }}
            initialCapabilityFilter="video"
          />
        </ReactFlowProvider>
      )}
      {show3dModelDialog && (
        <ReactFlowProvider>
          <ModelSearchDialog
            isOpen={show3dModelDialog}
            onClose={() => { setShow3dModelDialog(false); setModelDialogReplace(null); }}
            onModelSelected={(model: ProviderModel) => {
              const entry = { provider: model.provider, modelId: model.id, displayName: model.name };
              const models = localNodeDefaults.generate3d?.selectedModels ?? (localNodeDefaults.generate3d?.selectedModel ? [localNodeDefaults.generate3d.selectedModel] : []);
              const rep = modelDialogReplace?.key === "generate3d" ? modelDialogReplace : null;
              const newModels = rep ? models.map((m, i) => i === rep.index ? entry : m) : [...models, entry];
              setLocalNodeDefaults(prev => ({
                ...prev,
                generate3d: { ...prev.generate3d, selectedModels: newModels }
              }));
              setShow3dModelDialog(false);
              setModelDialogReplace(null);
            }}
            initialCapabilityFilter="3d"
          />
        </ReactFlowProvider>
      )}
    </div>
  );
}
