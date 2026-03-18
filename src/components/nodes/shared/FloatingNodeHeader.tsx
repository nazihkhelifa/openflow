"use client";

import { ReactNode, useState, useEffect, useRef, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useReactFlow } from "@xyflow/react";
import { NodeType, ProviderType } from "@/types";
import { useWorkflowStore } from "@/store/workflowStore";
import { defaultNodeDimensions } from "@/store/utils/nodeDefaults";
import { ProviderBadge } from "./ProviderBadge";

// Run button is now inside each runnable node (bottom-right), not in the header
const EXPANDABLE_TYPES = new Set(['prompt', 'annotation']);

interface FloatingNodeHeaderProps {
  id: string;
  type: NodeType;
  isInLockedGroup?: boolean;
  isExecuting?: boolean;
  position: { x: number; y: number };
  width: number;
  selected: boolean;
  onExpandNode?: (nodeId: string, nodeType: string) => void;
  headerAction?: ReactNode;
  headerButtons?: ReactNode;
  provider?: ProviderType;
  title: string;
  customTitle?: string;
  onCustomTitleChange?: (nodeId: string, title: string) => void;
}

export const FloatingNodeHeader = memo(function FloatingNodeHeader({
  id,
  type,
  isInLockedGroup = false,
  isExecuting = false,
  position,
  width,
  selected,
  onExpandNode,
  headerAction,
  headerButtons,
  provider,
  title,
  customTitle,
  onCustomTitleChange,
}: FloatingNodeHeaderProps) {
  const canExpand = EXPANDABLE_TYPES.has(type);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const isBodyHovered = useWorkflowStore((state) => state.hoveredNodeId === id);
  const isHovered = isHeaderHovered || isBodyHovered;
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(customTitle || "");

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync state with props
  useEffect(() => {
    if (!isEditingTitle) {
      setEditTitleValue(customTitle || "");
    }
  }, [customTitle, isEditingTitle]);

  // Focus input on edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Title handlers
  const handleTitleSubmit = useCallback(() => {
    const trimmed = editTitleValue.trim();
    if (trimmed !== (customTitle || "")) {
      onCustomTitleChange?.(id, trimmed);
    }
    setIsEditingTitle(false);
  }, [editTitleValue, customTitle, onCustomTitleChange, id]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleTitleSubmit();
      } else if (e.key === "Escape") {
        setEditTitleValue(customTitle || "");
        setIsEditingTitle(false);
      }
    },
    [handleTitleSubmit, customTitle]
  );

  // Determine if controls should be visible
  const showControls = isHovered || selected;

  // Drag-to-move: allow repositioning nodes by dragging the header
  const { getViewport } = useReactFlow();
  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const isDraggingRef = useRef(false);

  const handleHeaderPointerDown = useCallback((e: React.PointerEvent) => {
    // Don't drag from interactive elements
    if ((e.target as HTMLElement).closest('.nodrag, button, input, textarea, a')) return;
    if (e.button !== 0) return;
    if (isInLockedGroup) return;

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;

    const store = useWorkflowStore.getState();
    const allNodes = store.nodes;
    const targetNode = allNodes.find((n) => n.id === id);
    if (!targetNode) return;

    // Select this node if not already selected
    if (!targetNode.selected) {
      onNodesChange(
        allNodes.map((n) => ({
          type: "select" as const,
          id: n.id,
          selected: n.id === id,
        })),
      );
    }

    // Capture starting positions of all nodes that will move
    const movingIds = targetNode.selected
      ? new Set(allNodes.filter((n) => n.selected).map((n) => n.id))
      : new Set([id]);
    const startPositions = new Map(
      allNodes
        .filter((n) => movingIds.has(n.id))
        .map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
    );

    isDraggingRef.current = false;

    const handlePointerMove = (e: PointerEvent) => {
      const screenDx = e.clientX - startX;
      const screenDy = e.clientY - startY;

      if (!isDraggingRef.current && (Math.abs(screenDx) > 5 || Math.abs(screenDy) > 5)) {
        isDraggingRef.current = true;
      }

      if (isDraggingRef.current) {
        const { zoom } = getViewport();
        const dx = screenDx / zoom;
        const dy = screenDy / zoom;
        onNodesChange(
          Array.from(startPositions.entries()).map(([nodeId, startPos]) => ({
            type: "position" as const,
            id: nodeId,
            position: { x: startPos.x + dx, y: startPos.y + dy },
          })),
        );
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const wasDragging = isDraggingRef.current;

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      isDraggingRef.current = false;

      // Check group membership for ALL moved nodes
      if (wasDragging) {
        const { zoom } = getViewport();
        const dx = (e.clientX - startX) / zoom;
        const dy = (e.clientY - startY) / zoom;

        for (const [nodeId, startPos] of startPositions) {
          // Calculate final position deterministically from drag delta
          const finalX = startPos.x + dx;
          const finalY = startPos.y + dy;

          // Get node dimensions from store (always fresh)
          const storeNode = store.nodes.find(n => n.id === nodeId);
          if (!storeNode) continue;

          const nodeType = storeNode.type as NodeType;
          const defaults = defaultNodeDimensions[nodeType] || { width: 300, height: 280 };
          const nodeWidth = storeNode.measured?.width || (storeNode.style?.width as number) || defaults.width;
          const nodeHeight = storeNode.measured?.height || (storeNode.style?.height as number) || defaults.height;

          // Calculate node center
          const nodeCenterX = finalX + nodeWidth / 2;
          const nodeCenterY = finalY + nodeHeight / 2;

          // Check if node center is inside any group
          let targetGroupId: string | undefined;

          for (const group of Object.values(store.groups)) {
            const inBoundsX = nodeCenterX >= group.position.x && nodeCenterX <= group.position.x + group.size.width;
            const inBoundsY = nodeCenterY >= group.position.y && nodeCenterY <= group.position.y + group.size.height;

            if (inBoundsX && inBoundsY) {
              targetGroupId = group.id;
              break;
            }
          }

          // Update groupId if it changed
          const currentGroupId = storeNode.groupId;
          if (targetGroupId !== currentGroupId) {
            store.setNodeGroupId(nodeId, targetGroupId);
          }
        }
      }
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  }, [id, getViewport, isInLockedGroup, onNodesChange]);

  return (
    <div
      className="absolute pointer-events-none transition-opacity duration-200"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 26}px`,
        width: `${width}px`,
        zIndex: selected ? 10000 : 9000,
      }}
    >
      <div
        className="px-1 py-1 flex items-center justify-between w-full pointer-events-auto cursor-grab"
        onMouseEnter={() => setIsHeaderHovered(true)}
        onMouseLeave={() => setIsHeaderHovered(false)}
        onPointerDown={handleHeaderPointerDown}
      >
        {/* Title Section */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 pl-2">
          {provider && <ProviderBadge provider={provider} />}
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              placeholder="Custom title..."
              className="nodrag nopan w-full bg-transparent border-none outline-none text-xs font-semibold tracking-wide text-neutral-300 placeholder:text-neutral-500 uppercase"
            />
          ) : (
            <span
              className="nodrag text-xs font-semibold uppercase tracking-wide text-neutral-400 cursor-text truncate"
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {customTitle ? `${customTitle} - ${title}` : title}
            </span>
          )}
          {headerAction}
        </div>

        {/* Controls - right-aligned, fade in on hover/selected */}
        <div className={`shrink-0 flex items-center gap-1 pr-1 transition-opacity duration-200 -translate-y-1 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          {/* Lock Badge for nodes in locked groups */}
          {isInLockedGroup && (
            <div className="shrink-0 flex items-center" title="This node is in a locked group and will be skipped during execution">
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          )}

          {/* Custom Header Buttons */}
          {headerButtons}

          {/* Expand Button */}
          {canExpand && onExpandNode && (
            <div className="relative shrink-0 group">
              <button
                onClick={() => onExpandNode(id, type)}
                className="nodrag nopan p-0.5 rounded transition-all duration-200 ease-in-out text-neutral-500 group-hover:text-neutral-200 border border-neutral-600 flex items-center overflow-hidden group-hover:pr-2"
                title="Expand editor"
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                <span className="max-w-0 opacity-0 whitespace-nowrap text-[10px] transition-all duration-200 ease-in-out overflow-hidden group-hover:max-w-[60px] group-hover:opacity-100 group-hover:ml-1">
                  Expand
                </span>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
});
