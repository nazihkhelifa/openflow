/**
 * Connected Inputs & Validation
 *
 * Pure functions extracted from workflowStore for getting connected inputs
 * and validating workflow structure. These can be tested without the store.
 */

import {
  WorkflowNode,
  WorkflowEdge,
  ImageInputNodeData,
  AudioInputNodeData,
  AnnotationNodeData,
  NanoBananaNodeData,
  GenerateVideoNodeData,
  Generate3DNodeData,
  GenerateAudioNodeData,
  EaseCurveNodeData,
  VideoFrameGrabNodeData,
  PromptNodeData,
  GLBViewerNodeData,
  SwitchNodeData,
  ConditionalSwitchNodeData,
  MatchMode,
} from "@/types";

/**
 * Return type for getConnectedInputs
 */
export interface ConnectedInputs {
  images: string[];
  videos: string[];
  audio: string[];
  model3d: string | null;
  text: string | null;
  dynamicInputs: Record<string, string | string[]>;
  easeCurve: { bezierHandles: [number, number, number, number]; easingPreset: string | null } | null;
}

/**
 * Helper to determine if a handle ID is an image type
 */
function isImageHandle(handleId: string | null | undefined): boolean {
  if (!handleId) return false;
  return handleId === "image" || handleId.startsWith("image-") || handleId.includes("frame");
}

/**
 * Helper to determine if a handle ID is a text type
 */
function isTextHandle(handleId: string | null | undefined): boolean {
  if (!handleId) return false;
  return handleId === "text" || handleId.startsWith("text-") || handleId.includes("prompt");
}

/**
 * Extract output data and type from a source node
 */
function getSourceOutput(
  sourceNode: WorkflowNode,
  sourceHandle: string | null | undefined,
  edgeData?: Record<string, unknown>
): { type: "image" | "text" | "video" | "audio" | "3d"; value: string | null } {
  if (sourceNode.type === "imageInput") {
    return { type: "image", value: (sourceNode.data as ImageInputNodeData).image };
  } else if (sourceNode.type === "mediaInput") {
    const d = sourceNode.data as { mode?: string; image?: string | null; capturedImage?: string | null; audioFile?: string | null; videoFile?: string | null };
    if (d.mode === "audio") return { type: "audio", value: d.audioFile ?? null };
    if (d.mode === "video") return { type: "video", value: d.videoFile ?? null };
    if (d.mode === "3d") return { type: "image", value: d.capturedImage ?? null };
    return { type: "image", value: d.image ?? null };
  } else if (sourceNode.type === "audioInput") {
    return { type: "audio", value: (sourceNode.data as AudioInputNodeData).audioFile };
  } else if (sourceNode.type === "annotation") {
    return { type: "image", value: (sourceNode.data as AnnotationNodeData).outputImage };
  } else if (sourceNode.type === "generateImage" || (sourceNode as { type: string }).type === "nanoBanana") {
    const nbData = sourceNode.data as NanoBananaNodeData;
    return { type: "image", value: nbData.outputImage };
  } else if (sourceNode.type === "generate3d") {
    const g3dData = sourceNode.data as Generate3DNodeData;
    if (sourceHandle === "image") {
      return { type: "image", value: g3dData.capturedImage ?? null };
    }
    return { type: "3d", value: g3dData.output3dUrl };
  } else if (sourceNode.type === "generateVideo") {
    return { type: "video", value: (sourceNode.data as GenerateVideoNodeData).outputVideo };
  } else if (sourceNode.type === "generateAudio") {
    return { type: "audio", value: (sourceNode.data as GenerateAudioNodeData).outputAudio };
  } else if (sourceNode.type === "easeCurve") {
    return { type: "video", value: (sourceNode.data as EaseCurveNodeData).outputVideo };
  } else if (sourceNode.type === "prompt") {
    const d = sourceNode.data as PromptNodeData;
    return { type: "text", value: d.outputText ?? null };
  } else if (sourceNode.type === "videoFrameGrab") {
    return { type: "image", value: (sourceNode.data as VideoFrameGrabNodeData).outputImage };
  } else if (sourceNode.type === "glbViewer") {
    return { type: "image", value: (sourceNode.data as GLBViewerNodeData).capturedImage };
  }
  return { type: "image", value: null };
}

/**
 * Get all connected inputs for a node.
 * Pure function version of workflowStore.getConnectedInputs.
 */
