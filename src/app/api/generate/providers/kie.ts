/**
 * Kie.ai Provider for Generate API Route
 *
 * Handles image/video generation using Kie.ai API.
 * Supports standard createTask endpoint and Veo-specific endpoints.
 */

import { GenerationInput, GenerationOutput } from "@/lib/providers/types";
import { validateMediaUrl } from "@/utils/urlValidation";

const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Get default required parameters for a Kie model
 * Many Kie models require specific parameters to be present even if not user-specified
 */
export function getKieModelDefaults(modelId: string): Record<string, unknown> {
  switch (modelId) {
    // GPT Image models
    case "gpt-image/1.5-text-to-image":
    case "gpt-image/1.5-image-to-image":
      return {
        aspect_ratio: "3:2",
        quality: "medium",
      };

    // Z-Image model
    case "z-image":
      return {
        aspect_ratio: "1:1",
      };

    // Seedream models
    case "seedream/4.5-text-to-image":
    case "seedream/4.5-edit":
      return {
        aspect_ratio: "1:1",
        quality: "basic",
      };

    // Nano Banana Pro (Kie)
    case "nano-banana-pro":
      return {
        aspect_ratio: "1:1",
        resolution: "1K",
      };

    // Flux-2 models
    case "flux-2/pro-text-to-image":
    case "flux-2/pro-image-to-image":
    case "flux-2/flex-text-to-image":
    case "flux-2/flex-image-to-image":
      return {
        aspect_ratio: "1:1",
      };

    // Grok Imagine image models
    case "grok-imagine/text-to-image":
      return {
        aspect_ratio: "1:1",
      };

    case "grok-imagine/image-to-image":
      return {};

    // Grok Imagine video models
    case "grok-imagine/text-to-video":
      return {
        aspect_ratio: "2:3",
        duration: "6",
        mode: "normal",
      };

    case "grok-imagine/image-to-video":
      return {
        aspect_ratio: "2:3",
        duration: "6",
        mode: "normal",
      };

    // Kling 2.6 video models
    case "kling-2.6/text-to-video":
    case "kling-2.6/image-to-video":
      return {
        aspect_ratio: "16:9",
        duration: "5",
        sound: true,
      };

    // Kling 2.6 motion control
    case "kling-2.6/motion-control":
      return {
        mode: "720p",
        character_orientation: "video",
      };

    // Kling 2.5 turbo models
    case "kling/v2-5-turbo-text-to-video-pro":
    case "kling/v2-5-turbo-image-to-video-pro":
      return {
        aspect_ratio: "16:9",
        duration: "5",
        cfg_scale: 0.5,
      };

    // Wan video models
    case "wan/2-6-text-to-video":
    case "wan/2-6-image-to-video":
      return {
        duration: "5",
        resolution: "1080p",
      };

    case "wan/2-6-video-to-video":
      return {
        duration: "5",
        resolution: "1080p",
      };

    // Topaz video upscale
    case "topaz/video-upscale":
      return {
        upscale_factor: "2",
      };

    // Veo 3 models
    case "veo3/text-to-video":
    case "veo3/image-to-video":
    case "veo3-fast/text-to-video":
    case "veo3-fast/image-to-video":
      return {
        aspect_ratio: "16:9",
      };

    // ElevenLabs TTS models
    case "elevenlabs/turbo-v2.5":
    case "elevenlabs/multilingual-v2":
    case "elevenlabs/text-to-dialogue-v3":
      return {
        output_format: "mp3_44100_128",
      };

    // ElevenLabs Sound Effects
    case "elevenlabs/sound-effect-v2":
      return {
        output_format: "mp3_44100_128",
        prompt_influence: 0.3,
      };

    default:
      return {};
  }
}

/**
 * Get the correct image input parameter name for a Kie model
 */
