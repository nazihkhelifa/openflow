"use client";

/**
 * Matches the v0 / SpotlightCanvas pattern: screen-space grid + RAF loop, canvas z-index 1,
 * React Flow transparent at z-index 2. Grid does not pan with the viewport (same as the example).
 */

import { useEffect, useRef } from "react";

const GAP = 20;
const DOT_SIZE = 1.5;

/** User cursor — white spotlight */
const USER_GRID_BASE = 0.012;
const USER_SPOTLIGHT_RADIUS = 190;
const USER_SPOTLIGHT_MAX = 0.05;

/** Agent (Flowy reading) — purple spotlight; separate radius / falloff / peak */
const AGENT_SPOTLIGHT_RADIUS = 95;
const AGENT_SPOTLIGHT_MAX = 0.4;
const AGENT_PURPLE_RGB = "200, 150, 255" as const;

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function SpotlightDots({
  mousePosition,
  agentSpotlightActive,
  agentSpotlightPosition,
}: {
  mousePosition: { x: number; y: number };
  agentSpotlightActive: boolean;
  /** Container-local coords (same as mousePosition); from Flowy assist pointer while planning */
  agentSpotlightPosition: { x: number; y: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      for (let x = 0; x < canvas.width; x += GAP) {
        for (let y = 0; y < canvas.height; y += GAP) {
          const dx = x - mousePosition.x;
          const dy = y - mousePosition.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          let opacity = USER_GRID_BASE;

          if (distance < USER_SPOTLIGHT_RADIUS) {
            const linear = 1 - distance / USER_SPOTLIGHT_RADIUS;
            const intensity = smooth01(smooth01(linear));
            opacity = USER_GRID_BASE + intensity * (USER_SPOTLIGHT_MAX - USER_GRID_BASE);
          }

          ctx.beginPath();
          ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.fill();
        }
      }

      if (agentSpotlightActive) {
        const pad = AGENT_SPOTLIGHT_RADIUS;
        let ax = agentSpotlightPosition?.x ?? canvas.width * 0.5;
        let ay = agentSpotlightPosition?.y ?? canvas.height * 0.5;
        if (canvas.width > 0 && canvas.height > 0) {
          ax = Math.min(canvas.width - pad, Math.max(pad, ax));
          ay = Math.min(canvas.height - pad, Math.max(pad, ay));
        }
        ctx.globalCompositeOperation = "lighter";
        for (let x = 0; x < canvas.width; x += GAP) {
          for (let y = 0; y < canvas.height; y += GAP) {
            const d = Math.hypot(x - ax, y - ay);
            if (d >= AGENT_SPOTLIGHT_RADIUS) continue;
            const linear = 1 - d / AGENT_SPOTLIGHT_RADIUS;
            const intensity = smooth01(linear);
            const a = intensity * AGENT_SPOTLIGHT_MAX;
            if (a < 0.0005) continue;
            ctx.beginPath();
            ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${AGENT_PURPLE_RGB}, ${a})`;
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current !== undefined) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mousePosition, agentSpotlightActive, agentSpotlightPosition]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="openflow-cursor-glow-layer"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ zIndex: 1 }}
      aria-hidden
    />
  );
}

export function CursorGlowDotBackground({
  mousePosition,
  agentSpotlightActive = false,
  agentSpotlightPosition = null,
}: {
  mousePosition: { x: number; y: number };
  /** True while Flowy sends canvas context — purple spotlight follows assist pointer */
  agentSpotlightActive?: boolean;
  agentSpotlightPosition?: { x: number; y: number } | null;
}) {
  return (
    <SpotlightDots
      mousePosition={mousePosition}
      agentSpotlightActive={agentSpotlightActive}
      agentSpotlightPosition={agentSpotlightPosition}
    />
  );
}
