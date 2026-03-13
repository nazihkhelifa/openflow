import { WorkflowNode, WorkflowNodeData } from "@/types";
import { WorkflowFile } from "@/store/workflowStore";
import crypto from "crypto";

/**
 * Fetch with timeout support using AbortController
 * @param url - The URL to fetch
 * @param options - Fetch options (RequestInit)
 * @param timeout - Timeout in milliseconds (default: 30000ms / 30 seconds)
 * @returns Promise<Response>
 * @throws Error if the request times out or fails
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Compute MD5 hash of image content for deduplication
 * Consistent with save-generation API (Phase 13 decision)
 */
function computeContentHash(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Generate a unique image ID for external storage
 */
export function generateImageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `img-${timestamp}-${random}`;
}

/**
 * Check if a string is a base64 data URL
 */
function isBase64DataUrl(str: string | null | undefined): str is string {
  return typeof str === "string" && str.startsWith("data:");
}

/**
 * Extract and save all images from a workflow, replacing base64 data with refs
 * Returns a new workflow object with image refs instead of base64 data
 */
export async function externalizeWorkflowImages(
  workflow: WorkflowFile,
  workflowPath: string
): Promise<WorkflowFile> {
  const savedImageIds = new Map<string, string>(); // base64 hash -> imageId (for deduplication)

  // Process nodes in parallel batches with controlled concurrency
  const BATCH_SIZE = 3;
  const externalizedNodes: WorkflowNode[] = new Array(workflow.nodes.length);

  for (let i = 0; i < workflow.nodes.length; i += BATCH_SIZE) {
    const batch = workflow.nodes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((node, batchIndex) =>
        externalizeNodeImages(node, workflowPath, savedImageIds)
          .then(result => ({ index: i + batchIndex, result }))
      )
    );

    for (const { index, result } of results) {
      externalizedNodes[index] = result;
    }
  }

  return {
    ...workflow,
    nodes: externalizedNodes,
  };
}

/**
 * Externalize images from a single node
 */
