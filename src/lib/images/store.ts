/**
 * In-Memory Image Store
 *
 * Temporary storage for images that need to be served via URL to external providers.
 * Images are stored in memory and served via /api/images/[id] endpoint.
 *
 * Features:
 * - Store base64 data URLs as binary buffers
 * - Retrieve images by unique ID
 * - Explicit cleanup (no TTL - callers handle lifecycle)
 *
 * Note: Store is cleared on server restart (no persistence).
 */

import { randomUUID } from "crypto";

/**
 * Stored image data with parsed content
 */
interface StoredImage {
  data: Buffer;
  mimeType: string;
}

/**
 * In-memory image storage
 */
const imageStore: Map<string, StoredImage> = new Map();

/**
 * Parse a base64 data URL into its components
 *
 * @param base64DataUrl - Data URL in format: data:{mimeType};base64,{data}
 * @returns Parsed mimeType and Buffer, or null if invalid format
 */
function parseBase64DataUrl(
  base64DataUrl: string
): { mimeType: string; data: Buffer } | null {
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const [, mimeType, base64Data] = match;
  const data = Buffer.from(base64Data, "base64");

  return { mimeType, data };
}

/**
 * Store an image and return its unique ID
 *
 * @param base64DataUrl - Image as base64 data URL (data:{mimeType};base64,{data})
 * @returns Unique ID for retrieving the image
 * @throws Error if data URL format is invalid
 */
export function storeImage(base64DataUrl: string): string {
  const parsed = parseBase64DataUrl(base64DataUrl);
  if (!parsed) {
    throw new Error(
      "Invalid base64 data URL format. Expected: data:{mimeType};base64,{data}"
    );
  }

  const id = randomUUID();
  imageStore.set(id, {
    data: parsed.data,
    mimeType: parsed.mimeType,
  });

  return id;
}

/**
 * Retrieve a stored image by ID
 *
 * @param id - Image ID returned from storeImage
 * @returns Image data and mimeType, or null if not found
 */
export function getImage(id: string): StoredImage | null {
  return imageStore.get(id) ?? null;
}

/**
 * Delete a stored image
 *
 * @param id - Image ID to delete
 * @returns true if image existed and was deleted, false if not found
 */
export function deleteImage(id: string): boolean {
  return imageStore.delete(id);
}

/**
 * Delete multiple stored images (for batch cleanup)
 *
 * @param ids - Array of image IDs to delete
 */
export function deleteImages(ids: string[]): void {
  for (const id of ids) {
    imageStore.delete(id);
  }
}

/**
 * Get store statistics (for debugging)
 */
export function getStoreStats(): { size: number; ids: string[] } {
  return {
    size: imageStore.size,
    ids: Array.from(imageStore.keys()),
  };
}
