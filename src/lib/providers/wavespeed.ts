/**
 * WaveSpeed Provider Implementation
 *
 * Implements ProviderInterface for WaveSpeed AI's image/video generation.
 * Uses WaveSpeed's v3 API with async task submission and polling.
 *
 * API Documentation:
 * - Submit task: POST https://api.wavespeed.ai/api/v3/{model-id}
 * - Get result: GET https://api.wavespeed.ai/api/v3/predictions/{task-id}
 *
 * Usage:
 *   import "@/lib/providers/wavespeed"; // Just importing registers the provider
 *
 *   // Or get it from registry:
 *   import { getProvider } from "@/lib/providers";
 *   const wavespeed = getProvider("wavespeed");
 */

import {
  ProviderInterface,
  ProviderModel,
  ModelCapability,
  GenerationInput,
  GenerationOutput,
  registerProvider,
} from "@/lib/providers";
import { validateMediaUrl } from "@/utils/urlValidation";

const WAVESPEED_API_BASE = "https://api.wavespeed.ai/api/v3";
const PROVIDER_SETTINGS_KEY = "openflows-provider-settings";

/**
 * WaveSpeed task status from API
 */
type WaveSpeedStatus = "pending" | "processing" | "completed" | "failed";

/**
 * WaveSpeed task response
 */
interface WaveSpeedTaskResponse {
  id: string;
  status: WaveSpeedStatus;
  outputs?: string[];
  error?: string;
  message?: string;
}

/**
 * WaveSpeed submit response
 */
interface WaveSpeedSubmitResponse {
  id: string;
  status: WaveSpeedStatus;
  data?: {
    id?: string;
  };
  error?: string;
  message?: string;
}

/**
 * WaveSpeed prediction result response
 */
interface WaveSpeedPredictionResponse {
  id: string;
  status: WaveSpeedStatus;
  outputs?: string[];
  output?: {
    images?: string[];
    videos?: string[];
  };
  error?: string;
  message?: string;
}

/**
 * Get API key from localStorage (client-side only)
 * Returns null when running on server or if not configured
 */
function getApiKeyFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const settingsJson = localStorage.getItem(PROVIDER_SETTINGS_KEY);
    if (!settingsJson) return null;

    const settings = JSON.parse(settingsJson);
    return settings?.providers?.wavespeed?.apiKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Fallback static list of WaveSpeed models (client-side only)
 * The main model listing is done via /api/models which fetches from https://api.wavespeed.ai/api/v3/models
 * This fallback is used when the API isn't available or for quick lookups
 */
const WAVESPEED_MODELS: ProviderModel[] = [
  {
    id: "wavespeed-ai/flux-dev",
    name: "FLUX Dev",
    description: "High-quality image generation model from WaveSpeed",
    provider: "wavespeed",
    capabilities: ["text-to-image", "image-to-image"],
    pricing: {
      type: "per-run",
      amount: 0.003, // Approximate
      currency: "USD",
    },
  },
  {
    id: "wavespeed-ai/flux-schnell",
    name: "FLUX Schnell",
    description: "Fast image generation model optimized for speed",
    provider: "wavespeed",
    capabilities: ["text-to-image", "image-to-image"],
    pricing: {
      type: "per-run",
      amount: 0.001, // Approximate
      currency: "USD",
    },
  },
  {
    id: "wavespeed-ai/sd3-medium",
    name: "Stable Diffusion 3 Medium",
    description: "Stable Diffusion 3 medium model for balanced quality and speed",
    provider: "wavespeed",
    capabilities: ["text-to-image", "image-to-image"],
    pricing: {
      type: "per-run",
      amount: 0.002,
      currency: "USD",
    },
  },
  {
    id: "wavespeed-ai/wan-2.1",
    name: "WAN 2.1",
    description: "Text-to-video generation model",
    provider: "wavespeed",
    capabilities: ["text-to-video"],
    pricing: {
      type: "per-run",
      amount: 0.05,
      currency: "USD",
    },
  },
];

/**
 * Infer output type from model capabilities
 */
function inferOutputType(capabilities: ModelCapability[]): "image" | "video" {
  if (capabilities.includes("text-to-video") || capabilities.includes("image-to-video")) {
    return "video";
  }
  return "image";
}

/**
 * WaveSpeed provider implementation
 */
