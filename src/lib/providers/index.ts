/**
 * Provider Registry and Factory
 *
 * Central registry for AI provider implementations. Providers register themselves
 * when their modules are imported, enabling dynamic provider discovery.
 *
 * Usage:
 *   import { getProvider, getConfiguredProviders } from "@/lib/providers";
 *
 *   // Get a specific provider
 *   const replicate = getProvider("replicate");
 *
 *   // Get all providers with API keys configured
 *   const available = getConfiguredProviders();
 *
 * Phase 2 Implementation Notes:
 * - Replicate and fal.ai provider implementations will register themselves here
 * - Gemini remains special-cased in existing generate route for now
 * - Each provider module calls registerProvider() on import
 */

import { ProviderType } from "@/types";
import { ProviderInterface, ProviderModel } from "./types";

// Re-export all types for convenient imports
export * from "./types";

// Re-export cache utilities for convenient imports
export * from "./cache";

/**
 * Provider registry - populated by provider implementations when they are imported.
 * Initially empty; providers call registerProvider() to add themselves.
 *
 * Phase 2 will add:
 * - ReplicateProvider (registers as "replicate")
 * - FalProvider (registers as "fal")
 *
 * Note: Gemini provider is currently implemented directly in /api/generate route.
 * It may be migrated to this abstraction in a future phase.
 */
const providerRegistry: Partial<Record<ProviderType, ProviderInterface>> = {};

/**
 * Register a provider implementation in the registry.
 * Called by provider modules when they are imported.
 *
 * @param provider - The provider implementation to register
 *
 * @example
 * // In src/lib/providers/replicate.ts:
 * import { registerProvider, ProviderInterface } from "@/lib/providers";
 *
 * const replicateProvider: ProviderInterface = { ... };
 * registerProvider(replicateProvider);
 */
export function registerProvider(provider: ProviderInterface): void {
  providerRegistry[provider.id] = provider;
}

/**
 * Get a provider by its type identifier.
 *
 * @param id - The provider type (e.g., "replicate", "fal")
 * @returns The provider implementation or undefined if not registered
 */
export function getProvider(id: ProviderType): ProviderInterface | undefined {
  return providerRegistry[id];
}

/**
 * Get all providers that have API keys configured.
 * Useful for showing available options in the UI.
 *
 * @returns Array of configured provider implementations
 */
export function getConfiguredProviders(): ProviderInterface[] {
  return Object.values(providerRegistry).filter(
    (p): p is ProviderInterface => p !== undefined && p.isConfigured()
  );
}

/**
 * Get all registered providers regardless of configuration status.
 * Useful for settings UI where users can configure API keys.
 *
 * @returns Array of all registered provider implementations
 */
export function getAllProviders(): ProviderInterface[] {
  return Object.values(providerRegistry).filter(
    (p): p is ProviderInterface => p !== undefined
  );
}

// ============ Multi-Provider Helpers ============

/**
 * API keys object for multi-provider operations.
 * Keys are provider IDs, values are API keys.
 */
export interface ApiKeys {
  replicate?: string;
  fal?: string;
  gemini?: string;
  wavespeed?: string;
}

/**
 * List models from all registered providers.
 *
 * Note: This function calls provider.listModels() which may use localStorage
 * for API keys (client-side only). For server-side usage, use the API routes
 * at /api/models or /api/providers/[provider]/models instead.
 *
 * @param _apiKeys - API keys object (currently unused, reserved for future use)
 * @returns Combined array of models from all registered providers
 *
 * @example
 * // Client-side usage (providers get keys from localStorage)
 * const models = await listAllModels({});
 */
export async function listAllModels(
  _apiKeys: ApiKeys = {}
): Promise<ProviderModel[]> {
  const providers = getAllProviders();
  const results = await Promise.allSettled(
    providers.map((p) => p.listModels())
  );

  const allModels: ProviderModel[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allModels.push(...result.value);
    }
  }

  // Sort by provider, then by name
  allModels.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.name.localeCompare(b.name);
  });

  return allModels;
}

/**
 * Search for models across all registered providers.
 *
 * Note: This function calls provider.searchModels() which may use localStorage
 * for API keys (client-side only). For server-side usage, use the API routes
 * at /api/models?search=query or /api/providers/[provider]/models?search=query.
 *
 * @param query - Search query string
 * @param _apiKeys - API keys object (currently unused, reserved for future use)
 * @returns Combined array of matching models from all registered providers
 *
 * @example
 * // Client-side usage (providers get keys from localStorage)
 * const models = await searchAllModels("flux", {});
 */
export async function searchAllModels(
  query: string,
  _apiKeys: ApiKeys = {}
): Promise<ProviderModel[]> {
  const providers = getAllProviders();
  const results = await Promise.allSettled(
    providers.map((p) => p.searchModels(query))
  );

  const allModels: ProviderModel[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allModels.push(...result.value);
    }
  }

  // Sort by provider, then by name
  allModels.sort((a, b) => {
    if (a.provider !== b.provider) {
      return a.provider.localeCompare(b.provider);
    }
    return a.name.localeCompare(b.name);
  });

  return allModels;
}

// ============ Provider Auto-Registration ============

/**
 * Provider modules self-register when imported:
 *
 *   import "@/lib/providers/replicate";  // Registers Replicate provider
 *   import "@/lib/providers/fal";        // Registers fal.ai provider
 *
 * The unified API route at /api/models handles fetching directly without
 * needing to import provider modules (to avoid client-side localStorage
 * dependencies on the server).
 */
