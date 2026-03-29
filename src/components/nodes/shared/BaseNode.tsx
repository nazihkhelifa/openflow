"use client";

import { ReactNode, useCallback, useRef, useLayoutEffect, useState, useEffect } from "react";
import { Node, NodeResizer, OnResize, useReactFlow } from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { getMediaDimensions, calculateAspectFitSize } from "@/utils/nodeDimensions";

const DEFAULT_NODE_DIMENSION = 300;

interface BaseNodeProps {
  id: string;
  children: ReactNode;
  selected?: boolean;
  isExecuting?: boolean;
  hasError?: boolean;
  className?: string;
  contentClassName?: string;
  minWidth?: number;
  minHeight?: number;
  /** When true, node has no background/border — content fills the entire node area */
  fullBleed?: boolean;
  /** Media URL (image/video) to use for aspect-fit resize on resize-handle double-click */
  aspectFitMedia?: string | null;
  /** When true, bottom corners lose rounding so the selection ring connects to the settings panel below */
  settingsExpanded?: boolean;
  /** Settings panel rendered outside the bordered area so it shares the node's full width */
  settingsPanel?: ReactNode;
  /** Optional content rendered at bottom-right inside the node (e.g. Run button) */
  footerRight?: ReactNode;
  /** Optional content rendered at bottom-left inside the node (e.g. Replace button) */
  footerLeft?: ReactNode;
  /** When false, hide resize handles (e.g. when settings are in a popover) */
  resizable?: boolean;
  /** Timestamp from _agentTouched — triggers a temporary glow animation */
  agentTouched?: number;
}

/**
 * Read a node's effective width or height, respecting React Flow's internal
 * priority: node.width > node.style.width > node.measured.width.
 */
function getNodeDimension(node: Node, axis: "width" | "height"): number {
  return (
    (node[axis] as number) ??
    (node.style?.[axis] as number) ??
    (node.measured?.[axis] as number) ??
    DEFAULT_NODE_DIMENSION
  );
}

/**
 * Apply dimensions to a React Flow node, writing to both `node.width/height`
 * (where NodeResizer writes) and `node.style` (the original source) so neither
 * silently overrides the other.
 */
function applyNodeDimensions(node: Node, width: number, height: number): Node {
  return {
    ...node,
    width,
    height,
    style: { ...node.style, width, height },
  };
}