export function getConnectedInputsPure(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  visited?: Set<string>,
  dimmedNodeIds?: Set<string>
): ConnectedInputs {
  const _visited = visited || new Set<string>();
  if (_visited.has(nodeId)) return { images: [], videos: [], audio: [], model3d: null, text: null, dynamicInputs: {}, easeCurve: null };
  _visited.add(nodeId);
  const images: string[] = [];
  const videos: string[] = [];
  const audio: string[] = [];
  let model3d: string | null = null;
  let text: string | null = null;
  const dynamicInputs: Record<string, string | string[]> = {};
  let easeCurve: ConnectedInputs["easeCurve"] = null;

  // Get the target node to check for inputSchema
  const targetNode = nodes.find((n) => n.id === nodeId);
  const inputSchema = (targetNode?.data as { inputSchema?: Array<{ name: string; type: string }> })?.inputSchema;

  // Build mapping from normalized handle IDs to schema names if schema exists
  const handleToSchemaName: Record<string, string> = {};
  if (inputSchema && inputSchema.length > 0) {
    const imageInputs = inputSchema.filter(i => i.type === "image");
    const textInputs = inputSchema.filter(i => i.type === "text");

    imageInputs.forEach((input, index) => {
      handleToSchemaName[`image-${index}`] = input.name;
      if (index === 0) {
        handleToSchemaName["image"] = input.name;
      }
    });

    textInputs.forEach((input, index) => {
      handleToSchemaName[`text-${index}`] = input.name;
      if (index === 0) {
        handleToSchemaName["text"] = input.name;
      }
    });
  }

  edges
    .filter((edge) => edge.target === nodeId)
    .forEach((edge) => {
      // Skip paused edges — data does not flow through paused edges (e.g. prompt won't override textarea)
      if ((edge.data as Record<string, unknown> | undefined)?.hasPause) return;

      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) return;

      // Skip dimmed source nodes — their data should not flow downstream
      if (dimmedNodeIds && dimmedNodeIds.has(sourceNode.id)) return;

      // Router passthrough — traverse upstream to find actual data source
      if (sourceNode.type === "router") {
        const routerInputs = getConnectedInputsPure(sourceNode.id, nodes, edges, _visited, dimmedNodeIds);
        // Determine which type this edge carries based on the source handle
        const edgeType = edge.sourceHandle; // Will be "image", "text", "video", "audio", "3d", or "easeCurve"

        if (edgeType === "image" || (!edgeType && isImageHandle(edge.sourceHandle))) {
          images.push(...routerInputs.images);
        } else if (edgeType === "text" || (!edgeType && isTextHandle(edge.sourceHandle))) {
          if (routerInputs.text) text = routerInputs.text;
        } else if (edgeType === "video") {
          videos.push(...routerInputs.videos);
        } else if (edgeType === "audio") {
          audio.push(...routerInputs.audio);
        } else if (edgeType === "3d") {
          if (routerInputs.model3d) model3d = routerInputs.model3d;
        } else if (edgeType === "easeCurve") {
          // EaseCurve passthrough
          if (routerInputs.easeCurve) easeCurve = routerInputs.easeCurve;
        }
        return; // Skip normal getSourceOutput processing for this edge
      }

      // Switch passthrough — traverse upstream if output is enabled
      if (sourceNode.type === "switch") {
        const switchData = sourceNode.data as SwitchNodeData;
        const switchId = edge.sourceHandle; // Handle ID matches switch entry id
        const switchEntry = switchData.switches?.find(s => s.id === switchId);

        // Skip disabled outputs — data does not flow through disabled switches
        if (!switchEntry || !switchEntry.enabled) {
          return; // Block this path
        }

        // Enabled switch: recursively get upstream data (same pattern as router)
        const switchInputs = getConnectedInputsPure(sourceNode.id, nodes, edges, _visited, dimmedNodeIds);
        const edgeType = switchData.inputType;

        if (edgeType === "image") {
          images.push(...switchInputs.images);
        } else if (edgeType === "text") {
          if (switchInputs.text) text = switchInputs.text;
        } else if (edgeType === "video") {
          videos.push(...switchInputs.videos);
        } else if (edgeType === "audio") {
          audio.push(...switchInputs.audio);
        } else if (edgeType === "3d") {
          if (switchInputs.model3d) model3d = switchInputs.model3d;
        } else if (edgeType === "easeCurve") {
          if (switchInputs.easeCurve) easeCurve = switchInputs.easeCurve;
        }
        return; // Skip normal getSourceOutput processing
      }

      // Conditional Switch passthrough — traverse upstream if output is active (matched or default)
      if (sourceNode.type === "conditionalSwitch") {
        const condData = sourceNode.data as ConditionalSwitchNodeData;

        // When evaluation is paused, all outputs are active (gate is open)
        if (!condData.evaluationPaused) {
          const sourceHandle = edge.sourceHandle;

          // Find matching rule or check if default
          const rule = condData.rules.find(r => r.id === sourceHandle);
          const isDefaultHandle = sourceHandle === "default";

          // Determine if this output is active
          let isActive = false;
          if (rule) {
            isActive = rule.isMatched;
          } else if (isDefaultHandle) {
            // Default is active when NO rules match
            isActive = !condData.rules.some(r => r.isMatched);
          }

          // Block non-active outputs (data does not flow through non-matching rules)
          if (!isActive) return;
        }

        // Active output (or paused): ConditionalSwitch is a gate — trigger downstream but don't pass data through
        return;
      }

      const handleId = edge.targetHandle;
      const { type, value } = getSourceOutput(
        sourceNode,
        edge.sourceHandle,
        (edge.data as Record<string, unknown> | undefined)
      );

      if (!value) return;

      // Map normalized handle ID to schema name for dynamicInputs
      if (handleId && handleToSchemaName[handleId]) {
        const schemaName = handleToSchemaName[handleId];
        const existing = dynamicInputs[schemaName];
        if (existing !== undefined) {
          dynamicInputs[schemaName] = Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
        } else {
          dynamicInputs[schemaName] = value;
        }
      }

      // Route to typed arrays based on source output type
      if (type === "3d") {
        model3d = value;
      } else if (type === "video") {
        videos.push(value);
      } else if (type === "audio") {
        audio.push(value);
      } else if (type === "text" || isTextHandle(handleId)) {
        // Defensive: ensure text values are always strings
        // (Guards against corrupted node data during parallel execution)
        text = typeof value === 'string' ? value : String(value);
      } else if (isImageHandle(handleId)) {
        images.push(value);
      }
    });

  // Extract easeCurve data from parent EaseCurve node (if not already set by router passthrough)
  if (!easeCurve) {
    const easeCurveEdge = edges.find(
      (e) =>
        e.target === nodeId &&
        e.targetHandle === "easeCurve" &&
        !(e.data as Record<string, unknown> | undefined)?.hasPause
    );
    if (easeCurveEdge) {
      const sourceNode = nodes.find((n) => n.id === easeCurveEdge.source);
      if (sourceNode?.type === "easeCurve") {
        const sourceData = sourceNode.data as EaseCurveNodeData;
        easeCurve = {
          bezierHandles: sourceData.bezierHandles,
          easingPreset: sourceData.easingPreset,
        };
      }
    }
  }

  return { images, videos, audio, model3d, text, dynamicInputs, easeCurve };
}

