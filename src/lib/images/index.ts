/**
 * Image URL Utilities
 *
 * Functions for uploading images to the local server and generating
 * URLs that external providers can fetch from.
 *
 * Usage:
 * 1. Check if image should use URL: shouldUseImageUrl(base64DataUrl)
 * 2. Upload and get URL: const { url, id } = uploadImageForUrl(base64, baseUrl)
 * 3. Pass URL to provider
 * 4. Clean up after provider fetches: deleteImage(id)
 */

import { storeImage } from "./store";

// Re-export store functions for convenience
export {
  storeImage,
  getImage,
  deleteImage,
  deleteImages,
  getStoreStats,
} from "./store";

/**
 * Size threshold for using URL instead of base64 (256KB)
 * Replicate recommends URLs for files larger than this
 */
const URL_SIZE_THRESHOLD_BYTES = 256 * 1024;

/**
 * Upload an image to the local store and return its URL
 *
 * @param base64DataUrl - Image as base64 data URL
 * @param baseUrl - Server base URL (e.g., "http://localhost:3000")
 * @returns Object containing full URL and image ID for cleanup
 *
 * @example
 * const { url, id } = uploadImageForUrl(imageData, "http://localhost:3000");
 * // url: "http://localhost:3000/api/images/abc-123"
 * // Use URL with provider, then clean up:
 * deleteImage(id);
 */
export function uploadImageForUrl(
  base64DataUrl: string,
  baseUrl: string
): { url: string; id: string } {
  const id = storeImage(base64DataUrl);
  const url = `${baseUrl}/api/images/${id}`;

  return { url, id };
}

/**
 * Check if an image should use URL-based transfer instead of base64
 *
 * Returns true if the base64 data exceeds 256KB, which is Replicate's
 * recommended threshold for using URLs instead of data URIs.
 *
 * @param base64DataUrl - Image as base64 data URL
 * @returns true if image should use URL, false if base64 is fine
 *
 * @example
 * if (shouldUseImageUrl(imageData)) {
 *   const { url, id } = uploadImageForUrl(imageData, baseUrl);
 *   // use URL
 * } else {
 *   // use base64 directly
 * }
 */
export function shouldUseImageUrl(base64DataUrl: string): boolean {
  // Extract base64 data portion from data URL
  const match = base64DataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    // If not a valid data URL, default to using URL for safety
    return true;
  }

  const base64Data = match[1];
  // Base64 encoded data is ~33% larger than raw binary
  // Calculate approximate raw size: base64Length * 3/4
  const approximateByteSize = (base64Data.length * 3) / 4;

  return approximateByteSize > URL_SIZE_THRESHOLD_BYTES;
}
