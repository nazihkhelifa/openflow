"use client";

/**
 * Matches the v0 / SpotlightCanvas pattern: screen-space grid + RAF loop, canvas z-index 1,
 * React Flow transparent at z-index 2. Grid does not pan with the viewport (same as the example).
 */

import { useEffect, useRef } from "react";

const GAP = 20;
const DOT_SIZE = 1.5;
/** Wider + smoother falloff than a hard circle */
const SPOTLIGHT_RADIUS = 190;
/** Idle grid */
const BASE_OPACITY = 0.012;
/** Brightest dots (cursor center) — cap at 5% */
const MAX_OPACITY = 0.05;

function smooth01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function SpotlightDots({ mousePosition }: { mousePosition: { x: number; y: number } }) {
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

      for (let x = 0; x < canvas.width; x += GAP) {
        for (let y = 0; y < canvas.height; y += GAP) {
          const dx = x - mousePosition.x;
          const dy = y - mousePosition.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          let opacity = BASE_OPACITY;

          if (distance < SPOTLIGHT_RADIUS) {
            const linear = 1 - distance / SPOTLIGHT_RADIUS;
            const intensity = smooth01(smooth01(linear));
            opacity = BASE_OPACITY + intensity * (MAX_OPACITY - BASE_OPACITY);
          }

          ctx.beginPath();
          ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current !== undefined) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mousePosition]);

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
}: {
  mousePosition: { x: number; y: number };
}) {
  return <SpotlightDots mousePosition={mousePosition} />;
}
