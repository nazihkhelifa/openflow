import { useEffect, useRef, useState } from "react";

/**
 * Converts data URL video sources to blob URLs for efficient playback.
 *
 * Data URLs force Chrome to re-parse base64 on each access. With autoPlay loop,
 * this happens continuously and can freeze the main thread on weak GPUs.
 * Blob URLs back the same data with an in-memory Blob that Chrome's media
 * pipeline handles natively.
 *
 * - If input is null, returns null
 * - If input is already a blob URL or HTTP URL, returns it as-is
 * - If input is a data URL, immediately returns it as fallback, then swaps
 *   to a blob URL once conversion completes (~50ms)
 * - Revokes previous blob URLs on input change and unmount
 */
export function useVideoBlobUrl(videoUrl: string | null): string | null {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const prevBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Revoke previous blob URL
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = null;
    }

    // Null input
    if (!videoUrl) {
      setBlobUrl(null);
      return;
    }

    // Already a blob URL or HTTP URL — pass through
    if (videoUrl.startsWith("blob:") || videoUrl.startsWith("http")) {
      setBlobUrl(videoUrl);
      return;
    }

    // Data URL — return it immediately as fallback, then convert async
    if (videoUrl.startsWith("data:")) {
      setBlobUrl(videoUrl);

      let cancelled = false;
      let createdUrl: string | null = null;
      fetch(videoUrl)
        .then((r) => r.blob())
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          createdUrl = url;
          prevBlobUrlRef.current = url;
          setBlobUrl(url);
        })
        .catch(() => {
          // Conversion failed — keep using the data URL fallback
        });

      return () => {
        cancelled = true;
        // If a blob URL was created after we decided to cancel, revoke it
        if (createdUrl && createdUrl !== prevBlobUrlRef.current) {
          URL.revokeObjectURL(createdUrl);
        }
      };
    }

    // Unknown format — pass through
    setBlobUrl(videoUrl);
  }, [videoUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = null;
      }
    };
  }, []);

  return blobUrl;
}
