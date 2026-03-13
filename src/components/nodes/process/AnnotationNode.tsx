"use client";

import { useCallback, useRef, useEffect, useMemo } from "react";
import { Handle, Position, NodeProps, Node, useReactFlow } from "@xyflow/react";
import { BaseNode } from "../shared/BaseNode";
import { useAnnotationStore } from "@/store/annotationStore";
import { useWorkflowStore } from "@/store/workflowStore";
import { AnnotationNodeData } from "@/types";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";
import { getMediaDimensions, calculateNodeSizeForFullBleed, SQUARE_SIZE } from "@/utils/nodeDimensions";
import { MediaExpandButton } from "../shared/MediaExpandButton";
import { ConnectedImageThumbnails } from "../shared/ConnectedImageThumbnails";

type AnnotationNodeType = Node<AnnotationNodeData, "annotation">;

export function AnnotationNode({ id, data, selected }: NodeProps<AnnotationNodeType>) {
  const nodeData = data;
  const openModal = useAnnotationStore((state) => state.openModal);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { getNode, updateNode } = useReactFlow();

  const displayImage = nodeData.outputImage || nodeData.sourceImage;

  // Resize node to match image/video aspect ratio when content is set
  useEffect(() => {
    const node = getNode(id);
    if (!node) return;

    if (!displayImage) {
      // Reset to default when image removed
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
      return;
    }

    getMediaDimensions(displayImage).then((dims) => {
      if (!dims || dims.width <= 0 || dims.height <= 0) return;

      const node = getNode(id);
      if (!node) return;

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
    });
  }, [id, displayImage, getNode, updateNode]);

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
        updateNodeData(id, {
          sourceImage: base64,
          sourceImageRef: undefined,
          outputImage: null,
          outputImageRef: undefined,
          annotations: [],
        });
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

  const { layers, imageLayerTransforms } = useMemo(() => {
    const connected = getConnectedInputsPure(id, nodes ?? [], edges ?? []);
    const fromConnections = connected.images ?? [];
    const savedLayers = nodeData.layers ?? [];
    const savedTransforms = nodeData.imageLayerTransforms ?? [];

    if (fromConnections.length > 0) {
      // Use only currently connected images (excludes disconnected and paused edges)
      const transforms = fromConnections.map((url) => {
        const idx = savedLayers.indexOf(url);
        return idx >= 0 && savedTransforms[idx]
          ? savedTransforms[idx]
          : { x: 0, y: 0, scaleX: 1, scaleY: 1 };
      });
      return { layers: fromConnections, imageLayerTransforms: transforms };
    }
    // No connections: use saved state (from previous edit or manual upload)
    const fromNode = savedLayers.length ? savedLayers : nodeData.sourceImage ? [nodeData.sourceImage] : [];
    const combined = fromNode.length > 0 ? fromNode : (nodeData.outputImage ? [nodeData.outputImage] : nodeData.sourceImage ? [nodeData.sourceImage] : []);
    const transforms = combined === savedLayers && savedTransforms.length >= combined.length ? savedTransforms : [];
    return { layers: combined, imageLayerTransforms: transforms };
  }, [id, nodes, edges, nodeData.layers, nodeData.sourceImage, nodeData.outputImage, nodeData.imageLayerTransforms]);

  const handleEdit = useCallback(() => {
    if (layers.length === 0) {
      alert("No image available. Connect an image or load one manually.");
      return;
    }
    openModal(id, layers, nodeData.annotations, imageLayerTransforms.length > 0 ? imageLayerTransforms : undefined);
  }, [id, layers, nodeData.annotations, imageLayerTransforms, openModal]);

  return (
    <BaseNode
      id={id}
      selected={selected}
      contentClassName="flex-1 min-h-0 overflow-clip"
      aspectFitMedia={nodeData.outputImage}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <Handle
        type="target"
        position={Position.Left}
        id="image"
        data-handletype="image"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="image"
        data-handletype="image"
      />

      {displayImage ? (
        <div
          className="relative group cursor-pointer w-full h-full"
          onClick={handleEdit}
        >
          <div className="absolute bottom-2 left-2 z-10">
            <ConnectedImageThumbnails nodeId={id} />
          </div>
          <img
            src={displayImage}
            alt="Annotated"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <MediaExpandButton nodeId={id} mediaUrl={displayImage} />
          </div>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
            <span className="text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-3 py-1.5 rounded">
              {nodeData.annotations.length > 0 ? `Edit layers (${nodeData.annotations.length})` : "Edit layers"}
            </span>
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="w-full h-full bg-neutral-900/40 flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-800/60 transition-colors relative"
        >
          <div className="absolute bottom-2 left-2 z-10">
            <ConnectedImageThumbnails nodeId={id} />
          </div>
          <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="text-xs text-neutral-500 mt-2">
            Drop, click, or connect
          </span>
        </div>
      )}
    </BaseNode>
  );
}
