/**
 * Model Caching Utility
 *
 * Simple in-memory cache for model lists from providers.
 * Reduces API calls to external providers by caching results with TTL.
 *
 * Features:
 * - 1-hour default TTL
 * - Per-provider cache keys
 * - Optional search query in cache key
 * - Manual invalidation support
 * - WaveSpeed schema caching (raw API schemas by model ID)
 *
 * Note: Cache is cleared on server restart (no persistence).
 */

import { ProviderModel } from "./types";
import { ProviderType } from "@/types";

/**
 * Cache entry with data and timestamp
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * WaveSpeed raw schema from API
 * Structure: { api_schemas: [{ request_schema: {...} }] }
 */
export interface WaveSpeedApiSchema {
  api_schemas?: Array<{
    request_schema?: Record<string, unknown>;
    response_schema?: Record<string, unknown>;
  }>;
}

/**
 * Default cache TTL: 1 hour
 */
const DEFAULT_TTL = 60 * 60 * 1000;

/**
 * In-memory cache storage for models
 */
const cache: Map<string, CacheEntry<ProviderModel[]>> = new Map();

/**
 * In-memory cache for WaveSpeed raw schemas (keyed by model_id)
 * This allows the schema endpoint to retrieve schemas without re-fetching all models
 */
const wavespeedSchemaCache: Map<string, CacheEntry<WaveSpeedApiSchema>> = new Map();

/**
 * Get cached models for a key if not expired
 *
 * @param key - Cache key (use getCacheKey to generate)
 * @param ttl - Optional custom TTL in milliseconds
 * @returns Cached models or null if not in cache or expired
 */
export function getCachedModels(
  key: string,
  ttl: number = DEFAULT_TTL
): ProviderModel[] | null {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > ttl) {
    // Cache expired, remove entry
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * Store models in cache with current timestamp
 *
 * @param key - Cache key (use getCacheKey to generate)
 * @param models - Models to cache
 */
export function setCachedModels(key: string, models: ProviderModel[]): void {
  cache.set(key, {
    data: models,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate cache entries
 *
 * @param key - Optional specific key to invalidate. If not provided, clears entire cache.
 */
export function invalidateCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * Generate a cache key for provider models
 *
 * @param provider - Provider type
 * @param search - Optional search query
 * @returns Cache key string
 *
 * @example
 * getCacheKey("replicate")           // "replicate:models"
 * getCacheKey("fal", "flux")         // "fal:search:flux"
 */
export function getCacheKey(provider: ProviderType, search?: string): string {
  if (search) {
    return `${provider}:search:${search}`;
  }
  return `${provider}:models`;
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// ============ WaveSpeed Schema Cache ============

/**
 * Get cached WaveSpeed schema for a model
 *
 * @param modelId - WaveSpeed model ID (e.g., "wavespeed-ai/flux-dev")
 * @param ttl - Optional custom TTL in milliseconds
 * @returns Cached schema or null if not in cache or expired
 */
export function getCachedWaveSpeedSchema(
  modelId: string,
  ttl: number = DEFAULT_TTL
): WaveSpeedApiSchema | null {
  const entry = wavespeedSchemaCache.get(modelId);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.timestamp > ttl) {
    wavespeedSchemaCache.delete(modelId);
    return null;
  }

  return entry.data;
}

/**
 * Store WaveSpeed schema in cache
 *
 * @param modelId - WaveSpeed model ID
 * @param schema - Raw API schema to cache
 */
export function setCachedWaveSpeedSchema(
  modelId: string,
  schema: WaveSpeedApiSchema
): void {
  wavespeedSchemaCache.set(modelId, {
    data: schema,
    timestamp: Date.now(),
  });
}

/**
 * Store multiple WaveSpeed schemas at once (efficient bulk operation)
 *
 * @param schemas - Map of model ID to schema
 */
export function setCachedWaveSpeedSchemas(
  schemas: Map<string, WaveSpeedApiSchema>
): void {
  const now = Date.now();
  for (const [modelId, schema] of schemas) {
    wavespeedSchemaCache.set(modelId, {
      data: schema,
      timestamp: now,
    });
  }
}

/**
 * Get WaveSpeed schema cache statistics (for debugging)
 */
export function getWaveSpeedSchemaCacheStats(): { size: number; modelIds: string[] } {
  return {
    size: wavespeedSchemaCache.size,
    modelIds: Array.from(wavespeedSchemaCache.keys()),
  };
}
