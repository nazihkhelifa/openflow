import { Input, BlobSource, ALL_FORMATS } from 'mediabunny';
import type { Rotation } from 'mediabunny';

export const DEFAULT_BITRATE = 8_000_000; // 8 Mbps
export const MAX_OUTPUT_FPS = 60;
export const FALLBACK_WIDTH = 1920;
export const FALLBACK_HEIGHT = 1080;
export const BASELINE_PIXEL_LIMIT = 1920 * 1080;

export const ensureEvenDimension = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const even = value % 2 === 0 ? value : value - 1;
  return even > 0 ? even : 2;
};

export const normalizeRotation = (value: unknown): Rotation => {
  return value === 0 || value === 90 || value === 180 || value === 270 ? value : 0;
};

export interface VideoMetadata {
  width: number;
  height: number;
  rotation: Rotation;
  bitrate: number;
  duration: number;
}

export const probeVideoMetadata = async (blob: Blob): Promise<VideoMetadata> => {
  const source = new BlobSource(blob);
  const input = new Input({
    source,
    formats: ALL_FORMATS,
  });
  try {
    const videoTracks = await input.getVideoTracks();
    if (videoTracks.length === 0) {
      throw new Error('No video tracks found while probing dimensions.');
    }
    const track = videoTracks[0];
    const widthCandidate =
      (typeof track.displayWidth === 'number' && track.displayWidth > 0
        ? track.displayWidth
        : track.codedWidth) ?? FALLBACK_WIDTH;
    const heightCandidate =
      (typeof track.displayHeight === 'number' && track.displayHeight > 0
        ? track.displayHeight
        : track.codedHeight) ?? FALLBACK_HEIGHT;

    let bitrate = 0;
    try {
      const packetStats = await track.computePacketStats();
      if (packetStats?.averageBitrate && Number.isFinite(packetStats.averageBitrate)) {
        bitrate = packetStats.averageBitrate;
      }
    } catch (e) {
      console.warn('Failed to compute packet stats for bitrate', e);
    }

    let duration = 0;
    try {
      const d = await input.computeDuration();
      if (Number.isFinite(d) && d > 0) {
        duration = d;
      }
    } catch (e) {
      console.warn('Failed to compute duration', e);
    }

    return {
      width: ensureEvenDimension(widthCandidate),
      height: ensureEvenDimension(heightCandidate),
      rotation: normalizeRotation(track.rotation),
      bitrate,
      duration,
    };
  } finally {
    input.dispose();
  }
};
