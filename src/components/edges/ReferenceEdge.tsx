"use client";

import { useMemo, type CSSProperties } from "react";
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";

const REFERENCE_EDGE_STROKE = "#a1a1aa";

function sanitizeEdgeStyleForStroke(style: CSSProperties | undefined): CSSProperties {
  if (!style || typeof style !== "object") return {};
  const {
    strokeOpacity: _so,
    opacity: _op,
    ...rest
  } = style as CSSProperties & { strokeOpacity?: unknown; opacity?: unknown };
  return rest;
}

export function ReferenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  source,
  target,
}: EdgeProps) {
  // Calculate the path - always use curved for reference edges for softer look
  const [edgePath] = useMemo(() => {
    return getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.25,
    });
  }, [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]);

  const strokeStyle = useMemo(() => {
    const base = sanitizeEdgeStyleForStroke(style);
    return {
      ...base,
      stroke: REFERENCE_EDGE_STROKE,
      strokeWidth: 2,
      strokeDasharray: "6 4",
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
      strokeOpacity: 1,
      opacity: 1,
    };
  }, [style]);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={strokeStyle}
      />

      {/* Invisible wider path for easier selection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={10}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
    </>
  );
}
