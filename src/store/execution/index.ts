/**
 * Node Executor Registry
 *
 * Maps node types to their executor functions.
 * Used by executeWorkflow and regenerateNode to eliminate
 * duplicated switch/if-else chains.
 */

export type { NodeExecutionContext, NodeExecutor } from "./types";

export {
  executeAnnotation,
  executePrompt,
  executeImageCompare,
  executeGlbViewer,
  executeRouter,
  executeSwitch,
  executeConditionalSwitch,
} from "./simpleNodeExecutors";

export { executeNanoBanana } from "./nanoBananaExecutor";
export type { NanoBananaOptions } from "./nanoBananaExecutor";

export { executeGenerateVideo } from "./generateVideoExecutor";
export type { GenerateVideoOptions } from "./generateVideoExecutor";

export { executeGenerate3D } from "./generate3dExecutor";
export type { Generate3DOptions } from "./generate3dExecutor";

export { executeGenerateAudio } from "./generateAudioExecutor";
export type { GenerateAudioOptions } from "./generateAudioExecutor";

export { executeEaseCurve, executeVideoFrameGrab } from "./videoProcessingExecutors";