export function getKieImageInputKey(modelId: string): string {
  // Model-specific parameter names
  if (modelId === "nano-banana-pro") return "image_input";
  if (modelId === "seedream/4.5-edit") return "image_urls";
  if (modelId === "gpt-image/1.5-image-to-image") return "input_urls";
  // Flux-2 I2I models use input_urls
  if (modelId === "flux-2/pro-image-to-image" || modelId === "flux-2/flex-image-to-image") return "input_urls";
  // Kling 2.5 turbo I2V uses singular image_url
  if (modelId === "kling/v2-5-turbo-image-to-video-pro") return "image_url";
  // Kling 2.6 motion control uses input_urls
  if (modelId === "kling-2.6/motion-control") return "input_urls";
  // Topaz video upscale uses video_url (singular)
  if (modelId === "topaz/video-upscale") return "video_url";
  // Veo 3 models use imageUrls
  if (modelId.startsWith("veo3")) return "imageUrls";
  // Default for most models
  return "image_urls";
}


/**
 * Detect actual image type from binary data (magic bytes)
 */
export function detectImageType(buffer: Buffer): { mimeType: string; ext: string } {
  // Check magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mimeType: "image/png", ext: "png" };
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mimeType: "image/jpeg", ext: "jpg" };
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return { mimeType: "image/webp", ext: "webp" };
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { mimeType: "image/gif", ext: "gif" };
  }
  // Default to PNG
  return { mimeType: "image/png", ext: "png" };
}

/**
 * Upload a base64 image to Kie.ai and get a URL
 * Required for image-to-image models since Kie doesn't accept base64 directly
 * Uses base64 upload endpoint (same as official Kie client)
 */
export async function uploadImageToKie(
  requestId: string,
  apiKey: string,
  base64Image: string
): Promise<string> {
  // Extract mime type and data from data URL
  let declaredMimeType = "image/png";
  let imageData = base64Image;

  if (base64Image.startsWith("data:")) {
    const matches = base64Image.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      declaredMimeType = matches[1];
      imageData = matches[2];
    }
  }

  // Convert base64 to binary to detect actual type
  const binaryData = Buffer.from(imageData, "base64");

  if (binaryData.length > MAX_UPLOAD_SIZE) {
    throw new Error(`[API:${requestId}] Image too large to upload (${(binaryData.length / (1024 * 1024)).toFixed(1)}MB, max ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB)`);
  }

  // Detect actual image type from magic bytes (don't trust the declared MIME type)
  const detected = detectImageType(binaryData);
  const mimeType = detected.mimeType;
  const ext = detected.ext;

  const filename = `upload_${Date.now()}.${ext}`;

  console.log(`[API:${requestId}] Uploading image to Kie.ai: ${filename} (${(binaryData.length / 1024).toFixed(1)}KB) [declared: ${declaredMimeType}, actual: ${mimeType}]`);

  // Use base64 upload endpoint (same as official Kie client)
  // Format: data:{mime_type};base64,{data}
  const dataUrl = `data:${mimeType};base64,${imageData}`;

  const response = await fetch("https://kieai.redpandaai.co/api/file-base64-upload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: "images",
      fileName: filename,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload image: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`[API:${requestId}] Kie upload response:`, JSON.stringify(result).substring(0, 300));

  // Check for error in response
  if (result.code && result.code !== 200 && !result.success) {
    throw new Error(`Upload failed: ${result.msg || 'Unknown error'}`);
  }

  // Response format: { success: true, code: 200, data: { downloadUrl: "...", fileName: "...", fileSize: 123 } }
  const downloadUrl = result.data?.downloadUrl || result.downloadUrl || result.url;

  if (!downloadUrl) {
    console.error(`[API:${requestId}] Upload response has no URL:`, result);
    throw new Error(`No download URL in upload response. Response: ${JSON.stringify(result).substring(0, 200)}`);
  }

  console.log(`[API:${requestId}] Image uploaded: ${downloadUrl.substring(0, 80)}...`);
  return downloadUrl;
}

/**
 * Poll Kie.ai task status until completion
 */
