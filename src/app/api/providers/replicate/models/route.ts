import { NextRequest, NextResponse } from "next/server";
import { ProviderModel, ModelCapability } from "@/lib/providers";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

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

interface ModelsSuccessResponse {
  success: true;
  models: ProviderModel[];
}

interface ModelsErrorResponse {
  success: false;
  error: string;
}

type ModelsResponse = ModelsSuccessResponse | ModelsErrorResponse;

/**
 * GET /api/providers/replicate/models
 *
 * Fetches available models from Replicate API.
 * Requires API key in X-API-Key header or api_key query param.
 *
 * Query params:
 *   - search: Optional search query to filter models
 *   - api_key: Alternative to X-API-Key header
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ModelsResponse>> {
  // Get API key from header or query param
  const apiKey =
    request.headers.get("X-API-Key") ||
    request.nextUrl.searchParams.get("api_key");

  if (!apiKey) {
    return NextResponse.json<ModelsErrorResponse>(
      {
        success: false,
        error: "API key required. Provide X-API-Key header or api_key query param.",
      },
      { status: 401 }
    );
  }

  const searchQuery = request.nextUrl.searchParams.get("search");

  try {
    let url: string;
    let isSearchRequest = false;

    if (searchQuery) {
      url = `${REPLICATE_API_BASE}/search?query=${encodeURIComponent(searchQuery)}`;
      isSearchRequest = true;
    } else {
      url = `${REPLICATE_API_BASE}/models`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json<ModelsErrorResponse>(
          {
            success: false,
            error: "Invalid API key",
          },
          { status: 401 }
        );
      }

      return NextResponse.json<ModelsErrorResponse>(
        {
          success: false,
          error: `Replicate API error: ${response.status}`,
        },
        { status: response.status }
      );
    }

    let models: ProviderModel[];

    if (isSearchRequest) {
      const data: ReplicateSearchResponse = await response.json();
      // Defensive null check - search API may return different structure
      if (!data.results) {
        return NextResponse.json<ModelsSuccessResponse>({
          success: true,
          models: [],
        });
      }
      models = data.results.map((result) => mapToProviderModel(result.model));
    } else {
      const data: ReplicateModelsResponse = await response.json();
      // Defensive null check for list endpoint as well
      if (!data.results) {
        return NextResponse.json<ModelsSuccessResponse>({
          success: true,
          models: [],
        });
      }
      models = data.results.map(mapToProviderModel);
    }

    return NextResponse.json<ModelsSuccessResponse>({
      success: true,
      models,
    });
  } catch (error) {
    return NextResponse.json<ModelsErrorResponse>(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch models from Replicate",
      },
      { status: 500 }
    );
  }
}
