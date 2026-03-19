/**
 * Central node dispatcher.
 *
 * Maps a node's type to the correct executor function, eliminating the
 * duplicated switch/if-else chains that previously existed in
 * executeWorkflow, regenerateNode, and executeSelectedNodes.
 */

import type { NodeExecutionContext } from "./types";
import {
  executeAnnotation,
  executePrompt,
  executeImageCompare,
  executeGlbViewer,
} from "./simpleNodeExecutors";
import { executeNanoBanana } from "./nanoBananaExecutor";
import { executeGenerateVideo } from "./generateVideoExecutor";
import { executeGenerate3D } from "./generate3dExecutor";
import { executeEaseCurve, executeVideoFrameGrab } from "./videoProcessingExecutors";
import { executeGenerateAudio } from "./generateAudioExecutor";

export interface ExecuteNodeOptions {
  /** When true, executors that support it will fall back to stored inputs. */
  useStoredFallback?: boolean;
}

/**
 * Execute a single node by dispatching to the appropriate executor.
 *
 * Data-source node types (`imageInput`, `audioInput`) are no-ops.
 */
export async function executeNode(
  ctx: NodeExecutionContext,
  options?: ExecuteNodeOptions,
): Promise<void> {
  const regenOpts = options?.useStoredFallback ? { useStoredFallback: true } : undefined;

  switch (ctx.node.type) {
    case "imageInput":
      // Data source node — no execution needed
      break;
    case "audioInput": {
      // If audio is connected from upstream, use it (connection wins over upload)
      const audioInputs = ctx.getConnectedInputs(ctx.node.id);
      if (audioInputs.audio.length > 0 && audioInputs.audio[0]) {
        ctx.updateNodeData(ctx.node.id, { audioFile: audioInputs.audio[0] });
      }
      break;
    }
    case "annotation":
      await executeAnnotation(ctx);
      break;
    case "prompt":
      await executePrompt(ctx);
      break;
    case "generateImage":
      await executeNanoBanana(ctx, regenOpts);
      break;
    case "generateVideo":
      await executeGenerateVideo(ctx, regenOpts);
      break;
    case "generate3d":
      await executeGenerate3D(ctx, regenOpts);
      break;
    case "imageCompare":
      await executeImageCompare(ctx);
      break;
    case "easeCurve":
      await executeEaseCurve(ctx);
      break;
    case "glbViewer":
      await executeGlbViewer(ctx);
      break;
    case "generateAudio":
      await executeGenerateAudio(ctx, regenOpts);
      break;
    case "videoFrameGrab":
      await executeVideoFrameGrab(ctx);
      break;
  }
}