export async function pollKieTaskCompletion(
  requestId: string,
  apiKey: string,
  taskId: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const maxWaitTime = 10 * 60 * 1000; // 10 minutes for video
  const pollInterval = 2000; // 2 seconds
  const startTime = Date.now();
  let lastStatus = "";

  const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return { success: false, error: "Generation timed out after 10 minutes" };
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const response = await fetch(pollUrl, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to poll status: ${response.status}` };
    }

    const result = await response.json();
    // Kie API returns "state" in result.data.state (not "status")
    const state = (result.data?.state || result.state || result.status || "").toUpperCase();

    if (state !== lastStatus) {
      console.log(`[API:${requestId}] Kie task state: ${state}`);
      lastStatus = state;
    }

    if (state === "SUCCESS" || state === "COMPLETED") {
      return { success: true, data: result.data || result };
    }

    if (state === "FAIL" || state === "FAILED" || state === "ERROR") {
      console.error(`[API:${requestId}] Kie task failed. Full response:`, JSON.stringify(result).substring(0, 1000));
      const errorMessage = result.data?.failMsg || result.data?.errorMessage || result.error || result.message || "Generation failed";
      return { success: false, error: errorMessage };
    }

    // Continue polling for: WAITING, QUEUING, GENERATING, PROCESSING, etc.
  }
}


export function isVeoModel(modelId: string): boolean {
  return modelId.startsWith("veo3/") || modelId.startsWith("veo3-fast/");
}

export function getVeoApiModelId(modelId: string): string {
  if (modelId.startsWith("veo3-fast/")) return "veo3_fast";
  return "veo3";
}

export async function pollVeoTaskCompletion(
  requestId: string,
  apiKey: string,
  taskId: string,
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const maxWaitTime = 10 * 60 * 1000;
  const pollInterval = 2000;
  const startTime = Date.now();
  let lastStatus = -1;

  const pollUrl = `https://api.kie.ai/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`;

  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      return { success: false, error: "Generation timed out after 10 minutes" };
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const response = await fetch(pollUrl, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return { success: false, error: `Failed to poll status: ${response.status}` };
    }

    const result = await response.json();
    const successFlag = result.data?.successFlag ?? -1;

    if (successFlag !== lastStatus) {
      console.log(`[API:${requestId}] Veo task successFlag: ${successFlag}`);
      lastStatus = successFlag;
    }

    if (successFlag === 1) {
      return { success: true, data: result.data };
    }
    if (successFlag === 2 || successFlag === 3) {
      const errorMessage = result.data?.errorMessage || "Generation failed";
      return { success: false, error: errorMessage };
    }
    // successFlag === 0 means still generating, continue polling
  }
}

/**
 * Generate image/video using Kie.ai API
 */
