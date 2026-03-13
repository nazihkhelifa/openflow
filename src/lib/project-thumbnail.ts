import type { LocalProject } from "@/lib/local-db";
import { collectMediaItems } from "@/lib/media-collector";

export type ProjectThumbnail =
  | { url: string; type: "image" | "video" }
  | null;

function isLikelyVideo(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(lower);
}

/**
 * Get thumbnail for a project.
 * Priority: project.image > first image from nodes > first video from nodes > null
 */
export function getProjectThumbnail(project: LocalProject): ProjectThumbnail {
  if (project.image) {
    return {
      url: project.image,
      type: isLikelyVideo(project.image) ? "video" : "image",
    };
  }

  const nodes = project.content?.nodes;
  if (nodes && Array.isArray(nodes)) {
    const mediaItems = collectMediaItems(nodes);
    const firstImage = mediaItems.find((item) => item.type === "image");
    if (firstImage) return { url: firstImage.url, type: "image" };
    const firstVideo = mediaItems.find((item) => item.type === "video");
    if (firstVideo) return { url: firstVideo.url, type: "video" };
  }

  return null;
}
