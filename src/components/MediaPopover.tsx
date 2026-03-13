"use client";

import { useWorkflowStore } from "@/store/workflowStore";
import { useReactFlow } from "@xyflow/react";
import { Search, X, LayoutGrid, List, Plus, Shapes, History } from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { collectMediaItems, type MediaItem } from "@/lib/media-collector";

interface UploadedFile extends MediaItem {
  nodeType?: string;
  updatedAt?: string | Date | null;
  prompt?: string;
}

function getPaneCenter() {
  const pane = document.querySelector(".react-flow");
  if (pane) {
    const rect = pane.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export const MediaPopover = () => {
  const addNode = useWorkflowStore((state) => state.addNode);
  const nodes = useWorkflowStore((state) => state.nodes);
  const { getViewport, screenToFlowPosition } = useReactFlow();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [generatedItems, setGeneratedItems] = useState<UploadedFile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"uploaded" | "generated">("uploaded");
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaItems = collectMediaItems(nodes);
    const uploaded: UploadedFile[] = [];
    const generated: UploadedFile[] = [];

    nodes.forEach((node) => {
      const data = node.data as Record<string, unknown>;
      if (node.type === "imageInput" && data.image) {
        uploaded.push({
          url: data.image as string,
          type: "image",
          nodeId: node.id,
          nodeType: "imageInput",
        });
      }
      if (node.type === "annotation") {
        const img = (data.outputImage ?? data.sourceImage) as string | null | undefined;
        if (img && (img.startsWith("data:") || img.startsWith("http") || img.startsWith("blob:"))) {
          uploaded.push({ url: img, type: "image", nodeId: node.id, nodeType: "annotation" });
        }
      }
      if (node.type === "generateImage" && data.outputImage) {
        const url = data.outputImage as string;
        if (url.startsWith("data:") || url.startsWith("http") || url.startsWith("blob:")) {
          generated.push({
            url,
            type: "image",
            nodeId: node.id,
            nodeType: "generateImage",
            prompt: data.prompt as string | undefined,
          });
        }
      }
      if (node.type === "generateVideo" && data.outputVideo) {
        const url = data.outputVideo as string;
        if (url.startsWith("data:") || url.startsWith("http") || url.startsWith("blob:")) {
          generated.push({
            url,
            type: "video",
            nodeId: node.id,
            nodeType: "generateVideo",
            prompt: data.prompt as string | undefined,
          });
        }
      }
    });

    setUploadedFiles(uploaded);
    setGeneratedItems(generated);
  }, [nodes, open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filteredUploaded = useMemo(() => {
    if (!searchQuery) return uploadedFiles;
    const q = searchQuery.toLowerCase();
    return uploadedFiles.filter((f) => f.url.toLowerCase().includes(q) || f.nodeType?.toLowerCase().includes(q));
  }, [uploadedFiles, searchQuery]);

  const filteredGenerated = useMemo(() => {
    if (!searchQuery) return generatedItems;
    const q = searchQuery.toLowerCase();
    return generatedItems.filter(
      (f) =>
        f.url.toLowerCase().includes(q) ||
        f.nodeType?.toLowerCase().includes(q) ||
        (f.prompt && f.prompt.toLowerCase().includes(q))
    );
  }, [generatedItems, searchQuery]);

  const currentItems = activeTab === "uploaded" ? filteredUploaded : filteredGenerated;
  const isEmpty = currentItems.length === 0;

  const addNodeAtCenter = (type: "imageInput" | "annotation" | "generateImage" | "generateVideo", data?: Record<string, unknown>) => {
    const center = getPaneCenter();
    const position = screenToFlowPosition({
      x: center.x + Math.random() * 80 - 40,
      y: center.y + Math.random() * 80 - 40,
    });
    addNode(type, position, data);
    setOpen(false);
  };

  const handleFileSelect = (file: UploadedFile) => {
    if (file.nodeType === "imageInput") {
      addNodeAtCenter("imageInput", { image: file.url, imageRef: undefined, filename: null, dimensions: null });
    } else if (file.nodeType === "annotation") {
      addNodeAtCenter("annotation", { sourceImage: file.url, outputImage: null, annotations: [] });
    } else {
      addNodeAtCenter("imageInput", { image: file.url, imageRef: undefined, filename: null, dimensions: null });
    }
  };

  const handleGeneratedSelect = (item: UploadedFile) => {
    if (item.type === "video") {
      addNodeAtCenter("generateVideo", { outputVideo: item.url, prompt: item.prompt });
    } else {
      addNodeAtCenter("generateImage", { outputImage: item.url, prompt: item.prompt });
    }
  };

  const getFileExtension = (url: string): string => {
    const match = url.match(/\.([^.]+)(\?|$)/);
    return match ? match[1].toUpperCase() : "IMG";
  };

  const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(date));
    } catch {
      return "";
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center h-10 w-10 shrink-0 rounded-lg text-[var(--color-greyscale-400)] transition-all duration-300 hover:bg-white/5 hover:text-[var(--color-text-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        title="Media library"
        data-id="media-popover-button"
      >
        <Shapes className="h-5 w-5" strokeWidth={2} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-full top-0 ml-2 w-[425px] h-[436px] rounded-2xl border border-neutral-600 bg-neutral-900/95 backdrop-blur-sm shadow-xl z-[100] flex flex-col overflow-hidden"
          style={{ backgroundColor: "var(--background-transparent-black-default)" }}
        >
          <div className="border-b border-neutral-700 p-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 border border-neutral-600 rounded-lg bg-neutral-800">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                <input
                  placeholder="Search media..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-full bg-transparent pl-8 pr-4 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none rounded-lg"
                  type="text"
                />
              </div>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`h-8 w-8 rounded flex items-center justify-center ${viewMode === "grid" ? "bg-neutral-700" : ""}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`h-8 w-8 rounded flex items-center justify-center ${viewMode === "list" ? "bg-neutral-700" : ""}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded flex items-center justify-center hover:bg-neutral-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1 mt-2">
              <button
                type="button"
                onClick={() => setActiveTab("uploaded")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm font-medium ${
                  activeTab === "uploaded" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <Shapes className="h-3 w-3" />
                Uploaded ({uploadedFiles.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("generated")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded text-sm font-medium ${
                  activeTab === "generated" ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <History className="h-3 w-3" />
                Generated ({generatedItems.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
                <p className="text-sm text-neutral-500">
                  {searchQuery ? "No items found" : activeTab === "uploaded" ? "No uploaded files yet" : "No generated content yet"}
                </p>
                {!searchQuery && activeTab === "uploaded" && (
                  <button
                    type="button"
                    onClick={() => addNodeAtCenter("imageInput")}
                    className="flex items-center gap-2 px-3 py-1.5 rounded border border-neutral-600 text-sm hover:bg-neutral-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add Image Input
                  </button>
                )}
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-3 gap-2">
                {activeTab === "uploaded" && (
                  <button
                    type="button"
                    onClick={() => addNodeAtCenter("imageInput")}
                    className="h-32 w-full border-2 border-dashed border-neutral-600 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-neutral-800/50 text-neutral-400"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-xs">Upload</span>
                  </button>
                )}
                {activeTab === "uploaded"
                  ? filteredUploaded.map((file, i) => (
                      <button
                        key={`${file.nodeId}-${i}`}
                        type="button"
                        className="relative h-32 w-full rounded-lg overflow-hidden border border-neutral-600 hover:border-neutral-500 text-left"
                        onClick={() => handleFileSelect(file)}
                      >
                        {file.type === "image" ? (
                          <Image src={file.url} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <div className="h-full w-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-500">Video</div>
                        )}
                        <div className="absolute left-2 top-2 px-1.5 py-0.5 rounded bg-black/60 text-xs font-medium">
                          {getFileExtension(file.url)}
                        </div>
                      </button>
                    ))
                  : filteredGenerated.map((item, i) => (
                      <button
                        key={`${item.nodeId}-${i}`}
                        type="button"
                        className="relative h-32 w-full rounded-lg overflow-hidden border border-neutral-600 hover:border-neutral-500 text-left"
                        onClick={() => handleGeneratedSelect(item)}
                      >
                        {item.type === "image" ? (
                          <Image src={item.url} alt="" fill className="object-cover" unoptimized />
                        ) : (
                          <div className="h-full w-full bg-neutral-800 flex items-center justify-center text-xs text-neutral-500">Video</div>
                        )}
                        <div className="absolute left-2 top-2 px-1.5 py-0.5 rounded bg-black/60 text-xs font-medium">
                          {getFileExtension(item.url)}
                        </div>
                      </button>
                    ))}
              </div>
            ) : (
              <div className="space-y-1">
                {activeTab === "uploaded"
                  ? filteredUploaded.map((file, i) => (
                      <button
                        key={`${file.nodeId}-${i}`}
                        type="button"
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-800 text-left"
                        onClick={() => handleFileSelect(file)}
                      >
                        <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-neutral-600 flex-shrink-0">
                          {file.type === "image" ? (
                            <Image src={file.url} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <div className="h-full w-full bg-neutral-800 flex items-center justify-center text-xs">V</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{getFileExtension(file.url)}</div>
                          <div className="text-xs text-neutral-500 truncate">{file.nodeType}</div>
                        </div>
                      </button>
                    ))
                  : filteredGenerated.map((item, i) => (
                      <button
                        key={`${item.nodeId}-${i}`}
                        type="button"
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-800 text-left"
                        onClick={() => handleGeneratedSelect(item)}
                      >
                        <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-neutral-600 flex-shrink-0">
                          {item.type === "image" ? (
                            <Image src={item.url} alt="" fill className="object-cover" unoptimized />
                          ) : (
                            <div className="h-full w-full bg-neutral-800 flex items-center justify-center text-xs">V</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.prompt || "Generated"}</div>
                          <div className="text-xs text-neutral-500 truncate">{formatDate(item.updatedAt) || item.nodeType}</div>
                        </div>
                      </button>
                    ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