export async function generateWithKie(
  requestId: string,
  apiKey: string,
  input: GenerationInput
): Promise<GenerationOutput> {
  const modelId = input.model.id;

  console.log(`[API:${requestId}] Kie.ai generation - Model: ${modelId}, Images: ${input.images?.length || 0}, Prompt: ${input.prompt.length} chars`);

  // Build the input object (all parameters go inside "input" for Kie API)
  // Start with model-specific required defaults
  const modelDefaults = getKieModelDefaults(modelId);
  const inputParams: Record<string, unknown> = { ...modelDefaults };

  // Add prompt
  if (input.prompt) {
    inputParams.prompt = input.prompt;
  }

  // Add model parameters (user params override defaults)
  if (input.parameters) {
    Object.assign(inputParams, input.parameters);
  }

  // GPT Image 1.5 does NOT support 'size' parameter - only 'aspect_ratio'
  // Remove any stale 'size' values from old workflow data
  if (modelId.startsWith("gpt-image/1.5")) {
    delete inputParams.size;
  }

  // Handle dynamic inputs FIRST (from schema-mapped connections) - these take priority
  // Track which image keys dynamicInputs already handled to avoid double-uploads
  const handledImageKeys = new Set<string>();

  if (input.dynamicInputs) {
    for (const [key, value] of Object.entries(input.dynamicInputs)) {
      if (value !== null && value !== undefined && value !== '') {
        // Check if this is an image input that needs uploading
        if (typeof value === 'string' && value.startsWith('data:image')) {
          // Single data URL - upload it
          const url = await uploadImageToKie(requestId, apiKey, value);
          // Singular keys get a string, plural keys get an array
          if (key === "image_url" || key === "video_url" || key === "tail_image_url") {
            inputParams[key] = url;
          } else {
            inputParams[key] = [url];
          }
          handledImageKeys.add(key);
        } else if (Array.isArray(value)) {
          // Array of values - check if they're data URLs that need uploading
          const processedArray: string[] = [];
          for (const item of value) {
            if (typeof item === 'string' && item.startsWith('data:image')) {
              const url = await uploadImageToKie(requestId, apiKey, item);
              processedArray.push(url);
            } else if (typeof item === 'string' && item.startsWith('http')) {
              processedArray.push(item);
            } else if (typeof item === 'string') {
              processedArray.push(item);
            }
          }
          if (processedArray.length > 0) {
            // Singular keys get first element, plural keys get full array
            if (key === "image_url" || key === "video_url" || key === "tail_image_url") {
              inputParams[key] = processedArray[0];
            } else {
              inputParams[key] = processedArray;
            }
            handledImageKeys.add(key);
          }
        } else {
          inputParams[key] = value;
        }
      }
    }
  }

  // Handle image inputs (fallback - only if dynamicInputs didn't already set the image key)
  const imageKey = getKieImageInputKey(modelId);
  if (input.images && input.images.length > 0 && !handledImageKeys.has(imageKey)) {
    // Upload images to get URLs (Kie requires URLs, not base64)
    const imageUrls: string[] = [];
    for (const image of input.images) {
      if (image.startsWith("http")) {
        imageUrls.push(image);
      } else {
        // Upload base64 image
        const url = await uploadImageToKie(requestId, apiKey, image);
        imageUrls.push(url);
      }
    }

    // Some models use singular string, others use arrays
    if (imageKey === "image_url" || imageKey === "video_url") {
      inputParams[imageKey] = imageUrls[0];
    } else {
      inputParams[imageKey] = imageUrls;
    }
  }

  // Veo 3 models use a different API endpoint and request format
  if (isVeoModel(modelId)) {
    const veoBody: Record<string, unknown> = {
      prompt: inputParams.prompt,
      model: getVeoApiModelId(modelId),
      aspect_ratio: inputParams.aspect_ratio || "16:9",
    };

    // Add image URLs if present (for image-to-video)
    if (inputParams.imageUrls) {
      veoBody.imageUrls = Array.isArray(inputParams.imageUrls)
        ? inputParams.imageUrls
        : [inputParams.imageUrls];
    }

    // Add optional seed
    if (inputParams.seeds !== undefined) {
      veoBody.seeds = inputParams.seeds;
    }

    const veoUrl = "https://api.kie.ai/api/v1/veo/generate";
    console.log(`[API:${requestId}] Calling Veo API: ${veoUrl}`);
    console.log(`[API:${requestId}] Veo request body:`, JSON.stringify(veoBody, null, 2));

    const createResponse = await fetch(veoUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(veoBody),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      let errorDetail = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.message || errorJson.error || errorJson.detail || errorText;
      } catch {
        // Keep original text
      }
      if (createResponse.status === 429) {
        return { success: false, error: `${input.model.name}: Rate limit exceeded. Try again in a moment.` };
      }
      return { success: false, error: `${input.model.name}: ${errorDetail}` };
    }

    const createResult = await createResponse.json();
    if (createResult.code && createResult.code !== 200) {
      return { success: false, error: `${input.model.name}: ${createResult.msg || "API error"}` };
    }

    const taskId = createResult.data?.taskId || createResult.taskId;
    if (!taskId) {
      console.error(`[API:${requestId}] No taskId in Veo response:`, createResult);
      return { success: false, error: "No task ID in Veo response" };
    }

    console.log(`[API:${requestId}] Veo task created: ${taskId}`);

    // Poll with Veo-specific polling
    const pollResult = await pollVeoTaskCompletion(requestId, apiKey, taskId);
    if (!pollResult.success) {
      return { success: false, error: `${input.model.name}: ${pollResult.error}` };
    }

    // Extract video URL from Veo response format
    const data = pollResult.data;
    let mediaUrl: string | null = null;

    const responseObj = data?.response as Record<string, unknown> | undefined;
    const resultUrls = (responseObj?.resultUrls || data?.resultUrls) as string[] | undefined;
    if (resultUrls && resultUrls.length > 0) {
      mediaUrl = resultUrls[0];
    }

    if (!mediaUrl) {
      console.error(`[API:${requestId}] No media URL found in Veo response:`, data);
      return { success: false, error: "No output URL in Veo response" };
    }

    // Validate URL before fetching
    const mediaUrlCheck = validateMediaUrl(mediaUrl);
    if (!mediaUrlCheck.valid) {
      return { success: false, error: `Invalid media URL: ${mediaUrlCheck.error}` };
    }

    // Fetch the video and convert to base64
    console.log(`[API:${requestId}] Fetching Veo output from: ${mediaUrl.substring(0, 80)}...`);
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      return { success: false, error: `Failed to fetch output: ${mediaResponse.status}` };
    }

    const mediaContentLength = parseInt(mediaResponse.headers.get("content-length") || "0", 10);
    if (mediaContentLength > MAX_MEDIA_SIZE) {
      return { success: false, error: `Media too large: ${(mediaContentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
    }

    const contentType = mediaResponse.headers.get("content-type") || "video/mp4";
    const mediaArrayBuffer = await mediaResponse.arrayBuffer();
    if (mediaArrayBuffer.byteLength > MAX_MEDIA_SIZE) {
      return { success: false, error: `Media too large: ${(mediaArrayBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
    }
    const mediaSizeMB = mediaArrayBuffer.byteLength / (1024 * 1024);

    console.log(`[API:${requestId}] Veo output: ${contentType}, ${mediaSizeMB.toFixed(2)}MB`);

    // For very large videos (>20MB), return URL only (data left empty for consumers)
    if (mediaSizeMB > 20) {
      console.log(`[API:${requestId}] SUCCESS - Returning URL for large Veo video`);
      return {
        success: true,
        outputs: [{ type: "video", data: "", url: mediaUrl }],
      };
    }

    const mediaBase64 = Buffer.from(mediaArrayBuffer).toString("base64");
    console.log(`[API:${requestId}] SUCCESS - Returning Veo video`);
    return {
      success: true,
      outputs: [{ type: "video", data: `data:${contentType};base64,${mediaBase64}`, url: mediaUrl }],
    };
  }

  // ElevenLabs models use "text" instead of "prompt"
  if (modelId.startsWith("elevenlabs/")) {
    if (inputParams.prompt) {
      inputParams.text = inputParams.prompt;
      delete inputParams.prompt;
    }
  }

  // All remaining Kie models use the standard createTask endpoint
  const requestBody: Record<string, unknown> = {
    model: modelId,
    input: inputParams,
  };

  const createUrl = "https://api.kie.ai/api/v1/jobs/createTask";

  console.log(`[API:${requestId}] Calling Kie.ai API: ${createUrl}`);
  // Log full request body for debugging (truncate very long prompts)
  const bodyForLogging = { ...requestBody };
  if (bodyForLogging.input && typeof bodyForLogging.input === 'object') {
    const inputForLogging = { ...(bodyForLogging.input as Record<string, unknown>) };
    if (typeof inputForLogging.prompt === 'string' && (inputForLogging.prompt as string).length > 200) {
      inputForLogging.prompt = (inputForLogging.prompt as string).substring(0, 200) + '...[truncated]';
    }
    bodyForLogging.input = inputForLogging;
  }
  console.log(`[API:${requestId}] Request body:`, JSON.stringify(bodyForLogging, null, 2));

  // Create task
  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    let errorDetail = errorText;
    try {
      const errorJson = JSON.parse(errorText);
      errorDetail = errorJson.message || errorJson.error || errorJson.detail || errorText;
    } catch {
      // Keep original text
    }

    if (createResponse.status === 429) {
      return {
        success: false,
        error: `${input.model.name}: Rate limit exceeded. Try again in a moment.`,
      };
    }

    return {
      success: false,
      error: `${input.model.name}: ${errorDetail}`,
    };
  }

  const createResult = await createResponse.json();

  // Kie API returns HTTP 200 even on errors, check the response code
  if (createResult.code && createResult.code !== 200) {
    const errorMsg = createResult.msg || createResult.message || "API error";
    console.error(`[API:${requestId}] Kie API error (code ${createResult.code}):`, errorMsg);
    return {
      success: false,
      error: `${input.model.name}: ${errorMsg}`,
    };
  }

  const taskId = createResult.taskId || createResult.data?.taskId || createResult.id;

  if (!taskId) {
    console.error(`[API:${requestId}] No taskId in Kie response:`, createResult);
    return {
      success: false,
      error: "No task ID in response",
    };
  }

  console.log(`[API:${requestId}] Kie task created: ${taskId}`);

  // Poll for completion
  const pollResult = await pollKieTaskCompletion(requestId, apiKey, taskId);

  if (!pollResult.success) {
    return {
      success: false,
      error: `${input.model.name}: ${pollResult.error}`,
    };
  }

  // Extract output URL from result
  // Kie API returns: { data: { status: "success", resultJson: { resultUrls: ["url1", "url2"] } } }
  const data = pollResult.data;
  let mediaUrl: string | null = null;
  let isVideo = false;
  let isAudio = false;

  // Used as fallback when content-type is ambiguous
  const isAudioModel = input.model.capabilities.some(c => c.includes("audio"));

  console.log(`[API:${requestId}] Kie poll result data:`, JSON.stringify(data).substring(0, 500));

  // Try various response formats - Kie uses resultJson.resultUrls
  // Note: resultJson is often a JSON string that needs parsing
  if (data) {
    let resultJson = data.resultJson as Record<string, unknown> | string | undefined;

    // Parse resultJson if it's a string (Kie API returns it as escaped JSON string)
    if (typeof resultJson === 'string') {
      try {
        resultJson = JSON.parse(resultJson) as Record<string, unknown>;
      } catch {
        // Not valid JSON, keep as-is
        resultJson = undefined;
      }
    }

    const resultUrls = ((resultJson as Record<string, unknown> | undefined)?.resultUrls || data.resultUrls) as string[] | undefined;

    if (resultUrls && resultUrls.length > 0) {
      mediaUrl = resultUrls[0];
      // Check if it's a video based on URL
      isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || mediaUrl.includes('video');
    }
    // Fallback to other formats
    else if (data.videoUrl) {
      mediaUrl = data.videoUrl as string;
      isVideo = true;
    } else if (data.video_url) {
      mediaUrl = data.video_url as string;
      isVideo = true;
    } else if (data.output && typeof data.output === 'string' && (data.output as string).includes('.mp4')) {
      mediaUrl = data.output as string;
      isVideo = true;
    }
    // Image outputs
    else if (data.imageUrl) {
      mediaUrl = data.imageUrl as string;
    } else if (data.image_url) {
      mediaUrl = data.image_url as string;
    } else if (data.output && typeof data.output === 'string') {
      mediaUrl = data.output as string;
    } else if (data.url) {
      mediaUrl = data.url as string;
    } else if (Array.isArray(data.images) && data.images.length > 0) {
      mediaUrl = (data.images[0] as { url?: string })?.url || data.images[0] as string;
    }
  }

  if (!mediaUrl) {
    console.error(`[API:${requestId}] No media URL found in Kie response:`, data);
    return {
      success: false,
      error: "No output URL in response",
    };
  }

  // Detect video from URL if not already detected
  if (!isVideo && !isAudio && (mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || mediaUrl.includes('video'))) {
    isVideo = true;
  }

  // Detect audio from URL if not already detected
  if (!isVideo && !isAudio && (mediaUrl.includes('.mp3') || mediaUrl.includes('.wav') || mediaUrl.includes('.ogg') || mediaUrl.includes('.flac'))) {
    isAudio = true;
  }

  // Validate URL before fetching
  const mediaUrlCheck = validateMediaUrl(mediaUrl);
  if (!mediaUrlCheck.valid) {
    return { success: false, error: `Invalid media URL: ${mediaUrlCheck.error}` };
  }

  // Fetch the media and convert to base64
  console.log(`[API:${requestId}] Fetching output from: ${mediaUrl.substring(0, 80)}...`);
  const mediaResponse = await fetch(mediaUrl);

  if (!mediaResponse.ok) {
    return {
      success: false,
      error: `Failed to fetch output: ${mediaResponse.status}`,
    };
  }

  // Check file size before downloading body
  const mediaContentLength = parseInt(mediaResponse.headers.get("content-length") || "0", 10);
  if (mediaContentLength > MAX_MEDIA_SIZE) {
    return { success: false, error: `Media too large: ${(mediaContentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
  }

  const rawContentType = mediaResponse.headers.get("content-type") || "";
  const isConcreteMedia = rawContentType.startsWith("audio/") || rawContentType.startsWith("video/") || rawContentType.startsWith("image/");
  // Content-type wins over URL-based detection; reset opposite flag to avoid conflicts
  if (rawContentType.startsWith("video/")) {
    isVideo = true;
    isAudio = false;
  } else if (rawContentType.startsWith("audio/")) {
    isAudio = true;
    isVideo = false;
  } else if (!isConcreteMedia && !isVideo && !isAudio && isAudioModel) {
    isAudio = true;
  }
  const contentType = rawContentType || (isVideo ? "video/mp4" : isAudio ? "audio/mpeg" : "image/png");

  const mediaArrayBuffer = await mediaResponse.arrayBuffer();
  if (mediaArrayBuffer.byteLength > MAX_MEDIA_SIZE) {
    return { success: false, error: `Media too large: ${(mediaArrayBuffer.byteLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
  }
  const mediaSizeBytes = mediaArrayBuffer.byteLength;
  const mediaSizeMB = mediaSizeBytes / (1024 * 1024);

  console.log(`[API:${requestId}] Output: ${contentType}, ${mediaSizeMB.toFixed(2)}MB`);

  // For audio models, return base64 encoded audio
  if (isAudio) {
    const audioBase64 = Buffer.from(mediaArrayBuffer).toString("base64");
    console.log(`[API:${requestId}] SUCCESS - Returning audio`);
    return {
      success: true,
      outputs: [{
        type: "audio",
        data: `data:${contentType};base64,${audioBase64}`,
        url: mediaUrl,
      }],
    };
  }

  // For very large videos (>20MB), return URL only (data left empty for consumers)
  if (isVideo && mediaSizeMB > 20) {
    console.log(`[API:${requestId}] SUCCESS - Returning URL for large video`);
    return {
      success: true,
      outputs: [
        {
          type: "video",
          data: "",
          url: mediaUrl,
        },
      ],
    };
  }

  const mediaBase64 = Buffer.from(mediaArrayBuffer).toString("base64");
  console.log(`[API:${requestId}] SUCCESS - Returning ${isVideo ? "video" : "image"}`);

  return {
    success: true,
    outputs: [
      {
        type: isVideo ? "video" : "image",
        data: `data:${contentType};base64,${mediaBase64}`,
        url: mediaUrl,
      },
    ],
  };
}
