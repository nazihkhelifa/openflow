/**
 * Utility functions for calculating node dimensions based on output aspect ratio.
 */

/**
 * Extract dimensions from a base64 data URL image.
 * @param base64DataUrl - The image as a base64 data URL (e.g., "data:image/png;base64,...")
 * @returns Promise resolving to {width, height} or null if extraction fails
 */
export function getImageDimensions(
  base64DataUrl: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!base64DataUrl || (!base64DataUrl.startsWith("data:image") && !base64DataUrl.startsWith("http"))) {
      resolve(null);
      return;
    }

    let resolved = false;
    const img = new Image();
    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
    const safeResolve = (value: { width: number; height: number } | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const timeout = setTimeout(() => safeResolve(null), 10_000);

    img.onload = () => {
      clearTimeout(timeout);
      safeResolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timeout);
      safeResolve(null);
    };
    img.src = base64DataUrl;
  });
}

/**
 * Extract dimensions from a video data URL or blob URL.
 * @param videoUrl - The video as a data URL or blob URL
 * @returns Promise resolving to {width, height} or null if extraction fails
 */
export function getVideoDimensions(
  videoUrl: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!videoUrl) {
      resolve(null);
      return;
    }

    let resolved = false;
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = "";
      video.load();
    };

    const safeResolve = (value: { width: number; height: number } | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(value);
    };

    const timeout = setTimeout(() => safeResolve(null), 10_000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      safeResolve({ width: video.videoWidth, height: video.videoHeight });
    };
    video.onerror = () => {
      clearTimeout(timeout);
      safeResolve(null);
    };
    video.src = videoUrl;
  });
}

/**
 * Detect media type from URL and return dimensions using the appropriate loader.
 * Handles data:image/*, data:video/*, blob:*, and http(s) URLs.
 */
export function getMediaDimensions(
  url: string | null | undefined
): Promise<{ width: number; height: number } | null> {
  if (!url) return Promise.resolve(null);

  if (url.startsWith("data:image")) {
    return getImageDimensions(url);
  }

  // data:video/* → always video
  if (url.startsWith("data:video")) {
    return getVideoDimensions(url);
  }

  // blob:* → treat as video (most common use case)
  if (url.startsWith("blob:")) {
    return getVideoDimensions(url);
  }

  // http(s) URLs → check pathname for image extensions before defaulting to video
  if (url.startsWith("http")) {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      if (/\.(jpe?g|png|gif|webp|bmp|svg|avif|ico)(\?|$)/.test(pathname)) {
        return getImageDimensions(url);
      }
    } catch {
      // Invalid URL, fall through to video
    }
    return getVideoDimensions(url);
  }

  return Promise.resolve(null);
}

/**
 * Calculate a node size that matches the given aspect ratio, preferring to grow.
 * No min/max clamping — the node sizes freely to fit the content.
 *
 * @param aspectRatio - content width / content height
 * @param currentWidth - the node's current width
 * @param currentHeight - the node's current height
 * @param fullBleed - if true, skip chrome height offset
 * @returns {width, height} that preserves the aspect ratio at the larger-area candidate
 */
export function calculateAspectFitSize(
  aspectRatio: number,
  currentWidth: number,
  currentHeight: number,
  fullBleed: boolean = false
): { width: number; height: number } {
  if (!aspectRatio || aspectRatio <= 0 || !isFinite(aspectRatio)) {
    return { width: currentWidth, height: currentHeight };
  }

  const chromeHeight = fullBleed ? 0 : NODE_CHROME_HEIGHT;

  // Candidate A: keep current width, adjust height
  const heightA = currentWidth / aspectRatio + chromeHeight;
  const areaA = currentWidth * heightA;

  // Candidate B: keep current height, adjust width
  const widthB = (currentHeight - chromeHeight) * aspectRatio;
  const areaB = widthB * currentHeight;

  if (areaA >= areaB) {
    return { width: Math.round(currentWidth), height: Math.round(heightA) };
  }
  return { width: Math.round(widthB), height: Math.round(currentHeight) };
}

