import { NextRequest, NextResponse } from "next/server";
import { ProviderModel, ModelCapability } from "@/lib/providers";

const FAL_API_BASE = "https://api.fal.ai/v1";

/**
 * Categories we care about for image/video generation
 */
const RELEVANT_CATEGORIES = [
  "text-to-image",
  "image-to-image",
  "text-to-video",
  "image-to-video",
];

/**
 * Response schema from fal.ai models endpoint
 */
interface FalModelsResponse {
  models: FalModel[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Model schema from fal.ai API
 */
interface FalModel {
  endpoint_id: string;
  metadata: {
    display_name: string;
    category: string;
    description: string;
    status: "active" | "deprecated";
    tags: string[];
    updated_at: string;
    is_favorited: boolean | null;
    thumbnail_url: string;
    model_url: string;
    date: string;
    highlighted: boolean;
    pinned: boolean;
    thumbnail_animated_url?: string;
    github_url?: string;
    license_type?: "commercial" | "research" | "private";
  };
  openapi?: Record<string, unknown>;
}

/**
 * Map fal.ai category to ModelCapability
 */
function mapCategoryToCapability(category: string): ModelCapability | null {
  if (RELEVANT_CATEGORIES.includes(category)) {
    return category as ModelCapability;
  }
  return null;
}

/**
 * Check if a model has a relevant category
 */
function isRelevantModel(model: FalModel): boolean {
  return RELEVANT_CATEGORIES.includes(model.metadata.category);
}

/**
 * Map fal.ai model to our normalized ProviderModel format
 */
function mapToProviderModel(model: FalModel): ProviderModel {
  const capability = mapCategoryToCapability(model.metadata.category);

  return {
    id: model.endpoint_id,
    name: model.metadata.display_name,
    description: model.metadata.description,
    provider: "fal",
    capabilities: capability ? [capability] : [],
    coverImage: model.metadata.thumbnail_url,
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
 * GET /api/providers/fal/models
 *
 * Fetches available models from fal.ai API.
 * API key is optional - fal.ai works without but with rate limits.
 *
 * Headers:
 *   - X-API-Key: API key for authentication (recommended)
 *   - Authorization: Alternative auth header
 *
 * Query params:
 *   - search: Optional search query to filter models
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ModelsResponse>> {
  // Get API key from header or env (never from query params to avoid credential leakage)
  const apiKey =
    request.headers.get("X-API-Key") ||
    request.headers.get("Authorization")?.replace(/^Key\s+/i, "") ||
    process.env.FAL_API_KEY;

  if (!apiKey) {
    return NextResponse.json<ModelsErrorResponse>(
      {
        success: false,
        error: "fal.ai API key not configured. Add FAL_API_KEY to .env.local or configure in Settings.",
      },
      { status: 401 }
    );
  }

  const searchQuery = request.nextUrl.searchParams.get("search");

  try {
    // Build URL - fetch all active models, filter client-side
    // Note: fal.ai API only accepts single category param, so we fetch all and filter
    let url = `${FAL_API_BASE}/models?status=active`;

    if (searchQuery) {
      url += `&q=${encodeURIComponent(searchQuery)}`;
    }

    // Build headers with optional auth
    const headers: HeadersInit = {};
    if (apiKey) {
      headers["Authorization"] = `Key ${apiKey}`;
    }

    const response = await fetch(url, { headers });

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
          error: `fal.ai API error: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data: FalModelsResponse = await response.json();

    // Filter to relevant categories and map to ProviderModel
    const models = data.models.filter(isRelevantModel).map(mapToProviderModel);

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
            : "Failed to fetch models from fal.ai",
      },
      { status: 500 }
    );
  }
}