/**
 * Validate workflow structure.
 * Pure function version of workflowStore.validateWorkflow.
 */
export function validateWorkflowPure(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (nodes.length === 0) {
    errors.push("Workflow is empty");
    return { valid: false, errors };
  }

  // Check each Generate Image node has required inputs (text required, image optional)
  nodes
    .filter((n) => n.type === "generateImage" || (n as { type: string }).type === "nanoBanana")
    .forEach((node) => {
      const textConnected = edges.some(
        (e) => e.target === node.id &&
               (e.targetHandle === "text" || e.targetHandle?.startsWith("text-"))
      );
      if (!textConnected) {
        errors.push(`Generate node "${node.id}" missing text input`);
      }
    });

  // Check generateVideo nodes have required text input
  nodes
    .filter((n) => n.type === "generateVideo")
    .forEach((node) => {
      const textConnected = edges.some(
        (e) => e.target === node.id &&
               (e.targetHandle === "text" || e.targetHandle?.startsWith("text-"))
      );
      if (!textConnected) {
        errors.push(`Video node "${node.id}" missing text input`);
      }
    });

  // Check annotation nodes have image input (either connected or manually loaded)
  nodes
    .filter((n) => n.type === "annotation")
    .forEach((node) => {
      const imageConnected = edges.some((e) => e.target === node.id);
      const hasManualImage = (node.data as AnnotationNodeData).sourceImage !== null;
      if (!imageConnected && !hasManualImage) {
        errors.push(`Layer Editor node "${node.id}" missing image input`);
      }
    });

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a runnable node has all required inputs connected (via edges) or satisfied by stored data.
 * Used to enable/disable the Run button.
 */
export function hasRequiredInputsConnected(
  node: { id: string; type: string; data?: Record<string, unknown> },
  edges: Array<{ target: string; targetHandle?: string | null; data?: { hasPause?: boolean } }>
): boolean {
  const nodeId = node.id;
  const nodeType = node.type;
  const incomingEdges = edges.filter((e) => e.target === nodeId);

  const hasTextEdge = incomingEdges.some(
    (e) =>
      (e.targetHandle === "text" || e.targetHandle?.startsWith("text-")) &&
      !e.data?.hasPause
  );
  const hasImageEdge = incomingEdges.some(
    (e) =>
      (e.targetHandle === "image" || e.targetHandle?.startsWith("image-")) &&
      !e.data?.hasPause
  );

  switch (nodeType) {
    case "generateImage":
    case "nanoBanana": {
      const hasInlinePrompt = !!(
        node.data?.inputPrompt &&
        String(node.data.inputPrompt).trim().length > 0
      );
      return hasTextEdge || hasInlinePrompt;
    }
    case "generateVideo": {
      const hasInlinePrompt = !!(
        node.data?.inputPrompt &&
        String(node.data.inputPrompt).trim().length > 0
      );
      return hasTextEdge || hasImageEdge || hasInlinePrompt;
    }
    case "generate3d":
      return hasTextEdge || hasImageEdge;
    case "generateAudio":
      return hasTextEdge;
    case "prompt": {
      const hasInlinePrompt = !!(
        node.data?.prompt &&
        String(node.data.prompt).trim().length > 0
      );
      return hasTextEdge || hasInlinePrompt;
    }
    default:
      return true;
  }
}
