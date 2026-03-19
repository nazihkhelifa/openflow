import type { Node } from "@xyflow/react";

function isDisplayableUrl(url: string): boolean {
  return url.startsWith("data:") || url.startsWith("http") || url.startsWith("blob:");
}

export interface MediaItem {
  url: string;
  type: "image" | "video";
  nodeId: string;
  originalImageUrl?: string;
}

/**
 * Collect all media items (images and videos) from workflow nodes
 */
export function collectMediaItems(nodes: Node[]): MediaItem[] {
  const mediaItems: MediaItem[] = [];

  nodes.forEach((node) => {
    const data = node.data as Record<string, unknown>;

    // ImageInputNode: image
    if (node.type === "imageInput") {
      const image = data.image as string | null | undefined;
      if (image && isDisplayableUrl(image)) {
        mediaItems.push({ url: image, type: "image", nodeId: node.id });
      }
    }

    // MediaInputNode: image, video
    if (node.type === "mediaInput") {
      const image = data.image as string | null | undefined;
      const videoFile = data.videoFile as string | null | undefined;
      if (image && isDisplayableUrl(image)) {
        mediaItems.push({ url: image, type: "image", nodeId: node.id });
      }
      if (videoFile && isDisplayableUrl(videoFile)) {
        mediaItems.push({ url: videoFile, type: "video", nodeId: node.id });
      }
    }

    // AnnotationNode: sourceImage or outputImage
    if (node.type === "annotation") {
      const img = (data.outputImage ?? data.sourceImage) as string | null | undefined;
      if (img && isDisplayableUrl(img)) {
        mediaItems.push({ url: img, type: "image", nodeId: node.id });
      }
    }

    // NanoBanana (GenerateImageNode): outputImage, inputImages (only actual URLs, not refs)
    if (node.type === "generateImage") {
      const outputImage = data.outputImage as string | null | undefined;
      if (outputImage && isDisplayableUrl(outputImage)) {
        mediaItems.push({ url: outputImage, type: "image", nodeId: node.id });
      }
      const inputImages = data.inputImages as string[] | undefined;
      if (Array.isArray(inputImages)) {
        inputImages.forEach((url) => {
          if (url && isDisplayableUrl(url)) mediaItems.push({ url, type: "image", nodeId: node.id });
        });
      }
    }

    // GenerateVideoNode: outputVideo
    if (node.type === "generateVideo") {
      const outputVideo = (data.outputVideo ?? data.outputVideoRef) as string | null | undefined;
      if (outputVideo && isDisplayableUrl(outputVideo)) {
        mediaItems.push({ url: outputVideo, type: "video", nodeId: node.id });
      }
    }

    // ImageCompareNode: imageA, imageB
    if (node.type === "imageCompare") {
      const imageA = data.imageA as string | null | undefined;
      const imageB = data.imageB as string | null | undefined;
      if (imageA && isDisplayableUrl(imageA)) mediaItems.push({ url: imageA, type: "image", nodeId: node.id });
      if (imageB && isDisplayableUrl(imageB)) mediaItems.push({ url: imageB, type: "image", nodeId: node.id });
    }

    // EaseCurveNode: outputVideo
    if (node.type === "easeCurve") {
      const outputVideo = data.outputVideo as string | null | undefined;
      if (outputVideo && isDisplayableUrl(outputVideo)) {
        mediaItems.push({ url: outputVideo, type: "video", nodeId: node.id });
      }
    }

    // VideoFrameGrabNode: outputImage
    if (node.type === "videoFrameGrab") {
      const outputImage = data.outputImage as string | null | undefined;
      if (outputImage && isDisplayableUrl(outputImage)) {
        mediaItems.push({ url: outputImage, type: "image", nodeId: node.id });
      }
    }

  });

  return mediaItems;
}
