"use client";

import { useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useWorkflowStore } from "@/store/workflowStore";
import { ImageInputNodeData } from "@/types";
import { calculateNodeSizeForFullBleed, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { UploadToolbar } from "./UploadToolbar";
import { useMediaViewer } from "@/providers/media-viewer";
import { collectMediaItems } from "@/lib/media-collector";

type ImageInputNodeType = Node<ImageInputNodeData, "imageInput">;

export function ImageInputNode({ id, data, selected }: NodeProps<ImageInputNodeType>) {
  const nodeData = data;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getNode, updateNode } = useReactFlow();
  const getNodes = useReactFlow().getNodes;
  const { openViewer } = useMediaViewer();

  // Resize node to match uploaded image aspect ratio (like arty upload node)
  useEffect(() => {
    const node = getNode(id);
    if (!node) return;

    const dims = nodeData.dimensions;
    if (!dims || dims.width <= 0 || dims.height <= 0) {
      // Reset to default when image removed
      if (!nodeData.image) {
        const defaultWidth = SQUARE_SIZE;
        const defaultHeight = SQUARE_SIZE;
        const currentWidth = (node.width as number) ?? (node.style?.width as number);
        const currentHeight = (node.height as number) ?? (node.style?.height as number);
        if (currentWidth !== defaultWidth || currentHeight !== defaultHeight) {
          updateNode(id, {
            width: defaultWidth,
            height: defaultHeight,
            style: { ...node.style, width: `${defaultWidth}px`, height: `${defaultHeight}px` },
          });
        }
      }
      return;
    }

    const aspectRatio = dims.width / dims.height;
    const currentHeight = (node.height as number) ?? (node.style?.height as number) ?? SQUARE_SIZE;
    const { width, height } = calculateNodeSizeForFullBleed(aspectRatio, currentHeight);

    const currentWidth = (node.width as number) ?? (node.style?.width as number) ?? SQUARE_SIZE;
    if (Math.abs(currentWidth - width) > 5 || Math.abs(currentHeight - height) > 5) {
      updateNode(id, {
        width,
        height,
        style: { ...node.style, width: `${width}px`, height: `${height}px` },
      });
    }
  }, [id, nodeData.dimensions, nodeData.image, getNode, updateNode]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
        alert("Unsupported format. Use PNG, JPG, or WebP.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert("Image too large. Maximum size is 10MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          updateNodeData(id, {
            image: base64,
            imageRef: undefined,
            filename: file.name,
            dimensions: { width: img.width, height: img.height },
          });
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    },
    [id, updateNodeData]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleRemove = useCallback(() => {
    updateNodeData(id, {
      image: null,
      imageRef: undefined,
      filename: null,
      dimensions: null,
    });
  }, [id, updateNodeData]);

  const handleDownload = useCallback(() => {
    if (!nodeData.image) return;
    try {
      const link = document.createElement("a");
      link.href = nodeData.image;
      link.download = nodeData.filename || "image.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      // ignore download errors
    }
  }, [nodeData.image, nodeData.filename]);

  const handleFullscreen = useCallback(() => {
    if (!nodeData.image) return;
    const items = collectMediaItems(getNodes());
    const index = items.findIndex((item) => item.url === nodeData.image && item.nodeId === id);
    openViewer(items, index >= 0 ? index : 0);
  }, [getNodes, id, nodeData.image, openViewer]);

  return (
    <>
      <UploadToolbar
        nodeId={id}
        hasImage={!!nodeData.image}
        onReplaceClick={() => fileInputRef.current?.click()}
        onDownloadClick={handleDownload}
        onFullscreenClick={handleFullscreen}
      />
      <BaseNode
      id={id}
      selected={selected}
      contentClassName="flex-1 min-h-0 overflow-clip"
      aspectFitMedia={nodeData.image}
      >
      {/* Reference input handle for visual links from Split Grid node */}
      <Handle
        type="target"
        position={Position.Left}
        id="reference"
        data-handletype="reference"
        className="!bg-gray-500"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {nodeData.image ? (
        <div className="relative group w-full h-full min-h-0 min-w-0 overflow-hidden">
          <img
            src={nodeData.image}
            alt={nodeData.filename || "Uploaded image"}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              onClick={handleRemove}
              aria-label="Remove image"
              className="w-8 h-8 bg-black/50 hover:bg-red-600/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all backdrop-blur-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload image"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-900/60 transition-colors"
        >
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">Drop image</span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
      />
      </BaseNode>
    </>
  );
}
