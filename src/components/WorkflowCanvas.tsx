"use client";

import { useCallback, useRef, useState, useEffect, DragEvent, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  NodeTypes,
  EdgeTypes,
  Connection,
  Edge,
  useReactFlow,
  OnConnectEnd,
  Node,
  OnSelectionChangeParams,
  ViewportPortal,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore, WorkflowFile } from "@/store/workflowStore";
import { useShallow } from "zustand/shallow";
import { useToast } from "@/components/Toast";
import dynamic from "next/dynamic";
import {
  AudioNode,
  LayerEditorNode,
  CommentNode,
  TextNode,
  ImageNode,
  VideoNode,
  ThreeDNode,
  ImageCompareNode,
  EaseCurveNode,
  RouterNode,
  SwitchNode,
  ConditionalSwitchNode,
} from "./nodes";

// Lazy-load nodes that use three.js to avoid bundling for users who don't use them
const GLBViewerNode = dynamic(() => import("./nodes/other/GLBViewerNode").then(mod => ({ default: mod.GLBViewerNode })), { ssr: false });
const UploadNode = dynamic(() => import("./nodes/input/UploadNode").then(mod => ({ default: mod.UploadNode })), { ssr: false });
import { EditableEdge, ReferenceEdge, SharedEdgeGradients } from "./edges";
import { ConnectionDropMenu, MenuAction } from "./ConnectionDropMenu";
import { CanvasContextMenu } from "./CanvasContextMenu";
import { MultiSelectToolbar } from "./MultiSelectToolbar";
import { EdgeToolbar } from "./EdgeToolbar";
import { GroupBackgroundsPortal, GroupControlsOverlay } from "./GroupsOverlay";
import { NodeType, NanoBananaNodeData, HandleType, AnnotationNodeData } from "@/types";
import { defaultNodeDimensions } from "@/store/utils/nodeDefaults";
import { getQuickstartDefaults, getQuickstartSystemInstructionExtra } from "@/store/utils/localStorage";
import { FloatingNodeHeader } from "./nodes/shared/FloatingNodeHeader";
import { ControlPanel } from "./nodes/shared/ControlPanel";
import { logger } from "@/utils/logger";
import { ProjectSetupModal } from "./ProjectSetupModal";
import { FlowyAgentPanel } from "./FlowyAgentPanel";
import { RunActionBar } from "./RunActionBar";
import { EditOperation } from "@/lib/chat/editOperations";
import { stripBinaryData } from "@/lib/chat/contextBuilder";
import { PromptEditorModal } from "./modals/PromptEditorModal";
import { AnnotationModal } from "./AnnotationModal";
import { createPortal } from "react-dom";
import { useAnnotationStore } from "@/store/annotationStore";
import {
  getHandleType,
  getNodeHandles,
  isValidWorkflowConnection,
} from "@/lib/workflow/canvasConnectionRules";

const nodeTypes: NodeTypes = {
  mediaInput: UploadNode,
  annotation: LayerEditorNode,
  comment: CommentNode,
  prompt: TextNode,
  generateImage: ImageNode,
  generateVideo: VideoNode,
  generate3d: ThreeDNode,
  generateAudio: AudioNode,
  imageCompare: ImageCompareNode,
  easeCurve: EaseCurveNode,
  router: RouterNode,
  switch: SwitchNode,
  conditionalSwitch: ConditionalSwitchNode,
  glbViewer: GLBViewerNode,
};

const edgeTypes: EdgeTypes = {
  editable: EditableEdge,
  reference: ReferenceEdge,
};

interface ConnectionDropState {
  position: { x: number; y: number };
  flowPosition: { x: number; y: number };
  handleType: "image" | "text" | "video" | "audio" | "3d" | "easeCurve" | null;
  connectionType: "source" | "target";
  sourceNodeId: string | null;
  sourceHandleId: string | null;
}

// Detect if running on macOS for platform-specific trackpad behavior
const isMacOS = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Detect if a wheel event is from a mouse (vs trackpad)
const isMouseWheel = (event: WheelEvent): boolean => {
  // Mouse scroll wheel typically uses deltaMode 1 (lines) or has large discrete deltas
  // Trackpad uses deltaMode 0 (pixels) with smaller, smoother deltas
  if (event.deltaMode === 1) return true; // DOM_DELTA_LINE = mouse

  // Fallback: large delta values suggest mouse wheel
  const threshold = 50;
  return Math.abs(event.deltaY) >= threshold &&
         Math.abs(event.deltaY) % 40 === 0; // Mouse deltas often in multiples
};

// Check if an element can scroll and has room to scroll in the given direction
const canElementScroll = (element: HTMLElement, deltaX: number, deltaY: number): boolean => {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;

  const canScrollY = overflowY === 'auto' || overflowY === 'scroll';
  const canScrollX = overflowX === 'auto' || overflowX === 'scroll';

  // Check if there's room to scroll in the delta direction
  if (canScrollY && deltaY !== 0) {
    const hasVerticalScroll = element.scrollHeight > element.clientHeight;
    if (hasVerticalScroll) {
      // Check if we can scroll further in the delta direction
      if (deltaY > 0 && element.scrollTop < element.scrollHeight - element.clientHeight) {
        return true; // Can scroll down
      }
      if (deltaY < 0 && element.scrollTop > 0) {
        return true; // Can scroll up
      }
    }
  }

  if (canScrollX && deltaX !== 0) {
    const hasHorizontalScroll = element.scrollWidth > element.clientWidth;
    if (hasHorizontalScroll) {
      if (deltaX > 0 && element.scrollLeft < element.scrollWidth - element.clientWidth) {
        return true; // Can scroll right
      }
      if (deltaX < 0 && element.scrollLeft > 0) {
        return true; // Can scroll left
      }
    }
  }

  return false;
};

// Find if the target element or any ancestor is scrollable
const findScrollableAncestor = (target: HTMLElement, deltaX: number, deltaY: number): HTMLElement | null => {
  let current: HTMLElement | null = target;

  while (current && !current.classList.contains('react-flow')) {
    // Check for nowheel class (React Flow convention for elements that should handle their own scroll)
    if (current.classList.contains('nowheel') || current.tagName === 'TEXTAREA') {
      if (canElementScroll(current, deltaX, deltaY)) {
        return current;
      }
    }
    current = current.parentElement;
  }

  return null;
};

