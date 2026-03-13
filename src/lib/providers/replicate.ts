/**
 * Replicate Provider Implementation
 *
 * Implements ProviderInterface for Replicate.com's AI model marketplace.
 * Provides model discovery via Replicate's REST API and self-registers
 * in the provider registry when imported.
 *
 * Usage:
 *   import "@/lib/providers/replicate"; // Just importing registers the provider
 *
 *   // Or get it from registry:
 *   import { getProvider } from "@/lib/providers";
 *   const replicate = getProvider("replicate");
 */

import {
  ProviderInterface,
  ProviderModel,
  ModelCapability,
  GenerationInput,
  GenerationOutput,
  registerProvider,
} from "@/lib/providers";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const PROVIDER_SETTINGS_KEY = "openflows-provider-settings";

/**
 * Response schema from Replicate's list models endpoint
 */
interface ReplicateModelsResponse {
  next: string | null;
  previous: string | null;
  results: ReplicateModel[];
}

/**
 * Response schema from Replicate's search endpoint
 */
interface ReplicateSearchResponse {
  next: string | null;
  results: ReplicateSearchResult[];
}

interface ReplicateSearchResult {
  model: ReplicateModel;
}

/**
 * Model schema from Replicate API
 */
interface ReplicateModel {
  url: string;
  owner: string;
  name: string;
  description: string | null;
  visibility: "public" | "private";
  github_url?: string;
  paper_url?: string;
  license_url?: string;
  run_count: number;
  cover_image_url?: string;
  default_example?: Record<string, unknown>;
  latest_version?: {
    id: string;
    openapi_schema?: Record<string, unknown>;
  };
}

/**
 * Prediction schema from Replicate API
 */
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: string;
  urls?: {
    get: string;
    cancel: string;
  };
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
    return settings?.providers?.replicate?.apiKey ?? null;
  } catch {
    return null;
  }
}

/**
 * Infer model capabilities from name and description
 */
function inferCapabilities(model: ReplicateModel): ModelCapability[] {
  const capabilities: ModelCapability[] = ["text-to-image"];

  const searchText = `${model.name} ${model.description ?? ""}`.toLowerCase();

  if (
    searchText.includes("img2img") ||
    searchText.includes("image-to-image") ||
    searchText.includes("inpaint") ||
    searchText.includes("controlnet")
  ) {
    capabilities.push("image-to-image");
  }

  if (
    searchText.includes("video") ||
    searchText.includes("animate") ||
    searchText.includes("motion")
  ) {
    if (searchText.includes("img2vid") || searchText.includes("image-to-video")) {
      capabilities.push("image-to-video");
    } else {
      capabilities.push("text-to-video");
    }
  }

  return capabilities;
}

/**
 * Map Replicate model to our normalized ProviderModel format
 */
function mapToProviderModel(model: ReplicateModel): ProviderModel {
  return {
    id: `${model.owner}/${model.name}`,
    name: model.name,
    description: model.description,
    provider: "replicate",
    capabilities: inferCapabilities(model),
    coverImage: model.cover_image_url,
  };
}

/**
 * Replicate provider implementation
 */
