"use client";

import { useState, useCallback, useMemo, type CSSProperties } from "react";
import {
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import { useWorkflowStore } from "@/store/workflowStore";
import { NanoBananaNodeData, WorkflowEdgeData } from "@/types";

interface EdgeData extends WorkflowEdgeData {
  offsetX?: number;
  offsetY?: number;
}

// Colors for different connection types
const EDGE_COLORS: Record<string, string> = {
  image: "#10b981",
  prompt: "#2563eb", // Blue for prompt connections
  /** Fallback when handle ids are missing after load — must contrast with dark canvas */
  default: "#94a3b8",
  pause: "#ea580c", // Orange for paused edges
  reference: "#52525b", // Gray for reference connections
  video: "#a855f7", // Purple for video connections
  audio: "#f97316", // Orange for audio connections
  text: "#2563eb", // Blue for text connections
  "3d": "#06b6d4", // Cyan for 3D connections
  easeCurve: "#f59e0b", // Amber for ease curve connections
  /** Router / switch single input */
  "generic-input": "#64748b",
};

/** Resolve stroke color from handle ids (persisted edges may omit one side; schema uses image-0, text-1, etc.). */
function resolveEdgeColorFromHandles(
  sourceHandleId: string | null | undefined,
  targetHandleId: string | null | undefined,
  hasPause: boolean
): string {
  if (hasPause) return EDGE_COLORS.pause;
  const candidates = [sourceHandleId, targetHandleId].filter(
    (x): x is string => typeof x === "string" && x.length > 0
  );
  for (const raw of candidates) {
    const stripped = raw.replace(/-\d+$/, "");
    if (stripped && EDGE_COLORS[stripped]) return EDGE_COLORS[stripped];
    const head = raw.split("-")[0];
    if (head && EDGE_COLORS[head]) return EDGE_COLORS[head];
    // e.g. image frame handles (image-frame-0)
    if (raw.includes("frame") && !raw.toLowerCase().includes("timeframe")) {
      return EDGE_COLORS.image;
    }
  }
  return EDGE_COLORS.default;
}

/** When handles are missing from persisted edges, infer stroke from the source node type. */
function inferEdgeColorFromSourceNodeType(
  nodeType: string | undefined | null
): string | null {
  switch (nodeType) {
    case "prompt":
      return EDGE_COLORS.text;
    case "mediaInput":
    case "annotation":
    case "generateImage":
    case "cameraAngleControl":
    case "glbViewer":
    case "imageCompare":
      return EDGE_COLORS.image;
    case "generateVideo":
      return EDGE_COLORS.video;
    case "generateAudio":
      return EDGE_COLORS.audio;
    case "generate3d":
      return EDGE_COLORS["3d"];
    case "easeCurve":
      return EDGE_COLORS.easeCurve;
    default:
      return null;
  }
}

/** Persisted React Flow edges sometimes carry strokeOpacity/opacity that hide the line after reload. */
function sanitizeEdgeStyleForStroke(style: CSSProperties | undefined): CSSProperties {
  if (!style || typeof style !== "object") return {};
  const {
    strokeOpacity: _so,
    opacity: _op,
    ...rest
  } = style as CSSProperties & { strokeOpacity?: unknown; opacity?: unknown };
  return rest;
}

export function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
  sourceHandleId,
  targetHandleId,
  source,
  target,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const edgeStyle = useWorkflowStore((state) => state.edgeStyle);
  const [isDragging, setIsDragging] = useState(false);

  const edgeData = data as EdgeData | undefined;
  const offsetX = edgeData?.offsetX ?? 0;
  const offsetY = edgeData?.offsetY ?? 0;
  const hasPause = edgeData?.hasPause ?? false;

  // Narrow selector: only re-renders when target loading status changes
  const isTargetLoading = useWorkflowStore((state) => {
    const targetNode = state.nodes.find((n) => n.id === target);
    if (targetNode?.type !== "generateImage") return false;
    return (targetNode.data as NanoBananaNodeData).status === "loading";
  });

  const sourceNodeType = useWorkflowStore((state) =>
    state.nodes.find((n) => n.id === source)?.type
  );

  const edgeColor = useMemo(() => {
    const fromHandles = resolveEdgeColorFromHandles(
      sourceHandleId,
      targetHandleId,
      hasPause
    );
    if (fromHandles !== EDGE_COLORS.default) return fromHandles;
    const inferred = inferEdgeColorFromSourceNodeType(sourceNodeType);
    return inferred ?? fromHandles;
  }, [hasPause, sourceHandleId, targetHandleId, sourceNodeType]);

  const visibleStrokeStyle = useMemo(() => {
    const base = sanitizeEdgeStyleForStroke(style);
    return {
      ...base,
      stroke: edgeColor,
      strokeWidth: selected ? 4 : 3,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeOpacity: 1,
      opacity: 1,
    };
  }, [style, edgeColor, selected]);

  // Calculate the path based on edge style
  const [edgePath, labelX, labelY] = useMemo(() => {
    if (edgeStyle === "curved") {
      return getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.25,
      });
    } else {
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 8,
        offset: offsetX,
      });
    }
  }, [edgeStyle, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offsetX]);

  // Calculate handle positions on the path segments (only for angular mode)
  const handlePositions = useMemo(() => {
    if (edgeStyle === "curved") return [];

    const handles: { x: number; y: number; direction: "horizontal" | "vertical" }[] = [];

    // Defensive: ReactFlow sometimes provides transient NaN coordinates during edge/node edits.
    // Never render SVG attributes with NaN (React will warn).
    const sx = Number(sourceX);
    const sy = Number(sourceY);
    const tx = Number(targetX);
    const ty = Number(targetY);
    if (![sx, sy, tx, ty].every(Number.isFinite)) return [];

    const midX = (sx + tx) / 2 + offsetX;
    const midY = (sy + ty) / 2 + offsetY;

    // Middle segment handle
    if (Math.abs(targetX - sourceX) > 50) {
      handles.push({
        x: midX,
        y: midY,
        direction: "horizontal",
      });
    }

    return handles;
  }, [edgeStyle, sourceX, sourceY, targetX, targetY, offsetX, offsetY]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, direction: "horizontal" | "vertical") => {
      e.stopPropagation();
      e.preventDefault();
      setIsDragging(true);

      const startX = e.clientX;
      const startY = e.clientY;
      const startOffsetX = offsetX;
      const startOffsetY = offsetY;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        setEdges((edges) =>
          edges.map((edge) => {
            if (edge.id === id) {
              return {
                ...edge,
                data: {
                  ...edge.data,
                  offsetX: direction === "horizontal" ? startOffsetX + deltaX : startOffsetX,
                  offsetY: direction === "vertical" ? startOffsetY + deltaY : startOffsetY,
                },
              };
            }
            return edge;
          })
        );
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [id, offsetX, offsetY, setEdges]
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={visibleStrokeStyle}
      />

      {/* Animated pulse overlay when target is loading */}
      {isTargetLoading && (
        <>
          {/* Outer glow — replaces blur(6px) filter for better perf on Windows */}
          <path
            d={edgePath}
            fill="none"
            stroke={edgeColor}
            strokeWidth={20}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.06}
          />
          {/* Inner glow */}
          <path
            d={edgePath}
            fill="none"
            stroke={edgeColor}
            strokeWidth={12}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.12}
          />
          {/* Animated flowing pulse using stroke-dasharray */}
          <path
            d={edgePath}
            fill="none"
            stroke={edgeColor}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="20 30"
            style={{
              animation: "flowPulse 1s linear infinite",
            }}
          />
        </>
      )}

      {/* Invisible wider path for easier selection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={15}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />

      {/* Pause indicator near target connection point */}
      {hasPause && (
        <g transform={`translate(${targetX - 24}, ${targetY})`}>
          {/* Background circle */}
          <circle
            r={10}
            fill="#27272a"
            stroke={edgeColor}
            strokeWidth={2}
          />
          {/* Pause bars */}
          <rect x={-4} y={-5} width={2.5} height={10} fill={edgeColor} rx={1} />
          <rect x={1.5} y={-5} width={2.5} height={10} fill={edgeColor} rx={1} />
        </g>
      )}

      {/* Draggable handles on segments */}
      {(selected || isDragging) &&
        handlePositions.map((handle, index) => (
          <g key={index}>
            <circle
              cx={Number.isFinite(handle.x) ? handle.x : 0}
              cy={Number.isFinite(handle.y) ? handle.y : 0}
              r={6}
              fill="white"
              stroke="#3b82f6"
              strokeWidth={2}
              style={{
                cursor: handle.direction === "horizontal" ? "ew-resize" : "ns-resize",
              }}
              onMouseDown={(e) => handleMouseDown(e, handle.direction)}
            />
          </g>
        ))}
    </>
  );
}