export function WorkflowCanvas() {
  const { nodes, edges, groups, isModalOpen, navigationTarget, canvasNavigationSettings, dimmedNodeIds } =
    useWorkflowStore(useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      groups: state.groups,
      isModalOpen: state.isModalOpen,
      navigationTarget: state.navigationTarget,
      canvasNavigationSettings: state.canvasNavigationSettings,
      dimmedNodeIds: state.dimmedNodeIds,
    })));
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const addNode = useWorkflowStore((state) => state.addNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const getNodeById = useWorkflowStore((state) => state.getNodeById);
  const addToGlobalHistory = useWorkflowStore((state) => state.addToGlobalHistory);
  const setNodeGroupId = useWorkflowStore((state) => state.setNodeGroupId);
  const clampNodesToGroup = useWorkflowStore((state) => state.clampNodesToGroup);
  const executeWorkflow = useWorkflowStore((state) => state.executeWorkflow);
  const stopWorkflow = useWorkflowStore((state) => state.stopWorkflow);
  const handleFlowyRunNodeIds = useCallback(
    async (nodeIds: string[], opts?: { signal?: AbortSignal }) => {
      if (!nodeIds || nodeIds.length === 0) return;
      const signal = opts?.signal;
      for (const nodeId of nodeIds) {
        if (signal?.aborted) return;
        try {
          await executeWorkflow(nodeId);
        } catch (e) {
          console.error("Flowy run failed for node:", nodeId, e);
        }
      }
    },
    [executeWorkflow]
  );
  const setNavigationTarget = useWorkflowStore((state) => state.setNavigationTarget);
  const captureSnapshot = useWorkflowStore((state) => state.captureSnapshot);
  const applyEditOperations = useWorkflowStore((state) => state.applyEditOperations);
  const setWorkflowMetadata = useWorkflowStore((state) => state.setWorkflowMetadata);
  const setShortcutsDialogOpen = useWorkflowStore((state) => state.setShortcutsDialogOpen);
  const clearWorkflow = useWorkflowStore((state) => state.clearWorkflow);
  const openAnnotationModal = useAnnotationStore((state) => state.openModal);
  const { screenToFlowPosition, getViewport, zoomIn, zoomOut, setViewport, setCenter } = useReactFlow();
  const { show: showToast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropType, setDropType] = useState<"image" | "audio" | "workflow" | "node" | null>(null);
  const [connectionDrop, setConnectionDrop] = useState<ConnectionDropState | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  /** True while Flowy is sending canvas/workflow context to the planner (edge vignette on canvas). */
  const [isFlowyCanvasReading, setIsFlowyCanvasReading] = useState(false);
  const [flowyComposerMountEl, setFlowyComposerMountEl] = useState<HTMLDivElement | null>(null);
  const [isBuildingWorkflow, setIsBuildingWorkflow] = useState(false);
  const [showNewProjectSetup, setShowNewProjectSetup] = useState(false);
  const [expandingNode, setExpandingNode] = useState<{ id: string; type: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId?: string } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Detect if canvas is empty for showing quickstart
  const isCanvasEmpty = nodes.length === 0;

  // Handle comment navigation - center viewport on target node
  useEffect(() => {
    if (navigationTarget) {
      const targetNode = nodes.find((n) => n.id === navigationTarget.nodeId);
      if (targetNode) {
        // Calculate center of node
        const nodeWidth = (targetNode.style?.width as number) || 300;
        const nodeHeight = (targetNode.style?.height as number) || 280;
        const centerX = targetNode.position.x + nodeWidth / 2;
        const centerY = targetNode.position.y + nodeHeight / 2;

        // Navigate to node center with animation, zoomed out to 0.7 for better context
        setCenter(centerX, centerY, { duration: 300, zoom: 0.7 });
      }
      // Clear navigation target after navigating
      setNavigationTarget(null);
    }
  }, [navigationTarget, nodes, setCenter, setNavigationTarget]);

  // Apply dimming className to nodes downstream of disabled Switch outputs
  const allNodes = useMemo(() => {
    return nodes.map((node) => {
      // Never dim Switch or ConditionalSwitch nodes themselves
      if (node.type === "switch" || node.type === "conditionalSwitch") return node;

      const isDimmed = dimmedNodeIds.has(node.id);
      const dimClass = isDimmed ? "switch-dimmed" : "";

      // Preserve existing className if any, add/remove dimmed class.
      // Normalize empty className to `undefined` to avoid churn (`""` vs `undefined`)
      // which can cause React Flow store update loops.
      const baseClass = (node.className ?? "").replace(/\bswitch-dimmed\b/g, "").trim();
      const mergedClass = dimClass ? `${baseClass} ${dimClass}`.trim() : baseClass;
      const normalizedClassName = mergedClass.length > 0 ? mergedClass : undefined;

      // Only create a new node object if className truly changed.
      if (node.className === normalizedClassName) return node;
      return { ...node, className: normalizedClassName };
    });
  }, [nodes, dimmedNodeIds]);

  const defaultEdgeOptions = useMemo(
    () => ({ type: "editable" as const, animated: false }),
    []
  );

  // Node title mapping for FloatingNodeHeaders
  const NODE_TITLES: Record<string, string> = {
    mediaInput: 'Upload',
    annotation: 'Layer Editor',
    prompt: 'Prompt',
    generateImage: 'Generate Image',
    generateVideo: 'Generate Video',
    generate3d: 'Generate 3D',
    generateAudio: 'Generate Audio',
    imageCompare: 'Image Compare',
    easeCurve: 'Ease Curve',
    router: 'Router',
    switch: 'Switch',
    conditionalSwitch: 'Conditional Switch',
    glbViewer: '3D Viewer',
  };

  // Helper to get node title (used for FloatingNodeHeader)
  const getNodeTitle = useCallback((node: Node) => {
    // For generate nodes, check for selectedModel display name
    if (node.type === "generateImage" || node.type === "generateVideo" || node.type === "generate3d" || node.type === "generateAudio") {
      const model = (node.data as any)?.selectedModel;
      if (model?.displayName) return model.displayName;
    }

    // For Prompt (LLM) nodes, show model id
    if (node.type === "prompt") {
      const model = (node.data as any)?.model;
      if (model) return model;
    }

    return NODE_TITLES[node.type || ""] || "Node";
  }, []);


  // Wire title change callback for FloatingNodeHeaders
  const handleCustomTitleChange = useCallback((nodeId: string, title: string) => {
    updateNodeData(nodeId, { customTitle: title || undefined });
  }, [updateNodeData]);

  // Stable callback for running a node from its header
  // Stable callback for expanding a node from its header
  const handleExpandNode = useCallback((nodeId: string, nodeType: string) => {
    if (nodeType === 'annotation') {
      const node = getNodeById(nodeId);
      if (!node) return;
      const data = node.data as AnnotationNodeData;
      // Prefer saved layers when we have a previous edit - ensures we reopen with the last edited state
      const layersToEdit = data.layers?.length
        ? data.layers
        : data.outputImage
          ? [data.outputImage]
          : data.sourceImage
            ? [data.sourceImage]
            : [];
      if (layersToEdit.length === 0) return;
      openAnnotationModal(nodeId, layersToEdit, data.annotations ?? [], data.imageLayerTransforms);
    } else {
      setExpandingNode({ id: nodeId, type: nodeType });
    }
  }, [getNodeById, openAnnotationModal]);


  // Check if a node was dropped into a group and add it to that group
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Skip if it's a group node
      if (node.id.startsWith("group-")) return;

      // If multiple nodes are selected, group-membership checks need to run for all moved nodes,
      // not just the one React Flow reports as the drag target.
      const movedNodes = node.selected ? nodes.filter((n) => n.selected) : [node];

      const defaults = defaultNodeDimensions[node.type as NodeType] || { width: 300, height: 280 };
      const groupsToClamp = new Set<string>();
      movedNodes.forEach((moved) => {
        const movedDefaults = defaultNodeDimensions[moved.type as NodeType] || defaults;
        const nodeWidth = moved.measured?.width || (moved.style?.width as number) || movedDefaults.width;
        const nodeHeight = moved.measured?.height || (moved.style?.height as number) || movedDefaults.height;
        const nodeCenterX = moved.position.x + nodeWidth / 2;
        const nodeCenterY = moved.position.y + nodeHeight / 2;

        // Check if node center is inside any group
        let targetGroupId: string | undefined;
        for (const group of Object.values(groups)) {
          const inBoundsX = nodeCenterX >= group.position.x && nodeCenterX <= group.position.x + group.size.width;
          const inBoundsY = nodeCenterY >= group.position.y && nodeCenterY <= group.position.y + group.size.height;
          if (inBoundsX && inBoundsY) {
            targetGroupId = group.id;
            break;
          }
        }

        const currentGroupId = nodes.find((n) => n.id === moved.id)?.groupId;
        if (targetGroupId !== currentGroupId) {
          setNodeGroupId(moved.id, targetGroupId);
        }
        if (targetGroupId) groupsToClamp.add(targetGroupId);
      });

      // Ensure nodes remain inside group after drop
      groupsToClamp.forEach((gid) => clampNodesToGroup(gid));
    },
    [groups, nodes, setNodeGroupId, clampNodesToGroup]
  );

  // Connection validation - checks if a connection is valid based on handle types and node types
  // Defined inside component to have access to nodes array for video validation
  const isValidConnection = useCallback(
    (connection: Connection | Edge): boolean =>
      isValidWorkflowConnection(connection, nodes),
    [nodes]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) return;

      // For imageCompare nodes, redirect to the second handle if the first is occupied
      const resolveImageCompareHandle = (conn: Connection, batchUsed?: Set<string>): Connection => {
        const targetNode = nodes.find((n) => n.id === conn.target);
        if (targetNode?.type === "imageCompare" && conn.targetHandle === "image") {
          const imageOccupied = edges.some(
            (e) => e.target === conn.target && e.targetHandle === "image"
          ) || batchUsed?.has("image");
          if (imageOccupied) {
            return { ...conn, targetHandle: "image-1" };
          }
        }
        return conn;
      };

      // For Router nodes, resolve generic handles to typed handles
      const resolveRouterHandle = (conn: Connection): Connection => {
        const targetNode = nodes.find((n) => n.id === conn.target);
        if (targetNode?.type !== "router") return conn;

        // If targeting a generic handle, transform to typed handle
        if (conn.targetHandle === "generic-input") {
          const sourceType = getHandleType(conn.sourceHandle);
          if (sourceType) {
            return { ...conn, targetHandle: sourceType };
          }
        }
        return conn;
      };

      // For Router source nodes, resolve generic output handles to typed handles
      const resolveRouterSourceHandle = (conn: Connection): Connection => {
        const sourceNode = nodes.find((n) => n.id === conn.source);
        if (sourceNode?.type !== "router") return conn;
        if (conn.sourceHandle === "generic-output") {
          const targetType = getHandleType(conn.targetHandle);
          if (targetType) {
            return { ...conn, sourceHandle: targetType };
          }
        }
        return conn;
      };

      // For Switch nodes, resolve generic-input to the source's handle type and update inputType
      const resolveSwitchHandle = (conn: Connection): Connection => {
        const targetNode = nodes.find((n) => n.id === conn.target);
        if (targetNode?.type !== "switch") return conn;

        // If targeting the generic-input handle, resolve to the source handle type
        if (conn.targetHandle === "generic-input") {
          const sourceType = getHandleType(conn.sourceHandle);
          if (sourceType) {
            // Update the Switch node's inputType in data so output handles render
            updateNodeData(conn.target, { inputType: sourceType as HandleType });
            return { ...conn, targetHandle: sourceType };
          }
        }
        return conn;
      };

      // Get all selected nodes
      const selectedNodes = nodes.filter((node) => node.selected);
      const sourceNode = nodes.find((node) => node.id === connection.source);

      // If the source node is selected and there are multiple selected nodes,
      // connect all selected nodes that have the same source handle type
      if (sourceNode?.selected && selectedNodes.length > 1 && connection.sourceHandle) {
        const batchUsed = new Set<string>();

        selectedNodes.forEach((node) => {
          // Skip if this is already the connection source
          if (node.id === connection.source) {
            let resolved = resolveImageCompareHandle(connection, batchUsed);
            resolved = resolveRouterHandle(resolved);
            resolved = resolveRouterSourceHandle(resolved);
            resolved = resolveSwitchHandle(resolved);
            if (resolved.targetHandle) batchUsed.add(resolved.targetHandle);
            onConnect(resolved);
            return;
          }

          // Check if this node actually has the same output handle type
          const nodeHandles = getNodeHandles(node.type || "");
          if (!nodeHandles.outputs.includes(connection.sourceHandle as string)) {
            // This node doesn't have the same output handle type, skip it
            return;
          }

          // Create connection from this selected node to the same target
          let multiConnection: Connection = {
            source: node.id,
            sourceHandle: connection.sourceHandle,
            target: connection.target,
            targetHandle: connection.targetHandle,
          };

          let resolved = resolveImageCompareHandle(multiConnection, batchUsed);
          resolved = resolveRouterHandle(resolved);
          resolved = resolveRouterSourceHandle(resolved);
          resolved = resolveSwitchHandle(resolved);
          if (resolved.targetHandle) batchUsed.add(resolved.targetHandle);
          if (isValidConnection(resolved)) {
            onConnect(resolved);
          }
        });
      } else {
        // Single connection
        let resolved = resolveImageCompareHandle(connection);
        resolved = resolveRouterHandle(resolved);
        resolved = resolveRouterSourceHandle(resolved);
        resolved = resolveSwitchHandle(resolved);
        onConnect(resolved);
      }
    },
    [onConnect, nodes, edges]
  );

  // Handle connection dropped on empty space or on a node
  const handleConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      // If connection was completed normally, nothing to do
      if (connectionState.isValid || !connectionState.fromNode) {
        return;
      }

      const { clientX, clientY } = event as MouseEvent;
      const fromHandleId = connectionState.fromHandle?.id || null;
      let fromHandleType = getHandleType(fromHandleId); // Use getHandleType for dynamic handles
      const isFromSource = connectionState.fromHandle?.type === "source";

      // Switch output handles have dynamic IDs — resolve type from node's inputType
      if (!fromHandleType && connectionState.fromNode.type === "switch") {
        const switchData = connectionState.fromNode.data as { inputType?: string | null };
        if (switchData.inputType) {
          fromHandleType = switchData.inputType as "image" | "text" | "video" | "audio" | "3d" | "easeCurve";
        }
      }

      // ConditionalSwitch output handles have dynamic IDs (rule-xxx, default) — always text type
      if (!fromHandleType && connectionState.fromNode.type === "conditionalSwitch") {
        fromHandleType = "text";
      }

      // Helper to find a compatible handle on a node by type
      const findCompatibleHandle = (
        node: Node,
        handleType: "image" | "text" | "video" | "audio" | "3d" | "easeCurve",
        needInput: boolean,
        batchUsed?: Set<string>
      ): string | null => {
        // Check for dynamic inputSchema first
        const nodeData = node.data as { inputSchema?: Array<{ name: string; type: string }> };
        if (nodeData.inputSchema && nodeData.inputSchema.length > 0) {
          if (needInput) {
            // Find input handles matching the type
            const matchingInputs = nodeData.inputSchema.filter(i => i.type === handleType);
            const numHandles = matchingInputs.length;
            if (numHandles > 0) {
              // Find the first unoccupied indexed handle by checking existing edges and batchUsed
              for (let i = 0; i < numHandles; i++) {
                const candidateHandle = `${handleType}-${i}`;
                const isOccupied = edges.some(
                  (edge) => edge.target === node.id && edge.targetHandle === candidateHandle
                ) || batchUsed?.has(candidateHandle);
                if (!isOccupied) {
                  return candidateHandle;
                }
              }
              // All handles are occupied
              return null;
            }
          }
          // Output handle - check for video, 3d, or image type
          if (handleType === "video") return "video";
          if (handleType === "3d") return "3d";
          return handleType === "image" ? "image" : null;
        }

        // Router accepts any type — use typed handle if exists, otherwise generic
        if (node.type === "router" && needInput) {
          // Router accepts any type — use typed handle if that type is already active
          return handleType;
        }
        if (node.type === "router" && !needInput) {
          return handleType;
        }

        // Switch accepts any type on input, outputs match inputType
        if (node.type === "switch" && needInput) {
          return "generic-input";
        }
        if (node.type === "switch" && !needInput) {
          const switchData = node.data as { switches?: Array<{ id: string; enabled: boolean }> };
          // Return first enabled switch output handle ID
          if (switchData.switches && switchData.switches.length > 0) {
            const firstEnabled = switchData.switches.find(s => s.enabled);
            if (firstEnabled) return firstEnabled.id;
          }
          return null;
        }

        // Conditional Switch: text input, dynamic rule outputs
        if (node.type === "conditionalSwitch" && handleType === "text") {
          if (needInput) {
            return "text";
          } else {
            // Return first rule ID from node data
            const condData = node.data as { rules?: Array<{ id: string }> };
            if (condData.rules && condData.rules.length > 0) {
              return condData.rules[0].id;
            }
            return "default";
          }
        }

        // Fall back to static handles
        const staticHandles = getNodeHandles(node.type || "");
        const handleList = needInput ? staticHandles.inputs : staticHandles.outputs;

        // First try exact match
        if (handleList.includes(handleType)) return handleType;

        // Output node has dedicated video handle
        // Then check each handle's type
        for (const h of handleList) {
          if (getHandleType(h) === handleType) return h;
        }

        return null;
      };

      // Check if we dropped on a node by looking for node elements under the cursor
      const elementsUnderCursor = document.elementsFromPoint(clientX, clientY);
      const nodeElement = elementsUnderCursor.find((el) => {
        // React Flow nodes have data-id attribute
        return el.closest(".react-flow__node");
      });

      if (nodeElement) {
        const nodeWrapper = nodeElement.closest(".react-flow__node") as HTMLElement;
        const targetNodeId = nodeWrapper?.dataset.id;

        if (targetNodeId && targetNodeId !== connectionState.fromNode.id && fromHandleType) {
          const targetNode = nodes.find((n) => n.id === targetNodeId);

          if (targetNode) {
            // Find a compatible handle on the target node
            const compatibleHandle = findCompatibleHandle(
              targetNode,
              fromHandleType,
              isFromSource // need input if dragging from output
            );

            if (compatibleHandle) {
              // Create the connection
              const connection: Connection = isFromSource
                ? {
                    source: connectionState.fromNode.id,
                    sourceHandle: fromHandleId,
                    target: targetNodeId,
                    targetHandle: compatibleHandle,
                  }
                : {
                    source: targetNodeId,
                    sourceHandle: compatibleHandle,
                    target: connectionState.fromNode.id,
                    targetHandle: fromHandleId,
                  };

              if (isValidConnection(connection)) {
                handleConnect(connection);
                return; // Connection made, don't show menu
              }
            }
          }
        }
      }

      // No node under cursor or no compatible handle - show the drop menu
      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });

      setConnectionDrop({
        position: { x: clientX, y: clientY },
        flowPosition: flowPos,
        handleType: fromHandleType,
        connectionType: isFromSource ? "source" : "target",
        sourceNodeId: connectionState.fromNode.id,
        sourceHandleId: fromHandleId,
      });
    },
    [screenToFlowPosition, nodes, edges, handleConnect]
  );

  // Helper to get image from a node
  const getImageFromNode = useCallback((nodeId: string): string | null => {
    const node = getNodeById(nodeId);
    if (!node) return null;

    switch (node.type) {
      case "mediaInput": {
        const d = node.data as { mode?: string; image?: string | null; capturedImage?: string | null };
        return d.mode === "3d" ? (d.capturedImage ?? null) : (d.image ?? null);
      }
      case "annotation":
        return (node.data as { outputImage: string | null }).outputImage;
      case "generateImage":
        return (node.data as { outputImage: string | null }).outputImage;
      default:
        return null;
    }
  }, [getNodeById]);

  // Handle workflow generation from chat conversation
  const handleBuildWorkflow = useCallback(async (description: string) => {
    setIsBuildingWorkflow(true);
    try {
      const quickstartDefaults = getQuickstartDefaults();
      const provider = quickstartDefaults?.provider ?? "google";
      const model =
        quickstartDefaults?.model ??
        (provider === "openai"
          ? "gpt-4.1-mini"
          : provider === "anthropic"
            ? "claude-sonnet-4.5"
            : "gemini-3-flash-preview");
      const systemInstructionExtra = getQuickstartSystemInstructionExtra();

      const response = await fetch("/api/quickstart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          contentLevel: "full",
          provider,
          model,
          systemInstructionExtra,
        }),
      });

      const data = await response.json();

      if (data.success && data.workflow) {
        captureSnapshot(); // Capture BEFORE loading new workflow
        await loadWorkflow(data.workflow, undefined, { preserveSnapshot: true });
        setIsChatOpen(false);
        showToast("Workflow generated successfully", "success");
      } else {
        showToast(data.error || "Failed to generate workflow", "error");
      }
    } catch (error) {
      console.error("Error generating workflow:", error);
      showToast("Failed to generate workflow. Please try again.", "error");
    } finally {
      setIsBuildingWorkflow(false);
    }
  }, [loadWorkflow, showToast, captureSnapshot]);

  // Create lightweight workflow state for chat (strip base64 images)
  const chatWorkflowState = useMemo(() => {
    const strippedNodes = stripBinaryData(nodes);
    const groupIdByNodeId = new Map(nodes.map((n) => [n.id, n.groupId]));
    const groupEntries = Object.entries(groups ?? {});
    return {
      nodes: strippedNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        groupId: groupIdByNodeId.get(n.id),
        data: n.data,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined,
        targetHandle: e.targetHandle || undefined,
      })),
      ...(groupEntries.length > 0
        ? {
            groups: Object.fromEntries(
              groupEntries.map(([id, g]) => [
                id,
                {
                  name: g.name,
                  color: g.color,
                  locked: g.locked,
                  position: g.position,
                  size: g.size,
                },
              ])
            ),
          }
        : {}),
    };
  }, [nodes, edges, groups]);

  // Compute selected node IDs for chat context scoping
  const selectedNodeIds = useMemo(() => nodes.filter(n => n.selected).map(n => n.id), [nodes]);

  // Handle applying edit operations from chat
  const handleApplyEdits = useCallback((operations: EditOperation[]) => {
    const typedChunk =
      operations?.some((op) => (op as any)?.__flowyTypingChunk === true) ||
      operations?.some((op) => (op as any)?.__flowyTyping === true) ||
      operations?.some((op) => (op as any)?.__flowyTypingStart === true);

    const shouldCaptureSnapshot =
      !typedChunk ||
      operations?.some((op) => (op as any)?.__flowyTypingStart === true);

    if (shouldCaptureSnapshot) {
      captureSnapshot();
    }
    const result = applyEditOperations(operations);
    if (!typedChunk && result.applied > 1) {
      showToast(`Applied ${result.applied} edits`, "success");
    }
    if (result.skipped.length > 0) {
      console.warn('Skipped operations:', result.skipped);
    }

    // Auto-pan to the first newly added node so the user sees it appear on canvas
    if (!typedChunk) {
      const addedNode = operations.find((op) => op.type === "addNode");
      if (addedNode && addedNode.type === "addNode" && addedNode.position) {
        const pos = addedNode.position;
        setCenter(pos.x + 150, pos.y + 75, { duration: 400, zoom: getViewport().zoom });
      }
    }

    return result;
  }, [captureSnapshot, applyEditOperations, showToast, setCenter, getViewport]);

  // Handle node selection from drop menu
  const handleMenuSelect = useCallback(
    (selection: { type: NodeType | MenuAction; isAction: boolean }) => {
      if (!connectionDrop) return;

      const { flowPosition, sourceNodeId, sourceHandleId, connectionType, handleType } = connectionDrop;

      // Handle actions differently from node creation
      if (selection.isAction) {
        setConnectionDrop(null);
        return;
      }

      // Regular node creation
      const nodeType = selection.type as NodeType;

      // Create the new node at the drop position
      const newNodeId = addNode(nodeType, flowPosition);

      // If creating an annotation node from an image source, populate it with the source image
      if (nodeType === "annotation" && connectionType === "source" && handleType === "image" && sourceNodeId) {
        const sourceImage = getImageFromNode(sourceNodeId);
        if (sourceImage) {
          updateNodeData(newNodeId, { sourceImage, outputImage: sourceImage });
        }
      }

      // Determine the correct handle IDs for the new node based on its type
      let targetHandleId: string | null = null;
      let sourceHandleIdForNewNode: string | null = null;

      // Map handle type to the correct handle ID based on node type
      // Note: New nodes start with default handles (image, text) before a model is selected

      // Router accepts and outputs all types — use the connection's handle type
      if (nodeType === "router") {
        if (handleType) {
          targetHandleId = handleType;
          sourceHandleIdForNewNode = handleType;
        }
      } else if (nodeType === "switch") {
        // Switch input: use the actual type so the edge stores the correct handle type
        // (onConnect bypasses resolveSwitchHandle, so we must resolve here)
        targetHandleId = handleType || "generic-input";
        if (handleType) {
          updateNodeData(newNodeId, { inputType: handleType as HandleType });
        }
        // Switch outputs use dynamic handle IDs (switch entry IDs)
        sourceHandleIdForNewNode = null;
      } else if (nodeType === "conditionalSwitch") {
        // Conditional Switch: text input and dynamic rule outputs
        targetHandleId = "text";
        // Source handle is the first rule ID or "default"
        const nodeDataCheck = nodes.find(n => n.id === newNodeId);
        if (nodeDataCheck && nodeDataCheck.data) {
          const condData = nodeDataCheck.data as { rules?: Array<{ id: string }> };
          sourceHandleIdForNewNode = condData.rules && condData.rules.length > 0 ? condData.rules[0].id : "default";
        } else {
          sourceHandleIdForNewNode = "default";
        }
      } else if (handleType === "image") {
        if (nodeType === "annotation" || nodeType === "imageCompare") {
          targetHandleId = "image";
          // annotation also has an image output
          if (nodeType === "annotation") {
            sourceHandleIdForNewNode = "image";
          }
        } else if (nodeType === "generateImage" || nodeType === "generateVideo") {
          targetHandleId = "image";
        } else if (nodeType === "mediaInput") {
          sourceHandleIdForNewNode = "image";
        }
      } else if (handleType === "text") {
        if (nodeType === "generateImage" || nodeType === "generateVideo" || nodeType === "generateAudio" || nodeType === "prompt") {
          targetHandleId = "text";
          if (nodeType === "prompt") {
            sourceHandleIdForNewNode = "text";
          }
        }
      } else if (handleType === "video") {
        if (nodeType === "easeCurve") {
          // EaseCurve accepts video input and outputs video
          targetHandleId = "video";
          sourceHandleIdForNewNode = "video";
        } else if (nodeType === "generateVideo") {
          // GenerateVideo outputs video
          sourceHandleIdForNewNode = "video";
        }
      } else if (handleType === "audio") {
        if (nodeType === "mediaInput") {
          // Audio node: accepts audio input and outputs audio
          targetHandleId = "audio";
          sourceHandleIdForNewNode = "audio";
        } else if (nodeType === "generateAudio") {
          // GenerateAudio outputs audio (no audio input to wire to)
          sourceHandleIdForNewNode = "audio";
        }
      } else if (handleType === "3d") {
        if (nodeType === "glbViewer" || nodeType === "mediaInput") {
          targetHandleId = "3d";
        } else if (nodeType === "generateImage") {
          sourceHandleIdForNewNode = "3d";
        }
      } else if (handleType === "easeCurve") {
        if (nodeType === "easeCurve") {
          targetHandleId = "easeCurve";
          sourceHandleIdForNewNode = "easeCurve";
        }
      }

      // Get all selected nodes to connect them all to the new node
      const selectedNodes = nodes.filter((node) => node.selected);
      const sourceNode = nodes.find((node) => node.id === sourceNodeId);

      // If the source node is selected and there are multiple selected nodes,
      // connect all selected nodes to the new node
      if (sourceNode?.selected && selectedNodes.length > 1 && sourceHandleId) {
        const batchUsed = new Set<string>();

        selectedNodes.forEach((node) => {
          if (connectionType === "source" && targetHandleId) {
            // For imageCompare, alternate between image and image-1
            let resolvedTargetHandle = targetHandleId;
            if (nodeType === "imageCompare" && targetHandleId === "image" && batchUsed.has("image")) {
              resolvedTargetHandle = "image-1";
            }
            batchUsed.add(resolvedTargetHandle);

            // Dragging from source (output), connect selected nodes to new node's input
            const connection: Connection = {
              source: node.id,
              sourceHandle: sourceHandleId,
              target: newNodeId,
              targetHandle: resolvedTargetHandle,
            };
            if (isValidConnection(connection)) {
              onConnect(connection);
            }
          } else if (connectionType === "target" && sourceHandleIdForNewNode) {
            // Dragging from target (input), connect from new node's output to selected nodes
            const connection: Connection = {
              source: newNodeId,
              sourceHandle: sourceHandleIdForNewNode,
              target: node.id,
              targetHandle: sourceHandleId,
            };
            if (isValidConnection(connection)) {
              onConnect(connection);
            }
          }
        });
      } else {
        // Single node connection (original behavior)
        if (connectionType === "source" && sourceNodeId && sourceHandleId && targetHandleId) {
          // Dragging from source (output), connect to new node's input
          const connection: Connection = {
            source: sourceNodeId,
            sourceHandle: sourceHandleId,
            target: newNodeId,
            targetHandle: targetHandleId,
          };
          onConnect(connection);
        } else if (connectionType === "target" && sourceNodeId && sourceHandleId && sourceHandleIdForNewNode) {
          // Dragging from target (input), connect from new node's output
          const connection: Connection = {
            source: newNodeId,
            sourceHandle: sourceHandleIdForNewNode,
            target: sourceNodeId,
            targetHandle: sourceHandleId,
          };
          onConnect(connection);
        }
      }

      setConnectionDrop(null);
    },
    [connectionDrop, addNode, onConnect, nodes, getImageFromNode, updateNodeData]
  );

  const handleCloseDropMenu = useCallback(() => {
    setConnectionDrop(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const nodeElement = target.closest(".react-flow__node");
    const nodeId = nodeElement instanceof HTMLElement ? nodeElement.dataset?.id : undefined;
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  }, []);

  // Get copy/paste functions and clipboard from store
  const copySelectedNodes = useWorkflowStore((state) => state.copySelectedNodes);
  const pasteNodes = useWorkflowStore((state) => state.pasteNodes);
  const clearClipboard = useWorkflowStore((state) => state.clearClipboard);
  const clipboard = useWorkflowStore((state) => state.clipboard);

  // Add non-passive wheel listener to handle zoom/pan and prevent browser navigation
  // This replaces the onWheel prop which is passive by default and can't preventDefault
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;

    const handleWheelNonPassive = (event: WheelEvent) => {
      // Skip if modal is open
      if (isModalOpen) return;

      // Check if scrolling over a scrollable element
      const target = event.target as HTMLElement;
      const scrollableElement = findScrollableAncestor(target, event.deltaX, event.deltaY);
      if (scrollableElement) return;

      const { zoomMode } = canvasNavigationSettings;

      // Check if zoom should be triggered based on settings
      const shouldZoom =
        zoomMode === "scroll" ||
        (zoomMode === "altScroll" && event.altKey) ||
        (zoomMode === "ctrlScroll" && (event.ctrlKey || event.metaKey));

      // Pinch gesture (ctrlKey + trackpad) always zooms regardless of settings
      if (event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (event.deltaY < 0) zoomIn();
        else zoomOut();
        return;
      }

      // On macOS, differentiate trackpad from mouse
      if (isMacOS) {
        if (isMouseWheel(event)) {
          // Mouse wheel → zoom if settings allow
          if (shouldZoom) {
            event.preventDefault();
            if (event.deltaY < 0) zoomIn();
            else zoomOut();
          }
        } else {
          // Trackpad scroll
          if (shouldZoom) {
            // Zoom
            event.preventDefault();
            if (event.deltaY < 0) zoomIn();
            else zoomOut();
          } else {
            // Pan (also prevent horizontal swipe navigation)
            event.preventDefault();
            const viewport = getViewport();
            setViewport({
              x: viewport.x - event.deltaX,
              y: viewport.y - event.deltaY,
              zoom: viewport.zoom,
            });
          }
        }
        return;
      }

      // Non-macOS
      if (shouldZoom) {
        event.preventDefault();
        if (event.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };

    wrapper.addEventListener('wheel', handleWheelNonPassive, { passive: false });
    return () => {
      wrapper.removeEventListener('wheel', handleWheelNonPassive);
    };
  }, [isModalOpen, zoomIn, zoomOut, getViewport, setViewport, canvasNavigationSettings]);

  // Keyboard shortcuts for copy/paste and stacking selected nodes
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Ignore if user is typing in an input field
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    // Select all (Ctrl/Cmd + A)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if (nodes.length > 0) {
        onNodesChange(
          nodes.map((n) => ({ type: "select" as const, id: n.id, selected: true }))
        );
      }
      return;
    }

    // Handle keyboard shortcuts dialog (? key)
    if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setShortcutsDialogOpen(true);
      return;
    }

    // Handle workflow execution (Ctrl/Cmd + Enter)
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      executeWorkflow();
      return;
    }

    // Handle copy (Ctrl/Cmd + C)
    if ((event.ctrlKey || event.metaKey) && event.key === "c") {
      event.preventDefault();
      copySelectedNodes();
      return;
    }

      // Helper to get viewport center position in flow coordinates
      const getViewportCenter = () => {
        const viewport = getViewport();
        const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
        const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
        return { centerX, centerY };
      };

      // Handle node creation hotkeys (Shift + key)
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        let nodeType: NodeType | null = null;

        switch (key) {
          case "p":
            nodeType = "prompt";
            break;
          case "i":
            nodeType = "mediaInput";
            break;
          case "g":
            nodeType = "generateImage";
            break;
          case "v":
            nodeType = "generateVideo";
            break;
          case "l":
            nodeType = "prompt";
            break;
          case "a":
            nodeType = "annotation";
            break;
          case "t":
            nodeType = "generateAudio";
            break;
        }

        if (nodeType) {
          event.preventDefault();
          const { centerX, centerY } = getViewportCenter();
          const dims = defaultNodeDimensions[nodeType];
          addNode(nodeType, { x: centerX - dims.width / 2, y: centerY - dims.height / 2 });
          return;
        }
      }

      // Handle paste (Ctrl/Cmd + V)
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        event.preventDefault();

        // If we have nodes in the internal clipboard, prioritize pasting those
        if (clipboard && clipboard.nodes.length > 0) {
          pasteNodes();
          clearClipboard(); // Clear so next paste uses system clipboard
          return;
        }

        // Check system clipboard for images first, then text
        navigator.clipboard.read().then(async (items) => {
          for (const item of items) {
            // Check for image
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              const reader = new FileReader();
              reader.onload = (e) => {
                const dataUrl = e.target?.result as string;

                const img = new Image();
                img.onload = () => {
                  // Check if a media/image input node is selected - if so, update it instead of creating new
                  const selectedInputNode = nodes.find(
                    (node) =>
                      node.selected &&
                      node.type === "mediaInput"
                  );

                  if (selectedInputNode) {
                    const updates: Record<string, unknown> = {
                      image: dataUrl,
                      imageRef: undefined,
                      filename: `pasted-${Date.now()}.png`,
                      dimensions: { width: img.width, height: img.height },
                    };
                    if (selectedInputNode.type === "mediaInput") {
                      updates.mode = "image";
                    }
                    updateNodeData(selectedInputNode.id, updates);
                  } else {
                    const viewport = getViewport();
                    const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
                    const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
                    const nodeId = addNode("mediaInput", { x: centerX - 150, y: centerY - 140 });
                    updateNodeData(nodeId, {
                      mode: "image",
                      image: dataUrl,
                      filename: `pasted-${Date.now()}.png`,
                      dimensions: { width: img.width, height: img.height },
                    });
                  }
                };
                img.src = dataUrl;
              };
              reader.readAsDataURL(blob);
              return; // Exit after handling image
            }

            // Check for text
            if (item.types.includes('text/plain')) {
              const blob = await item.getType('text/plain');
              const text = await blob.text();
              if (text.trim()) {
                const viewport = getViewport();
                const centerX = (-viewport.x + window.innerWidth / 2) / viewport.zoom;
                const centerY = (-viewport.y + window.innerHeight / 2) / viewport.zoom;
                // Prompt node default dimensions: 320x220
                const nodeId = addNode("prompt", { x: centerX - 160, y: centerY - 110 });
                updateNodeData(nodeId, { prompt: text });
                return; // Exit after handling text
              }
            }
          }
        }).catch(() => {
          // Clipboard API failed - nothing to paste
        });
        return;
      }

      const selectedNodes = nodes.filter((node) => node.selected);
      if (selectedNodes.length < 2) return;

      const STACK_GAP = 20;

      if (event.key === "v" || event.key === "V") {
        // Stack vertically - sort by current y position to maintain relative order
        const sortedNodes = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);

        // Use the leftmost x position as the alignment point
        const alignX = Math.min(...sortedNodes.map((n) => n.position.x));

        let currentY = sortedNodes[0].position.y;

        sortedNodes.forEach((node) => {
          const nodeHeight = (node.style?.height as number) || (node.measured?.height) || 200;

          onNodesChange([
            {
              type: "position",
              id: node.id,
              position: { x: alignX, y: currentY },
            },
          ]);

          currentY += nodeHeight + STACK_GAP;
        });
      } else if (event.key === "h" || event.key === "H") {
        // Stack horizontally - sort by current x position to maintain relative order
        const sortedNodes = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);

        // Use the topmost y position as the alignment point
        const alignY = Math.min(...sortedNodes.map((n) => n.position.y));

        let currentX = sortedNodes[0].position.x;

        sortedNodes.forEach((node) => {
          const nodeWidth = (node.style?.width as number) || (node.measured?.width) || 220;

          onNodesChange([
            {
              type: "position",
              id: node.id,
              position: { x: currentX, y: alignY },
            },
          ]);

          currentX += nodeWidth + STACK_GAP;
        });
      } else if (event.key === "g" || event.key === "G") {
        // Arrange as grid
        const count = selectedNodes.length;
        const cols = Math.ceil(Math.sqrt(count));

        // Sort nodes by their current position (top-to-bottom, left-to-right)
        const sortedNodes = [...selectedNodes].sort((a, b) => {
          const rowA = Math.floor(a.position.y / 100);
          const rowB = Math.floor(b.position.y / 100);
          if (rowA !== rowB) return rowA - rowB;
          return a.position.x - b.position.x;
        });

        // Find the starting position (top-left of bounding box)
        const startX = Math.min(...sortedNodes.map((n) => n.position.x));
        const startY = Math.min(...sortedNodes.map((n) => n.position.y));

        // Get max node dimensions for consistent spacing
        const maxWidth = Math.max(
          ...sortedNodes.map((n) => (n.style?.width as number) || (n.measured?.width) || 220)
        );
        const maxHeight = Math.max(
          ...sortedNodes.map((n) => (n.style?.height as number) || (n.measured?.height) || 200)
        );

        // Position each node in the grid
        sortedNodes.forEach((node, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);

          onNodesChange([
            {
              type: "position",
              id: node.id,
              position: {
                x: startX + col * (maxWidth + STACK_GAP),
                y: startY + row * (maxHeight + STACK_GAP),
              },
            },
          ]);
        });
      }
  }, [nodes, onNodesChange, copySelectedNodes, pasteNodes, clearClipboard, clipboard, getViewport, addNode, updateNodeData, executeWorkflow, setShortcutsDialogOpen]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);


  // Fix for React Flow selection bug where nodes with undefined bounds get incorrectly selected.
  // Uses statistical outlier detection to identify and deselect nodes that are clearly
  // outside the actual selection area.
  const handleSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
    if (selectedNodes.length <= 1) return;

    // Get positions of all selected nodes
    const positions = selectedNodes.map(n => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
    }));

    // Calculate IQR-based bounds for outlier detection
    const sortedX = [...positions].sort((a, b) => a.x - b.x);
    const sortedY = [...positions].sort((a, b) => a.y - b.y);

    const q1X = sortedX[Math.floor(sortedX.length * 0.25)].x;
    const q3X = sortedX[Math.floor(sortedX.length * 0.75)].x;
    const q1Y = sortedY[Math.floor(sortedY.length * 0.25)].y;
    const q3Y = sortedY[Math.floor(sortedY.length * 0.75)].y;
    const iqrX = q3X - q1X;
    const iqrY = q3Y - q1Y;

    // Outlier threshold: 3x IQR from quartiles
    const minX = q1X - iqrX * 3;
    const maxX = q3X + iqrX * 3;
    const minY = q1Y - iqrY * 3;
    const maxY = q3Y + iqrY * 3;

    // Find and deselect outliers
    const outliers = positions.filter(p =>
      p.x < minX || p.x > maxX || p.y < minY || p.y > maxY
    );

    if (outliers.length > 0) {
      onNodesChange(
        outliers.map(o => ({
          type: 'select' as const,
          id: o.id,
          selected: false,
        }))
      );
    }
  }, [onNodesChange]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    // Check if dragging a node type from the action bar
    const hasNodeType = Array.from(event.dataTransfer.types).includes("application/node-type");
    if (hasNodeType) {
      setIsDragOver(true);
      setDropType("node");
      return;
    }

    // Check if dragging a history image
    const hasHistoryImage = Array.from(event.dataTransfer.types).includes("application/history-image");
    if (hasHistoryImage) {
      setIsDragOver(true);
      setDropType("image");
      return;
    }

    // Check if dragging files that are images or JSON
    const items = Array.from(event.dataTransfer.items);
    const hasImageFile = items.some(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    );
    const hasJsonFile = items.some(
      (item) => item.kind === "file" && item.type === "application/json"
    );

    const hasAudioFile = items.some(
      (item) => item.kind === "file" && item.type.startsWith("audio/")
    );

    if (hasJsonFile) {
      setIsDragOver(true);
      setDropType("workflow");
    } else if (hasAudioFile) {
      setIsDragOver(true);
      setDropType("audio");
    } else if (hasImageFile) {
      setIsDragOver(true);
      setDropType("image");
    }
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    setDropType(null);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      setDropType(null);

      // Check for node type drop from action bar
      const nodeType = event.dataTransfer.getData("application/node-type") as NodeType;
      if (nodeType) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        addNode(nodeType, position);
        return;
      }

      // Check for history image drop
      const historyImageData = event.dataTransfer.getData("application/history-image");
      if (historyImageData) {
        try {
          const { image, prompt } = JSON.parse(historyImageData);
          const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });

          const nodeId = addNode("mediaInput", position);
          const img = new Image();
          img.onload = () => {
            updateNodeData(nodeId, {
              mode: "image",
              image: image,
              filename: `history-${Date.now()}.png`,
              dimensions: { width: img.width, height: img.height },
            });
          };
          img.src = image;
          return;
        } catch (err) {
          console.error("Failed to parse history image data:", err);
        }
      }

      const allFiles = Array.from(event.dataTransfer.files);

      // Check for JSON workflow files first
      const jsonFiles = allFiles.filter((file) => file.type === "application/json" || file.name.endsWith(".json"));
      if (jsonFiles.length > 0) {
        const file = jsonFiles[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const workflow = JSON.parse(e.target?.result as string) as WorkflowFile;
            if (workflow.version && workflow.nodes && workflow.edges) {
              await loadWorkflow(workflow);
            } else {
              alert("Invalid workflow file format");
            }
          } catch {
            alert("Failed to parse workflow file");
          }
        };
        reader.readAsText(file);
        return;
      }

      // Handle audio files
      const audioFiles = allFiles.filter((file) => file.type.startsWith("audio/"));
      if (audioFiles.length > 0) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        audioFiles.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const nodeId = addNode("mediaInput", {
              x: position.x + index * 240,
              y: position.y,
            });
            const audio = new Audio(dataUrl);
            const applyData = (dur: number | null) => {
              updateNodeData(nodeId, {
                mode: "audio",
                audioFile: dataUrl,
                filename: file.name,
                format: file.type,
                duration: dur,
              });
            };
            audio.onloadedmetadata = () => applyData(audio.duration);
            audio.onerror = () => applyData(null);
          };
          reader.readAsDataURL(file);
        });
        return;
      }

      // Handle GLB (3D) files
      const glbFiles = allFiles.filter((file) => file.name.toLowerCase().endsWith(".glb"));
      if (glbFiles.length > 0) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        glbFiles.forEach((file, index) => {
          const url = URL.createObjectURL(file);
          const nodeId = addNode("mediaInput", {
            x: position.x + index * 260,
            y: position.y,
          });
          updateNodeData(nodeId, {
            mode: "3d",
            glbUrl: url,
            filename: file.name,
            capturedImage: null,
          });
        });
        return;
      }

      // Handle image files
      const imageFiles = allFiles.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      // Get the drop position in flow coordinates
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Create a node for each dropped image
      imageFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;

          // Create image to get dimensions
          const img = new Image();
          img.onload = () => {
            const nodeId = addNode("mediaInput", {
              x: position.x + index * 240,
              y: position.y,
            });
            updateNodeData(nodeId, {
              mode: "image",
              image: dataUrl,
              filename: file.name,
              dimensions: { width: img.width, height: img.height },
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    },
    [screenToFlowPosition, addNode, updateNodeData, loadWorkflow]
  );

  return (
    <div
      ref={reactFlowWrapper}
      className={`flex-1 bg-canvas-bg relative ${isDragOver ? "ring-2 ring-inset ring-blue-500" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
    >
      {/* Drop overlay indicator */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/10 z-50 pointer-events-none flex items-center justify-center">
          <div className="bg-neutral-800 border border-neutral-600 rounded-lg px-6 py-4 shadow-xl">
            <p className="text-neutral-200 text-sm font-medium">
              {dropType === "workflow"
                ? "Drop to load workflow"
                : dropType === "node"
                ? "Drop to create node"
                : dropType === "audio"
                ? "Drop audio to create node"
                : "Drop image to create node"}
            </p>
          </div>
        </div>
      )}

      {/* New Project Setup Modal */}
      {showNewProjectSetup && (
        <ProjectSetupModal
          isOpen={showNewProjectSetup}
          mode="new"
          onSave={(id, name, directoryPath) => {
            setWorkflowMetadata(id, name, directoryPath);
            setShowNewProjectSetup(false);
          }}
          onClose={() => setShowNewProjectSetup(false)}
        />
      )}

      <ReactFlow
        nodes={allNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        selectionOnDrag={!isModalOpen && canvasNavigationSettings.panMode !== "always"}
        selectionKeyCode={
          isModalOpen ? null
            : canvasNavigationSettings.selectionMode === "altDrag" ? "Alt"
            : canvasNavigationSettings.selectionMode === "shiftDrag" ? "Shift"
            : "Shift"
        }
        panOnDrag={
          isModalOpen
            ? false
            : canvasNavigationSettings.panMode === "always"
            ? true
            : canvasNavigationSettings.panMode === "middleMouse"
            ? [2]
            : false
        }
        selectNodesOnDrag={!isModalOpen && canvasNavigationSettings.panMode !== "always"}
        nodeDragThreshold={5}
        nodeClickDistance={5}
        zoomOnScroll={false}
        zoomOnPinch={!isModalOpen}
        minZoom={0.1}
        maxZoom={4}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        panActivationKeyCode={
          isModalOpen
            ? null
            : canvasNavigationSettings.panMode === "space"
            ? "Space"
            : null
        }
        nodesDraggable={!isModalOpen}
        nodesConnectable={!isModalOpen}
        elementsSelectable={!isModalOpen}
        className="bg-neutral-900"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={defaultEdgeOptions}
      >
        <SharedEdgeGradients />
        <GroupBackgroundsPortal />
        <GroupControlsOverlay />
        <Controls className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg [&>button]:bg-neutral-800 [&>button]:border-neutral-700 [&>button]:fill-neutral-300 [&>button:hover]:bg-neutral-700 [&>button:hover]:fill-neutral-100" />
        <ViewportPortal>
          {allNodes.map((node) => {
            // Groups and comment nodes don't get floating headers
            if (node.type === "group" as any || node.type === "comment") return null;

            const defaultWidth = defaultNodeDimensions[node.type as NodeType]?.width ?? 250;
            const headerWidth = node.measured?.width || (node.style?.width as number) || defaultWidth;

            return (
              <FloatingNodeHeader
                key={`header-${node.id}`}
                id={node.id}
                type={node.type as NodeType}
                isInLockedGroup={!!(node.data as any)?.isInLockedGroup}
                isExecuting={!!(node.data as any)?.isExecuting}
                position={node.position}
                width={headerWidth}
                selected={!!node.selected}
                title={getNodeTitle(node)}
                customTitle={node.data?.customTitle}
                provider={(node.data as any)?.selectedModel?.provider}
                onCustomTitleChange={handleCustomTitleChange}
                onExpandNode={handleExpandNode}
              />
            );
          })}
        </ViewportPortal>
      </ReactFlow>

      <RunActionBar />

      {/* Flowy chat composer — portaled from FlowyAgentPanel; always visible at bottom center */}
      <div
        ref={setFlowyComposerMountEl}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[45] flex justify-center px-4 pb-3 pt-8"
        role="presentation"
      />

      {/* Inward edge glow while Flowy reads/sends canvas state to the agent */}
      <div
        className={`pointer-events-none absolute inset-0 z-[25] transition-opacity duration-500 ease-out ${
          isFlowyCanvasReading ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      >
        <div className="flowy-canvas-reading-overlay-inner absolute inset-0" />
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <CanvasContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Connection drop menu */}
      {connectionDrop && connectionDrop.handleType && (
        <ConnectionDropMenu
          position={connectionDrop.position}
          handleType={connectionDrop.handleType}
          connectionType={connectionDrop.connectionType}
          onSelect={handleMenuSelect}
          onClose={handleCloseDropMenu}
        />
      )}

      {/* Multi-select toolbar */}
      <MultiSelectToolbar />

      {/* Edge toolbar */}
      <EdgeToolbar />

      {/* Flowy open button */}
      {!isChatOpen && (
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          title="Flowy agent"
          aria-label="Open Flowy agent"
          className="fixed top-4 right-5 z-[60] inline-flex items-center justify-center h-11 w-11 rounded-full backdrop-blur-[16px] bg-background-transparent-black-default border border-neutral-700 hover:bg-neutral-800 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-100"
          >
            <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z" />
            <path d="M20 14l.9 3.1L24 18l-3.1.9L20 22l-.9-3.1L16 18l3.1-.9L20 14z" />
          </svg>
        </button>
      )}

      {/* Flowy agent panel */}
      <FlowyAgentPanel
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onApplyEdits={handleApplyEdits}
        onRunNodeIds={handleFlowyRunNodeIds}
        onStopWorkflow={stopWorkflow}
        workflowState={chatWorkflowState}
        selectedNodeIds={selectedNodeIds}
        onCanvasReadingChange={setIsFlowyCanvasReading}
        composerMountEl={flowyComposerMountEl}
      />

      {/* Control panel - renders on right side when a configurable node is selected */}
      <ControlPanel />

      {/* Expansion modals - rendered via portal when expand button is clicked */}
      {expandingNode && expandingNode.type === 'prompt' && (() => {
        const node = getNodeById(expandingNode.id);
        if (!node) return null;
        return createPortal(
          <PromptEditorModal
            isOpen={true}
            initialPrompt={(node.data as any)?.prompt || ''}
            onSubmit={(prompt) => {
              updateNodeData(expandingNode.id, { prompt });
              setExpandingNode(null);
            }}
            onClose={() => setExpandingNode(null)}
          />,
          document.body
        );
      })()}

      {/* AnnotationModal is globally managed by annotationStore */}
      <AnnotationModal />
    </div>
  );
}