// Node sizing constraints (match arty: 1:1 uses 9:16 width as reference)
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 600;
const BASE_HEIGHT = 500;
// 1:1 size = 9:16 width from baseHeight (same as arty upload/generate nodes)
export const SQUARE_SIZE = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, BASE_HEIGHT * (9 / 16)));

// Node chrome: header (~40px), controls/padding (~60px)
const NODE_CHROME_HEIGHT = 100;

/**
 * Calculate node dimensions that maintain aspect ratio within constraints.
 * @param aspectRatio - Width divided by height (e.g., 16/9 for landscape, 9/16 for portrait)
 * @param baseWidth - Starting width to calculate from (default 300px)
 * @returns {width, height} dimensions that fit within constraints
 */
export function calculateNodeSize(
  aspectRatio: number,
  baseWidth: number = 300
): { width: number; height: number } {
  // Handle invalid aspect ratios
  if (!aspectRatio || aspectRatio <= 0 || !isFinite(aspectRatio)) {
    return { width: 300, height: 300 }; // Return default square
  }

  // Start with base width and calculate content height
  let width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, baseWidth));

  // Calculate content area height based on aspect ratio
  // Content height = width / aspectRatio
  let contentHeight = width / aspectRatio;
  let totalHeight = contentHeight + NODE_CHROME_HEIGHT;

  // Check if height exceeds max - if so, scale down width to fit
  if (totalHeight > MAX_HEIGHT) {
    contentHeight = MAX_HEIGHT - NODE_CHROME_HEIGHT;
    width = contentHeight * aspectRatio;
    totalHeight = MAX_HEIGHT;
  }

  // Check if height is below min - if so, scale up width to fit
  if (totalHeight < MIN_HEIGHT) {
    contentHeight = MIN_HEIGHT - NODE_CHROME_HEIGHT;
    width = contentHeight * aspectRatio;
    totalHeight = MIN_HEIGHT;
  }

  // Clamp width to constraints
  if (width > MAX_WIDTH) {
    width = MAX_WIDTH;
    contentHeight = width / aspectRatio;
    totalHeight = contentHeight + NODE_CHROME_HEIGHT;
    // Re-clamp height
    totalHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, totalHeight));
  }

  if (width < MIN_WIDTH) {
    width = MIN_WIDTH;
    contentHeight = width / aspectRatio;
    totalHeight = contentHeight + NODE_CHROME_HEIGHT;
    // Re-clamp height
    totalHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, totalHeight));
  }

  return {
    width: Math.round(width),
    height: Math.round(totalHeight),
  };
}

/**
 * Calculate node dimensions while preserving the user's manually set height.
 * When a user manually resizes a node, we should maintain their height preference
 * and only adjust the width to match the new content's aspect ratio.
 *
 * @param aspectRatio - Width divided by height of the content
 * @param currentHeight - The node's current height (if manually set)
 * @param skipChromeOffset - If true, skip subtracting NODE_CHROME_HEIGHT (for full-bleed nodes with floating headers)
 * @returns {width, height} dimensions that preserve height when possible
 */
export function calculateNodeSizePreservingHeight(
  aspectRatio: number,
  currentHeight?: number,
  skipChromeOffset: boolean = false
): { width: number; height: number } {
  // Handle invalid aspect ratios
  if (!aspectRatio || aspectRatio <= 0 || !isFinite(aspectRatio)) {
    return { width: 300, height: 300 };
  }

  // No current height or below minimum = use default behavior
  if (!currentHeight || currentHeight < MIN_HEIGHT) {
    return skipChromeOffset ? calculateNodeSizeForFullBleed(aspectRatio) : calculateNodeSize(aspectRatio);
  }

  // Preserve height, calculate width to maintain aspect ratio
  const chromeHeight = skipChromeOffset ? 0 : NODE_CHROME_HEIGHT;
  const contentHeight = currentHeight - chromeHeight;
  let newWidth = contentHeight * aspectRatio;

  // Clamp width to constraints
  newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));

  return {
    width: Math.round(newWidth),
    height: Math.round(currentHeight),
  };
}