const replicateProvider: ProviderInterface = {
  id: "replicate",
  name: "Replicate",

  async listModels(): Promise<ProviderModel[]> {
    // This method is primarily for client-side use or testing
    // Real API calls should go through the API route
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      console.warn("[Replicate] No API key configured, cannot list models");
      return [];
    }

    try {
      const response = await fetch(`${REPLICATE_API_BASE}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status}`);
      }

      const data: ReplicateModelsResponse = await response.json();
      // Defensive null check - API may return different structure
      if (!data.results) {
        console.warn("[Replicate] List returned no results array");
        return [];
      }
      return data.results.map(mapToProviderModel);
    } catch (error) {
      console.error("[Replicate] Failed to list models:", error);
      return [];
    }
  },

  async searchModels(query: string): Promise<ProviderModel[]> {
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      console.warn("[Replicate] No API key configured, cannot search models");
      return [];
    }

    try {
      const response = await fetch(
        `${REPLICATE_API_BASE}/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Replicate API error: ${response.status}`);
      }

      const data: ReplicateSearchResponse = await response.json();
      // Defensive null check - search API may return different structure
      if (!data.results) {
        console.warn("[Replicate] Search returned no results array");
        return [];
      }
      return data.results.map((result) => mapToProviderModel(result.model));
    } catch (error) {
      console.error("[Replicate] Failed to search models:", error);
      return [];
    }
  },

  async getModel(modelId: string): Promise<ProviderModel | null> {
    const apiKey = getApiKeyFromStorage();
    if (!apiKey) {
      console.warn("[Replicate] No API key configured, cannot get model");
      return null;
    }

    // modelId format: "owner/name"
    const parts = modelId.split("/");
    if (parts.length !== 2) {
      console.error("[Replicate] Invalid model ID format:", modelId);
      return null;
    }

    const [owner, name] = parts;

    try {
      const response = await fetch(
        `${REPLICATE_API_BASE}/models/${owner}/${name}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Replicate API error: ${response.status}`);
      }

      const model: ReplicateModel = await response.json();
      return mapToProviderModel(model);
    } catch (error) {
      console.error("[Replicate] Failed to get model:", error);
      return null;
    }
  },

  async generate(input: GenerationInput): Promise<GenerationOutput> {
    const apiKey = input.model.provider === "replicate" ? getApiKeyFromStorage() : null;
    if (!apiKey) {
      return {
        success: false,
        error: "Replicate API key not configured",
      };
    }

    try {
      // Get the latest version of the model
      const modelId = input.model.id;
      const [owner, name] = modelId.split("/");

      // First, get the model to find the latest version
      const modelResponse = await fetch(
        `${REPLICATE_API_BASE}/models/${owner}/${name}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      if (!modelResponse.ok) {
        return {
          success: false,
          error: `Failed to get model info: ${modelResponse.status}`,
        };
      }

      const modelData: ReplicateModel = await modelResponse.json();
      const version = modelData.latest_version?.id;

      if (!version) {
        return {
          success: false,
          error: "Model has no available version",
        };
      }

      // Build input for the prediction
      // Most image models expect "prompt" as input
      const predictionInput: Record<string, unknown> = {
        prompt: input.prompt,
        ...input.parameters,
      };

      // Note: Image inputs are skipped for now (Phase 5 adds URL server)
      // input.images would need to be converted to URLs for Replicate

      // Create a prediction
      const createResponse = await fetch(`${REPLICATE_API_BASE}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version,
          input: predictionInput,
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        return {
          success: false,
          error: `Failed to create prediction: ${createResponse.status} - ${errorText}`,
        };
      }

      const prediction: ReplicatePrediction = await createResponse.json();

      // Poll for completion
      const maxWaitTime = 5 * 60 * 1000; // 5 minutes
      const pollInterval = 1000; // 1 second
      const startTime = Date.now();

      let currentPrediction = prediction;

      while (
        currentPrediction.status !== "succeeded" &&
        currentPrediction.status !== "failed" &&
        currentPrediction.status !== "canceled"
      ) {
        if (Date.now() - startTime > maxWaitTime) {
          return {
            success: false,
            error: "Prediction timed out after 5 minutes",
          };
        }

        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        const pollResponse = await fetch(
          `${REPLICATE_API_BASE}/predictions/${currentPrediction.id}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        if (!pollResponse.ok) {
          return {
            success: false,
            error: `Failed to poll prediction: ${pollResponse.status}`,
          };
        }

        currentPrediction = await pollResponse.json();
      }

      if (currentPrediction.status === "failed") {
        return {
          success: false,
          error: currentPrediction.error || "Prediction failed",
        };
      }

      if (currentPrediction.status === "canceled") {
        return {
          success: false,
          error: "Prediction was canceled",
        };
      }

      // Extract output image(s)
      const output = currentPrediction.output;
      if (!output) {
        return {
          success: false,
          error: "No output from prediction",
        };
      }

      // Output can be a single URL string or an array of URLs
      const outputUrls: string[] = Array.isArray(output) ? output : [output];

      if (outputUrls.length === 0) {
        return {
          success: false,
          error: "No output images from prediction",
        };
      }

      // Fetch the first output image and convert to base64
      const imageUrl = outputUrls[0];
      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        return {
          success: false,
          error: `Failed to fetch output image: ${imageResponse.status}`,
        };
      }

      const imageArrayBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

      // Determine MIME type from URL or response
      const contentType =
        imageResponse.headers.get("content-type") || "image/png";

      return {
        success: true,
        outputs: [
          {
            type: "image",
            data: `data:${contentType};base64,${imageBase64}`,
            url: imageUrl,
          },
        ],
      };
    } catch (error) {
      console.error("[Replicate] Generation failed:", error);
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
registerProvider(replicateProvider);

export default replicateProvider;
