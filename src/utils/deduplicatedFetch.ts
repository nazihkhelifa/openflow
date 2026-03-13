/**
 * Deduplicated fetch utility.
 *
 * When multiple callers request the same URL concurrently, this utility
 * ensures only one actual network request is made. All callers receive
 * the same response data once the request completes.
 *
 * This is useful for components that mount multiple instances (e.g., nodes)
 * and all need to fetch the same models list - instead of N requests,
 * only 1 request is made.
 */

// Map of URL -> in-flight promise
const inFlightRequests = new Map<string, Promise<Response>>();

// Map of URL -> cloned response metadata (since Response body can only be read once)
const responseCache = new Map<string, { status: number; headers: Record<string, string>; bodyText: string; timestamp: number }>();

// Cache TTL in milliseconds (5 seconds - short enough to get fresh data, long enough to dedupe)
const CACHE_TTL = 5000;

// Map of cacheKey -> pending cleanup timeout IDs (for clearFetchCache cleanup)
const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Generate a cache key from URL and headers
 */
function getCacheKey(url: string, headers?: HeadersInit): string {
  if (!headers) return url;

  // Sort header keys for consistent key generation
  const headerObj = headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : Array.isArray(headers)
      ? Object.fromEntries(headers)
      : headers;

  const sortedHeaders = Object.keys(headerObj)
    .sort()
    .map((k) => `${k}:${headerObj[k]}`)
    .join("|");

  return `${url}|${sortedHeaders}`;
}

/**
 * Fetch with request deduplication.
 *
 * Multiple concurrent calls to the same URL (with same headers) will
 * share a single network request. The response is cloned for each caller.
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (headers, etc.)
 * @returns Promise resolving to the fetch Response
 */
export async function deduplicatedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const cacheKey = getCacheKey(url, options?.headers);

  // Check if we have a recent cached response
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    // Return a synthetic response with the cached metadata
    return new Response(cached.bodyText, {
      status: cached.status,
      headers: cached.headers,
    });
  }

  // Check if there's already an in-flight request for this URL
  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    // Wait for the existing request and clone it for this caller
    await existingRequest;
    // The response body may have been consumed, so we rely on the cache
    const cachedData = responseCache.get(cacheKey);
    if (cachedData) {
      return new Response(cachedData.bodyText, {
        status: cachedData.status,
        headers: cachedData.headers,
      });
    }
    // Fallback: this shouldn't happen, but return an error response
    return new Response(JSON.stringify({ error: "Cache miss" }), {
      status: 500,
    });
  }

  // Create new request
  const requestPromise = fetch(url, options)
    .then(async (response) => {
      // Clone and cache the full response metadata before returning
      try {
        const bodyText = await response.clone().text();
        responseCache.set(cacheKey, {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          bodyText,
          timestamp: Date.now(),
        });
      } catch {
        // Failed to read response body for caching
      }
      return response;
    })
    .finally(() => {
      // Clean up in-flight request after a short delay
      // (allows concurrent calls that started just after to still benefit)
      const timeoutId = setTimeout(() => {
        inFlightRequests.delete(cacheKey);
        pendingTimeouts.delete(cacheKey);
      }, 50);
      pendingTimeouts.set(cacheKey, timeoutId);
    });

  // Store the in-flight request
  inFlightRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Clear all cached responses.
 * Useful for testing or when settings change.
 */
export function clearFetchCache(): void {
  responseCache.clear();
  inFlightRequests.clear();
  for (const timeoutId of pendingTimeouts.values()) {
    clearTimeout(timeoutId);
  }
  pendingTimeouts.clear();
}