export function BaseNode({
  id,
  children,
  selected = false,
  isExecuting = false,
  hasError = false,
  className = "",
  contentClassName,
  minWidth = 180,
  minHeight = 100,
  fullBleed = false,
  aspectFitMedia,
  settingsExpanded = false,
  settingsPanel,
  footerRight,
  footerLeft,
  resizable = true,
  agentTouched: agentTouchedProp,
}: BaseNodeProps) {
  const currentNodeIds = useWorkflowStore((state) => state.currentNodeIds);
  const setHoveredNodeId = useWorkflowStore((state) => state.setHoveredNodeId);
  const storeAgentTouched = useWorkflowStore(
    (state) => (state.nodes.find((n) => n.id === id)?.data as Record<string, unknown>)?._agentTouched as number | undefined
  );
  const agentTouched = agentTouchedProp ?? storeAgentTouched;
  const isCurrentlyExecuting = currentNodeIds.includes(id);
  const { getNodes, setNodes } = useReactFlow();

  const [showAgentGlow, setShowAgentGlow] = useState(false);
  useEffect(() => {
    if (!agentTouched) {
      setShowAgentGlow(false);
      return;
    }
    setShowAgentGlow(true);
    const timer = setTimeout(() => setShowAgentGlow(false), 3000);
    return () => clearTimeout(timer);
  }, [agentTouched]);

  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const trackedSettingsHeightRef = useRef(0);

  // Adjust node height when settings collapse
  useLayoutEffect(() => {
    if (!settingsExpanded && trackedSettingsHeightRef.current > 0) {
      const heightToRemove = trackedSettingsHeightRef.current;
      trackedSettingsHeightRef.current = 0;
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          const currentHeight = getNodeDimension(node, "height");
          const newHeight = Math.max(minHeight, currentHeight - heightToRemove);
          return applyNodeDimensions(node, getNodeDimension(node, "width"), newHeight);
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsExpanded]);

  // ResizeObserver to track dynamic settings panel height changes (e.g., model param count changes)
  useLayoutEffect(() => {
    if (!settingsExpanded || !settingsPanel) return;
    const panelEl = settingsPanelRef.current;
    if (!panelEl) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newPanelHeight = entry.contentRect.height;
        if (newPanelHeight === 0) continue;
        const delta = newPanelHeight - trackedSettingsHeightRef.current;
        if (Math.abs(delta) < 2) continue; // Ignore sub-pixel changes

        trackedSettingsHeightRef.current = newPanelHeight;
        setNodes((nodes) =>
          nodes.map((node) => {
            if (node.id !== id) return node;
            const currentHeight = getNodeDimension(node, "height");
            const newHeight = Math.max(minHeight, currentHeight + delta);
            return applyNodeDimensions(node, getNodeDimension(node, "width"), newHeight);
          })
        );
      }
    });

    observer.observe(panelEl);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsExpanded, settingsPanel]);

  const handleResize: OnResize = useCallback(
    (_event, params) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.selected && node.id !== id) {
            return applyNodeDimensions(node, params.width, params.height);
          }
          return node;
        })
      );
    },
    [id, setNodes]
  );

  const handleResizeHandleDblClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".react-flow__resize-control")) return;
      if (!aspectFitMedia) return;

      e.stopPropagation();
      const dims = await getMediaDimensions(aspectFitMedia);
      if (!dims) return;

      const thisNode = getNodes().find((n) => n.id === id);
      if (!thisNode) return;

      const nodeHeight = getNodeDimension(thisNode, "height");
      const contentHeight = nodeHeight - trackedSettingsHeightRef.current;

      const newSize = calculateAspectFitSize(
        dims.width / dims.height,
        getNodeDimension(thisNode, "width"),
        contentHeight,
        fullBleed
      );

      const finalHeight = newSize.height + trackedSettingsHeightRef.current;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === id || (n.selected && n.id !== id)) {
            return applyNodeDimensions(n, newSize.width, finalHeight);
          }
          return n;
        })
      );
    },
    [aspectFitMedia, id, fullBleed, getNodes, setNodes]
  );

  const hasExpandedSettings = settingsExpanded && settingsPanel;

  return (
    <div
      className={hasExpandedSettings
        ? `relative flex flex-col w-full h-full overflow-visible bg-neutral-800 rounded-xl ${selected ? "ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/25" : ""}`
        : "contents"}
      onDoubleClick={handleResizeHandleDblClick}
    >
      {resizable && (
        <NodeResizer
          isVisible={selected}
          minWidth={minWidth}
          minHeight={minHeight}
          lineClassName="!border-transparent"
          handleClassName="!w-5 !h-5 !bg-transparent !border-none"
          onResize={handleResize}
        />
      )}
      <div
        className={`
          ${hasExpandedSettings ? "flex-1 min-h-0 w-full" : "h-full w-full"} flex flex-col overflow-visible relative
          ${fullBleed
            ? `${settingsExpanded ? "rounded-t-xl border-b-0" : "rounded-xl"} bg-neutral-800/50 border border-neutral-700/40`
            : `bg-neutral-800 ${settingsExpanded ? "rounded-t-xl border-b-0" : "rounded-xl"} shadow-lg border`}
          ${fullBleed ? "" : (isCurrentlyExecuting || isExecuting ? "border-blue-500 ring-1 ring-blue-500/20" : "border-neutral-700/60")}
          ${fullBleed ? "" : (hasError ? "border-red-500" : "")}
          ${fullBleed && selected && !settingsExpanded ? "ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/25" : ""}
          ${!fullBleed && selected && !settingsExpanded ? "border-blue-500 ring-2 ring-blue-500/40 shadow-lg shadow-blue-500/25" : ""}
          ${!fullBleed && selected && settingsExpanded ? "border-blue-500" : ""}
          ${showAgentGlow ? "ring-2 ring-purple-500/60 shadow-[0_0_20px_rgba(168,85,247,0.4)] border-purple-500/50 transition-shadow duration-1000" : ""}
          ${className}
        `}
        onMouseEnter={() => {
          if (document.querySelector('.react-flow__pane.dragging')) return;
          setHoveredNodeId(id);
        }}
        onMouseLeave={() => {
          if (document.querySelector('.react-flow__pane.dragging')) return;
          setHoveredNodeId(null);
        }}
      >
        <div className={`${contentClassName ?? (fullBleed ? "flex-1 min-h-0 relative" : "px-3 pb-4 flex-1 min-h-0 flex flex-col")} overflow-visible relative`}>
          {children}
          {footerLeft && (
            <div className="absolute bottom-2 left-2 z-10">
              {footerLeft}
            </div>
          )}
          {footerRight && (
            <div className="absolute bottom-2 right-2 z-10">
              {footerRight}
            </div>
          )}
        </div>
      </div>
      {settingsPanel && (
        <div ref={settingsPanelRef}>
          {settingsPanel}
        </div>
      )}
    </div>
  );
}
