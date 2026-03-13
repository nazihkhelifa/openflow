"use client";

import { useMemo } from "react";
import { useWorkflowStore } from "@/store/workflowStore";
import { getConnectedInputsPure } from "@/store/utils/connectedInputs";

interface ConnectedImageThumbnailsProps {
  nodeId: string;
  className?: string;
}

export function ConnectedImageThumbnails({ nodeId, className = "" }: ConnectedImageThumbnailsProps) {
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const dimmedNodeIds = useWorkflowStore((state) => state.dimmedNodeIds);

  const connectedImages = useMemo(() => {
    const inputs = getConnectedInputsPure(nodeId, nodes, edges, undefined, dimmedNodeIds);
    return inputs.images ?? [];
  }, [nodeId, nodes, edges, dimmedNodeIds]);

  if (connectedImages.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 nodrag nopan ${className}`}>
      {connectedImages.map((url, i) => (
        <img
          key={`${url.slice(0, 50)}-${i}`}
          src={url}
          alt="Connected input"
          className="h-8 w-8 rounded-md object-cover border border-neutral-600/60 shadow-sm"
        />
      ))}
    </div>
  );
}