async function externalizeNodeImages(
  node: WorkflowNode,
  workflowPath: string,
  savedImageIds: Map<string, string>
): Promise<WorkflowNode> {
  const data = node.data as WorkflowNodeData;
  let newData: WorkflowNodeData;

  switch (node.type) {
    case "imageInput": {
      const d = data as import("@/types").ImageInputNodeData;
      // Skip if already has a valid imageRef (prevents duplicates on re-save after hydration)
      if (d.imageRef && isBase64DataUrl(d.image)) {
        newData = { ...d, image: null };
      } else if (isBase64DataUrl(d.image)) {
        const imageId = await saveImageAndGetId(d.image, workflowPath, savedImageIds, "inputs");
        newData = { ...d, image: null, imageRef: imageId };
      } else {
        newData = d;
      }
      break;
    }

    case "annotation": {
      const d = data as import("@/types").AnnotationNodeData;
      let sourceImageRef = d.sourceImageRef;
      let outputImageRef = d.outputImageRef;
      let sourceImage = d.sourceImage;
      let outputImage = d.outputImage;

      // Annotation images are user-created, save to inputs
      // Skip if already has ref (prevents duplicates on re-save after hydration)
      if (d.sourceImageRef && isBase64DataUrl(d.sourceImage)) {
        sourceImage = null;
      } else if (isBase64DataUrl(d.sourceImage)) {
        sourceImageRef = await saveImageAndGetId(d.sourceImage, workflowPath, savedImageIds, "inputs");
        sourceImage = null;
      }
      if (d.outputImageRef && isBase64DataUrl(d.outputImage)) {
        outputImage = null;
      } else if (isBase64DataUrl(d.outputImage)) {
        outputImageRef = await saveImageAndGetId(d.outputImage, workflowPath, savedImageIds, "inputs");
        outputImage = null;
      }

      newData = {
        ...d,
        sourceImage,
        sourceImageRef,
        outputImage,
        outputImageRef,
      };
      break;
    }

    case "generateImage": {
      const d = data as import("@/types").NanoBananaNodeData;
      let outputImageRef = d.outputImageRef;
      let outputImage = d.outputImage;
      let inputImageRefs = d.inputImageRefs ? [...d.inputImageRefs] : [];
      const inputImages: string[] = [];

      // Handle output image - AI generated, save to generations
      // Use selectedHistoryIndex to get the correct history entry (not hardcoded 0)
      const selectedIndex = d.selectedHistoryIndex || 0;
      const expectedRef = d.imageHistory?.[selectedIndex]?.id;

      if (d.outputImageRef && isBase64DataUrl(d.outputImage)) {
        // Verify existing ref matches expected history ID
        if (d.outputImageRef === expectedRef) {
          outputImage = null; // Ref is correct, just clear base64
        } else {
          // Ref doesn't match history - re-save with correct ID
          outputImageRef = await saveImageAndGetId(d.outputImage, workflowPath, savedImageIds, "generations", expectedRef);
          outputImage = null;
        }
      } else if (isBase64DataUrl(d.outputImage)) {
        // No existing ref - save with expected history ID for consistency
        outputImageRef = await saveImageAndGetId(d.outputImage, workflowPath, savedImageIds, "generations", expectedRef);
        outputImage = null;
      }

      // Handle input images array (these come from connected nodes, save to inputs if present)
      // Skip if corresponding inputImageRef already exists
      for (let i = 0; i < (d.inputImages?.length || 0); i++) {
        const img = d.inputImages[i];
        const existingRef = d.inputImageRefs?.[i];
        if (existingRef && isBase64DataUrl(img)) {
          inputImages.push(""); // Already has ref, just clear the base64
        } else if (isBase64DataUrl(img)) {
          const ref = await saveImageAndGetId(img, workflowPath, savedImageIds, "inputs");
          inputImageRefs[i] = ref;
          inputImages.push(""); // Empty placeholder
        } else {
          inputImages.push(img);
        }
      }

      newData = {
        ...d,
        inputImages: inputImages.length > 0 && inputImages.every(i => i === "") ? [] : inputImages,
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
        outputImage,
        outputImageRef,
      };
      break;
    }

    case "prompt": {
      const d = data as import("@/types").PromptNodeData;
      let inputImageRefs = d.inputImageRefs ? [...d.inputImageRefs] : [];
      const inputImages: string[] = [];
      const inputImagesArr = d.inputImages ?? [];

      for (let i = 0; i < inputImagesArr.length; i++) {
        const img = inputImagesArr[i];
        const existingRef = d.inputImageRefs?.[i];
        if (existingRef && isBase64DataUrl(img)) {
          inputImages.push("");
        } else if (isBase64DataUrl(img)) {
          const ref = await saveImageAndGetId(img, workflowPath, savedImageIds, "inputs");
          inputImageRefs[i] = ref;
          inputImages.push("");
        } else {
          inputImages.push(img);
        }
      }

      newData = {
        ...d,
        inputImages: inputImages.length > 0 && inputImages.every(i => i === "") ? [] : inputImages,
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
      };
      break;
    }

    case "generateVideo": {
      const d = data as import("@/types").GenerateVideoNodeData;
      let inputImageRefs = d.inputImageRefs ? [...d.inputImageRefs] : [];
      const inputImages: string[] = [];

      // Handle input images array (save to inputs)
      // Skip if corresponding inputImageRef already exists
      for (let i = 0; i < (d.inputImages?.length || 0); i++) {
        const img = d.inputImages[i];
        const existingRef = d.inputImageRefs?.[i];
        if (existingRef && isBase64DataUrl(img)) {
          inputImages.push(""); // Already has ref, just clear the base64
        } else if (isBase64DataUrl(img)) {
          const ref = await saveImageAndGetId(img, workflowPath, savedImageIds, "inputs");
          inputImageRefs[i] = ref;
          inputImages.push(""); // Empty placeholder
        } else {
          inputImages.push(img);
        }
      }

      // Note: outputVideo is a video URL, not saved as an image
      newData = {
        ...d,
        inputImages: inputImages.length > 0 && inputImages.every(i => i === "") ? [] : inputImages,
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
      };
      break;
    }

    case "output": {
      const d = data as import("@/types").OutputNodeData;
      // Output content is saved to /outputs during workflow execution, not here
      // Clear image data to keep workflow file small - outputs are regenerated on each run
      newData = { ...d, image: null, imageRef: undefined, video: null };
      break;
    }

    case "splitGrid": {
      const d = data as import("@/types").SplitGridNodeData;
      // SplitGrid source is input content, save to inputs
      // Skip if already has ref (prevents duplicates on re-save after hydration)
      if (d.sourceImageRef && isBase64DataUrl(d.sourceImage)) {
        newData = { ...d, sourceImage: null };
      } else if (isBase64DataUrl(d.sourceImage)) {
        const imageId = await saveImageAndGetId(d.sourceImage, workflowPath, savedImageIds, "inputs");
        newData = { ...d, sourceImage: null, sourceImageRef: imageId };
      } else {
        newData = d;
      }
      break;
    }

    default:
      newData = data;
  }

  return {
    ...node,
    data: newData,
  } as WorkflowNode;
}

