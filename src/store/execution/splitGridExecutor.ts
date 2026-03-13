/**
 * SplitGrid Executor
 *
 * Unified executor for splitGrid nodes.
 * Splits an input image into grid cells and populates child imageInput nodes.
 */

import type { SplitGridNodeData } from "@/types";
import type { NodeExecutionContext } from "./types";

export async function executeSplitGrid(ctx: NodeExecutionContext): Promise<void> {
  const { node, getConnectedInputs, updateNodeData } = ctx;

  const { images } = getConnectedInputs(node.id);
  const sourceImage = images[0] || null;

  if (!sourceImage) {
    updateNodeData(node.id, {
      status: "error",
      error: "No input image connected",
    });
    throw new Error("No input image connected");
  }

  const nodeData = node.data as SplitGridNodeData;

  if (!nodeData.isConfigured) {
    updateNodeData(node.id, {
      status: "error",
      error: "Node not configured - open settings first",
    });
    throw new Error("Node not configured - open settings first");
  }

  updateNodeData(node.id, {
    sourceImage,
    status: "loading",
    error: null,
  });

  try {
    const { splitWithDimensions } = await import("@/utils/gridSplitter");
    const { images: splitImages } = await splitWithDimensions(
      sourceImage,
      nodeData.gridRows,
      nodeData.gridCols
    );

    // Populate child imageInput nodes with split images
    for (let index = 0; index < nodeData.childNodeIds.length; index++) {
      const childSet = nodeData.childNodeIds[index];
      if (splitImages[index]) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            updateNodeData(childSet.imageInput, {
              image: splitImages[index],
              imageRef: undefined,
              filename: `split-${Math.floor(index / nodeData.gridCols) + 1}-${(index % nodeData.gridCols) + 1}.png`,
              dimensions: { width: img.width, height: img.height },
            });
            resolve();
          };
          img.onerror = () => {
            console.warn(`[splitGrid] Failed to load split image ${index} for node ${childSet.imageInput}`);
            updateNodeData(childSet.imageInput, {
              image: null,
              filename: null,
              dimensions: { width: 0, height: 0 },
            });
            resolve();
          };
          img.src = splitImages[index];
        });
      }
    }

    updateNodeData(node.id, { status: "complete", error: null });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      updateNodeData(node.id, { status: "idle", error: null });
      throw error;
    }
    updateNodeData(node.id, {
      status: "error",
      error: error instanceof Error ? error.message : "Failed to split image",
    });
    throw error instanceof Error ? error : new Error("Failed to split image");
  }
}
