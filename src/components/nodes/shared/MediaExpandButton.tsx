"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMediaViewer } from "@/providers/media-viewer";
import { collectMediaItems } from "@/lib/media-collector";
import type { MediaItem } from "@/lib/media-collector";

const EXPAND_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
  </svg>
);

type MediaExpandButtonProps = {
  nodeId: string;
  /** Single media URL - uses collectMediaItems to find index */
  mediaUrl?: string | null;
  /** Multiple media URLs - builds items from these, opens at startIndex */
  mediaUrls?: string[];
  mediaType?: "image" | "video";
  startIndex?: number;
  className?: string;
  title?: string;
};

export function MediaExpandButton({
  nodeId,
  mediaUrl,
  mediaUrls,
  mediaType = "image",
  startIndex = 0,
  className = "w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all backdrop-blur-sm",
  title = "Expand",
}: MediaExpandButtonProps) {
  const { openViewer } = useMediaViewer();
  const getNodes = useReactFlow().getNodes;

  const handleExpand = useCallback(() => {
    if (mediaUrls && mediaUrls.length > 0) {
      const items: MediaItem[] = mediaUrls.map((url) => ({ url, type: mediaType, nodeId }));
      openViewer(items, Math.min(startIndex, items.length - 1));
      return;
    }
    if (!mediaUrl) return;
    const nodes = getNodes();
    const mediaItems = collectMediaItems(nodes);
    const index = mediaItems.findIndex((item) => item.url === mediaUrl && item.nodeId === nodeId);
    openViewer(mediaItems, index >= 0 ? index : 0);
  }, [nodeId, mediaUrl, mediaUrls, mediaType, startIndex, getNodes, openViewer]);

  const hasMedia = (mediaUrls && mediaUrls.length > 0) || (mediaUrl && mediaUrl.length > 0);
  if (!hasMedia) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleExpand();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={title}
      title={title}
      className={className}
    >
      {EXPAND_ICON}
    </button>
  );
}