/**
 * Parse aspect ratio string (e.g. "16:9", "9:16", "1:1") to width/height number.
 * @param ratio - Aspect ratio string
 * @returns Width/height ratio, or 1 for invalid/unknown values
 */
export function parseAspectRatioString(ratio: string | null | undefined): number {
  if (!ratio || typeof ratio !== "string") return 1;
  const trimmed = ratio.trim();
  if (!trimmed) return 1;
  const lower = trimmed.toLowerCase();

  // Named presets used by some providers (e.g. square_hd, portrait_4_3, landscape_16_9)
  const presetMap: Record<string, number> = {
    square: 1,
    square_hd: 1,
    "1x1": 1,
    portrait_4_3: 3 / 4, // width:height (portrait = tall)
    portrait_16_9: 9 / 16,
    landscape_4_3: 4 / 3,
    landscape_16_9: 16 / 9,
  };

  // 1) Direct preset match or when preset appears inside a longer label
  for (const [key, value] of Object.entries(presetMap)) {
    if (lower === key || lower.includes(key)) {
      return value;
    }
  }

  // 2) Generic numeric pattern extraction, e.g. "4:3", "16x9", "portrait (4_3)"
  const numericMatch =
    lower.match(/(\d+)\s*[:/x]\s*(\d+)/) || // 4:3, 16/9, 16x9
    lower.match(/(\d+)\s*[_]\s*(\d+)/); // 4_3
  if (numericMatch) {
    const w = Number.parseFloat(numericMatch[1]);
    const h = Number.parseFloat(numericMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) {
      return w / h;
    }
  }

  // 3) Skip other special values like "match_input_image", "auto", "default"
  if (/^[a-zA-Z_]+$/.test(trimmed) || lower === "default") return 1;
  const parts = trimmed.split(":");
  if (parts.length !== 2) return 1;
  const w = Number.parseFloat(parts[0]);
  const h = Number.parseFloat(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return 1;
  return w / h;
}

/**
 * Calculate node dimensions for full-bleed content (no header chrome).
 * Uses arty-style sizing: 1:1 = square with side = 9:16 width from baseHeight.
 * All aspect ratios derive from this so Upload, Generate Image, Generate Video,
 * and all other image/video nodes have identical sizes for the same ratio.
 * Always uses the formula (no preserve-height) for consistency.
 *
 * @param aspectRatio - Width divided by height (e.g., 16/9 for landscape, 9/16 for portrait)
 * @param _currentHeight - Unused; kept for API compatibility
 * @returns {width, height} dimensions that fit within constraints
 */
export function calculateNodeSizeForFullBleed(
  aspectRatio: number,
  _currentHeight?: number
): { width: number; height: number } {
  if (!aspectRatio || aspectRatio <= 0 || !isFinite(aspectRatio)) {
    return { width: Math.round(SQUARE_SIZE), height: Math.round(SQUARE_SIZE) };
  }

  // Arty formula: 1:1 uses SQUARE_SIZE (9:16 width), other ratios derive from it
  let width: number;
  let height: number;

  if (Math.abs(aspectRatio - 1) < 0.001) {
    // 1:1
    width = SQUARE_SIZE;
    height = SQUARE_SIZE;
  } else if (aspectRatio > 1) {
    // Landscape: height = square, width = square * ar
    height = SQUARE_SIZE;
    width = SQUARE_SIZE * aspectRatio;
    width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));
    if (width !== SQUARE_SIZE * aspectRatio) {
      height = width / aspectRatio;
    }
  } else {
    // Portrait: width = square, height = square / ar
    width = SQUARE_SIZE;
    height = SQUARE_SIZE / aspectRatio;
    height = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height));
    if (height !== SQUARE_SIZE / aspectRatio) {
      width = height * aspectRatio;
    }
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}