// In-flight saves guard to prevent duplicate concurrent uploads of the same image
const inFlightSaves = new Map<string, Promise<string>>();

/**
 * Save an image and return its ID (with deduplication)
 * @param folder - "inputs" for user-uploaded images, "generations" for AI-generated images
 * @param existingId - Optional ID to use instead of generating a new one (for consistency with history)
 */
async function saveImageAndGetId(
  imageData: string,
  workflowPath: string,
  savedImageIds: Map<string, string>,
  folder: "inputs" | "generations" = "inputs",
  existingId?: string
): Promise<string> {
  // Use MD5 hash for reliable deduplication (consistent with save-generation API, Phase 13 decision)
  // Include folder in hash so same image in different folders gets different IDs
  const hash = `${folder}-${computeContentHash(imageData)}`;

  // Skip deduplication if an explicit ID is requested - we must use that exact ID
  // to maintain consistency with imageHistory. Otherwise, deduplicate by content.
  if (!existingId && savedImageIds.has(hash)) {
    return savedImageIds.get(hash)!;
  }

  // Check if there's already an in-flight save for this hash
  if (!existingId && inFlightSaves.has(hash)) {
    return inFlightSaves.get(hash)!;
  }

  // Use existing ID if provided (for consistency with imageHistory), otherwise generate new
  const imageId = existingId || generateImageId();

  const savePromise = (async () => {
    const response = await fetchWithTimeout(
      "/api/workflow-images",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowPath,
          imageId,
          imageData,
          folder,
        }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Failed to save image: ${result.error}`);
    }

    savedImageIds.set(hash, imageId);
    return imageId;
  })();

  if (!existingId) {
    inFlightSaves.set(hash, savePromise);
  }

  try {
    return await savePromise;
  } catch (error) {
    throw error;
  } finally {
    inFlightSaves.delete(hash);
  }
}

/**
 * Load all external images into a workflow, replacing refs with base64 data
 * Returns a new workflow object with base64 data instead of refs
 */
export async function hydrateWorkflowImages(
  workflow: WorkflowFile,
  workflowPath: string
): Promise<WorkflowFile> {
  const hydratedNodes: WorkflowNode[] = [];
  const loadedImages = new Map<string, string>(); // imageId -> base64 (for caching)

  for (const node of workflow.nodes) {
    const newNode = await hydrateNodeImages(node, workflowPath, loadedImages);
    hydratedNodes.push(newNode);
  }

  return {
    ...workflow,
    nodes: hydratedNodes,
  };
}

/**
 * Hydrate images for a single node
 */
async function hydrateNodeImages(
  node: WorkflowNode,
  workflowPath: string,
  loadedImages: Map<string, string>
): Promise<WorkflowNode> {
  const data = node.data as WorkflowNodeData;
  let newData: WorkflowNodeData;

  switch (node.type) {
    case "imageInput": {
      const d = data as import("@/types").ImageInputNodeData;
      if (d.imageRef && !d.image) {
        const image = await loadImageById(d.imageRef, workflowPath, loadedImages, "inputs");
        newData = {
          ...d,
          image,
        };
      } else {
        newData = d;
      }
      break;
    }

    case "annotation": {
      const d = data as import("@/types").AnnotationNodeData;
      let sourceImage = d.sourceImage;
      let outputImage = d.outputImage;

      if (d.sourceImageRef && !d.sourceImage) {
        sourceImage = await loadImageById(d.sourceImageRef, workflowPath, loadedImages, "inputs");
      }
      if (d.outputImageRef && !d.outputImage) {
        outputImage = await loadImageById(d.outputImageRef, workflowPath, loadedImages, "inputs");
      }

      newData = {
        ...d,
        sourceImage,
        outputImage,
      };
      break;
    }

    case "generateImage": {
      const d = data as import("@/types").NanoBananaNodeData;
      let outputImage = d.outputImage;
      const inputImages = [...(d.inputImages || [])];

      if (d.outputImageRef && !d.outputImage) {
        outputImage = await loadImageById(d.outputImageRef, workflowPath, loadedImages, "generations");
      }

      // Hydrate input images from refs
      if (d.inputImageRefs && d.inputImageRefs.length > 0) {
        for (let i = 0; i < d.inputImageRefs.length; i++) {
          const ref = d.inputImageRefs[i];
          if (ref) {
            inputImages[i] = await loadImageById(ref, workflowPath, loadedImages, "inputs");
          }
        }
      }

      newData = {
        ...d,
        inputImages,
        outputImage,
      };
      break;
    }

    case "prompt": {
      const d = data as import("@/types").PromptNodeData;
      const inputImages = [...(d.inputImages || [])];

      if (d.inputImageRefs && d.inputImageRefs.length > 0) {
        for (let i = 0; i < d.inputImageRefs.length; i++) {
          const ref = d.inputImageRefs[i];
          if (ref) {
            inputImages[i] = await loadImageById(ref, workflowPath, loadedImages, "inputs");
          }
        }
      }

      newData = {
        ...d,
        inputImages,
      };
      break;
    }

    case "generateVideo": {
      const d = data as import("@/types").GenerateVideoNodeData;
      const inputImages = [...(d.inputImages || [])];

      // Hydrate input images from refs
      if (d.inputImageRefs && d.inputImageRefs.length > 0) {
        for (let i = 0; i < d.inputImageRefs.length; i++) {
          const ref = d.inputImageRefs[i];
          if (ref) {
            inputImages[i] = await loadImageById(ref, workflowPath, loadedImages, "inputs");
          }
        }
      }

      newData = {
        ...d,
        inputImages,
      };
      break;
    }

    case "output": {
      // Output content is not persisted - it's regenerated on each workflow run
      // and saved to /outputs directory during execution
      newData = data;
      break;
    }

    case "splitGrid": {
      const d = data as import("@/types").SplitGridNodeData;
      if (d.sourceImageRef && !d.sourceImage) {
        const sourceImage = await loadImageById(d.sourceImageRef, workflowPath, loadedImages, "inputs");
        newData = {
          ...d,
          sourceImage,
        };
      } else {
        newData = d;
      }
      break;
    }

    default:
      newData = data;
  }

  return {
    ...node,
    data: newData,
  } as WorkflowNode;
}

/**
 * Load an image by ID (with caching)
 * @param folder - Optional hint for which folder to check first
 */
async function loadImageById(
  imageId: string,
  workflowPath: string,
  loadedImages: Map<string, string>,
  folder?: "inputs" | "generations"
): Promise<string> {
  if (loadedImages.has(imageId)) {
    return loadedImages.get(imageId)!;
  }

  const params = new URLSearchParams({
    workflowPath,
    imageId,
  });
  if (folder) {
    params.set("folder", folder);
  }

  const response = await fetch(`/api/workflow-images?${params.toString()}`);

  const result = await response.json();

  if (!result.success) {
    // Missing images are expected when refs point to deleted/moved files
    console.log(`Image not found: ${imageId}`);
    return ""; // Return empty string to avoid breaking the workflow
  }

  loadedImages.set(imageId, result.image);
  return result.image;
}