const wavespeedProvider: ProviderInterface = {
  id: "wavespeed",
  name: "WaveSpeed",

  async listModels(): Promise<ProviderModel[]> {
    // WaveSpeed doesn't have a public models API, return static list
    // Only return models if API key is configured (to signal availability)
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      console.warn("[WaveSpeed] No API key configured, returning empty model list");
      return [];
    }
    return WAVESPEED_MODELS;
  },

  async searchModels(query: string): Promise<ProviderModel[]> {
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    return WAVESPEED_MODELS.filter(
      (model) =>
        model.name.toLowerCase().includes(lowerQuery) ||
        model.id.toLowerCase().includes(lowerQuery) ||
        model.description?.toLowerCase().includes(lowerQuery)
    );
  },

  async getModel(modelId: string): Promise<ProviderModel | null> {
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      return null;
    }

    return WAVESPEED_MODELS.find((m) => m.id === modelId) || null;
  },

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      return {
        success: false,
        error: "WaveSpeed API key not configured",
      };
    }

    try {
      const modelId = input.model.id;

      // Validate modelId to prevent path traversal
      if (/[^a-zA-Z0-9\-_/.]/.test(modelId) || modelId.includes('..')) {
        return { success: false, error: `Invalid model ID: ${modelId}` };
      }

      const outputType = inferOutputType(input.model.capabilities);

      // Build WaveSpeed payload
      // WaveSpeed uses specific field names
      const payload: Record<string, unknown> = {
        prompt: input.prompt,
        ...input.parameters,
      };

      // Handle image inputs
      if (input.images && input.images.length > 0) {
        // WaveSpeed typically expects image_url or image
        payload.image = input.images[0];
      }

      // Apply dynamic inputs (schema-mapped connections)
      if (input.dynamicInputs) {
        for (const [key, value] of Object.entries(input.dynamicInputs)) {
          if (value !== null && value !== undefined && value !== '') {
            payload[key] = value;
          }
        }
      }

      // Submit task
      const submitResponse = await fetch(`${WAVESPEED_API_BASE}/${modelId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        let errorDetail = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.message || errorText;
        } catch {
          // Keep original text
        }

        if (submitResponse.status === 429) {
          return {
            success: false,
            error: `WaveSpeed: Rate limit exceeded. Try again in a moment.`,
          };
        }

        return {
          success: false,
          error: `WaveSpeed: ${errorDetail}`,
        };
      }

      const submitResult: WaveSpeedSubmitResponse = await submitResponse.json();
      const taskId = submitResult.data?.id || submitResult.id;

      if (!taskId) {
        return {
          success: false,
          error: "WaveSpeed: No task ID returned from API",
        };
      }

      // Validate taskId to prevent path traversal in poll URL
      if (/[^a-zA-Z0-9\-_]/.test(taskId)) {
        return { success: false, error: `WaveSpeed: Invalid task ID format` };
      }

      // Poll for completion
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const pollInterval = 1000; // 1 second
      const startTime = Date.now();

      let currentStatus: WaveSpeedPredictionResponse = { id: taskId, status: "pending" };

      while (
        currentStatus.status !== "completed" &&
        currentStatus.status !== "failed"
      ) {
        if (Date.now() - startTime > maxWaitTime) {
          return {
            success: false,
            error: "WaveSpeed: Generation timed out after 5 minutes",
          };
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const pollResponse = await fetch(
          `${WAVESPEED_API_BASE}/predictions/${taskId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        if (!pollResponse.ok) {
          return {
            success: false,
            error: `WaveSpeed: Failed to poll task status: ${pollResponse.status}`,
          };
        }

        currentStatus = await pollResponse.json();
      }

      if (currentStatus.status === "failed") {
        return {
          success: false,
          error: currentStatus.error || currentStatus.message || "Generation failed",
        };
      }

      // Extract outputs
      let outputUrls: string[] = [];

      if (currentStatus.outputs && currentStatus.outputs.length > 0) {
        outputUrls = currentStatus.outputs;
      } else if (currentStatus.output) {
        if (outputType === "video" && currentStatus.output.videos) {
          outputUrls = currentStatus.output.videos;
        } else if (currentStatus.output.images) {
          outputUrls = currentStatus.output.images;
        }
      }

      if (outputUrls.length === 0) {
        return {
          success: false,
          error: "WaveSpeed: No outputs in generation result",
        };
      }

      // Fetch the first output and convert to base64
      const outputUrl = outputUrls[0];

      // Validate URL before fetching
      const urlCheck = validateMediaUrl(outputUrl);
      if (!urlCheck.valid) {
        return { success: false, error: `Invalid output URL: ${urlCheck.error}` };
      }

      const outputResponse = await fetch(outputUrl);

      if (!outputResponse.ok) {
        return {
          success: false,
          error: `WaveSpeed: Failed to fetch output: ${outputResponse.status}`,
        };
      }

      // Check file size before downloading body
      const MAX_MEDIA_SIZE = 500 * 1024 * 1024; // 500MB
      const contentLength = parseInt(outputResponse.headers.get("content-length") || "0", 10);
      if (contentLength > MAX_MEDIA_SIZE) {
        return { success: false, error: `Media too large: ${(contentLength / (1024 * 1024)).toFixed(0)}MB > 500MB limit` };
      }

      const outputArrayBuffer = await outputResponse.arrayBuffer();
      const outputBase64 = Buffer.from(outputArrayBuffer).toString("base64");

      const contentType =
        outputResponse.headers.get("content-type") ||
        (outputType === "video" ? "video/mp4" : "image/png");

      return {
        success: true,
        outputs: [
          {
            type: outputType,
            data: `data:${contentType};base64,${outputBase64}`,
            url: outputUrl,
          },
        ],
      };
    } catch (error) {
      console.error("[WaveSpeed] Generation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Generation failed",
      };
    }
  },

  isConfigured(): boolean {
    return !!getApiKeyFromStorage();
  },

  getApiKey(): string | null {
    return getApiKeyFromStorage();
  },
};

// Self-register when module is imported
registerProvider(wavespeedProvider);

export default wavespeedProvider;

// Export static models for use in API routes
export { WAVESPEED_MODELS };
