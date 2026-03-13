'use client';

import { useState, useCallback } from 'react';
import {
  Input,
  Output,
  VideoSampleSink,
  VideoSampleSource,
  AudioBufferSource,
  BlobSource,
  ALL_FORMATS,
  BufferTarget,
  Mp4OutputFormat,
  getFirstEncodableAudioCodec,
  canEncodeVideo,
} from 'mediabunny';
import type { Rotation } from 'mediabunny';
import { createAvcEncodingConfig, AVC_LEVEL_4_0, AVC_LEVEL_5_1 } from '@/lib/video-encoding';
import {
  DEFAULT_BITRATE,
  MAX_OUTPUT_FPS,
  FALLBACK_WIDTH,
  FALLBACK_HEIGHT,
  BASELINE_PIXEL_LIMIT,
  ensureEvenDimension,
  probeVideoMetadata,
} from '@/lib/video-probing';

const determineEncodeParameters = async (
  blobs: Blob[]
): Promise<{ width: number; height: number; rotation: Rotation; maxSourceBitrate: number; totalDuration: number }> => {
  let maxWidth = 0;
  let maxHeight = 0;
  let maxSourceBitrate = 0;
  let totalDuration = 0;
  let rotation: Rotation | null = null;

  for (let i = 0; i < blobs.length; i++) {
    try {
      const { width, height, rotation: trackRotation, bitrate, duration } = await probeVideoMetadata(blobs[i]);
      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
      maxSourceBitrate = Math.max(maxSourceBitrate, bitrate);
      totalDuration += duration;
      if (rotation === null) {
        rotation = trackRotation;
      } else if (trackRotation !== rotation) {
        console.warn(
          `Rotation mismatch detected for video ${i + 1} (got ${trackRotation}, expected ${rotation}). Using the first rotation value.`
        );
      }
    } catch (error) {
      console.warn(`Failed to probe metadata for video ${i + 1}`, error);
    }
  }

  if (maxWidth <= 0 || maxHeight <= 0) {
    return {
      width: FALLBACK_WIDTH,
      height: FALLBACK_HEIGHT,
      rotation: rotation ?? (0 as Rotation),
      maxSourceBitrate,
      totalDuration,
    };
  }

  return {
    width: ensureEvenDimension(maxWidth),
    height: ensureEvenDimension(maxHeight),
    rotation: rotation ?? (0 as Rotation),
    maxSourceBitrate,
    totalDuration,
  };
};

export interface StitchProgress {
  status: 'idle' | 'processing' | 'complete' | 'error';
  message: string;
  progress: number; // 0-100
  currentVideo?: number; // Which video is being processed (1-indexed)
  totalVideos?: number;
  error?: string;
}

export interface AudioData {
  buffer: AudioBuffer;
  duration: number;
}

/**
 * Check if the device encoder supports AVC encoding
 */
export async function checkEncoderSupport(): Promise<boolean> {
  try {
    return await canEncodeVideo('avc', {
      width: 1920,
      height: 1080,
      bitrate: DEFAULT_BITRATE,
    });
  } catch {
    return false;
  }
}

/**
 * Trim an AudioBuffer to a target duration in seconds.
 * If the buffer is shorter than the target, returns it unchanged.
 */
function trimAudioBuffer(buffer: AudioBuffer, targetDuration: number): AudioBuffer {
  const targetSamples = Math.floor(targetDuration * buffer.sampleRate);

  if (targetSamples >= buffer.length) {
    return buffer;
  }

  const trimmed = new AudioBuffer({
    length: Math.max(1, targetSamples),
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    trimmed.getChannelData(ch).set(
      buffer.getChannelData(ch).subarray(0, targetSamples)
    );
  }

  return trimmed;
}

/**
 * Standalone async function to stitch multiple video blobs together sequentially
 */
export async function stitchVideosAsync(
  videoBlobs: Blob[],
  audioData?: AudioData | null,
  onProgress?: (progress: StitchProgress) => void
): Promise<Blob> {
  try {
    // Initialize progress
    const initialProgress: StitchProgress = {
      status: 'processing',
      message: 'Initializing stitching...',
      progress: 0,
      totalVideos: videoBlobs.length,
    };
    onProgress?.(initialProgress);

    if (videoBlobs.length === 0) {
      throw new Error('No videos to stitch');
    }

    // Helper to update progress
    const updateProgress = (
      status: StitchProgress['status'],
      message: string,
      progressValue: number,
      currentVideo?: number
    ) => {
      const p: StitchProgress = {
        status,
        message,
        progress: progressValue,
        currentVideo,
        totalVideos: videoBlobs.length,
      };
      onProgress?.(p);
    };

    updateProgress('processing', 'Analyzing video metadata...', 5);
    const {
      width: probedWidth,
      height: probedHeight,
      rotation: aggregateRotation,
      maxSourceBitrate,
      totalDuration: probedVideoDuration,
    } = await determineEncodeParameters(videoBlobs);

    const safeWidth = probedWidth > 0 ? probedWidth : FALLBACK_WIDTH;
    const safeHeight = probedHeight > 0 ? probedHeight : FALLBACK_HEIGHT;

    const codecProfile =
      safeWidth * safeHeight > BASELINE_PIXEL_LIMIT ? AVC_LEVEL_5_1 : AVC_LEVEL_4_0;

    // Use highest of default/source bitrate
    const candidateBitrate = Math.max(
      DEFAULT_BITRATE,
      Number.isFinite(maxSourceBitrate) && maxSourceBitrate > 0 ? maxSourceBitrate : 0
    );
    const resolvedBitrate = Math.max(1, Math.floor(candidateBitrate));

    const supportsConfig = await canEncodeVideo('avc', {
      width: safeWidth,
      height: safeHeight,
      bitrate: resolvedBitrate,
      fullCodecString: codecProfile,
    });

    if (!supportsConfig) {
      throw new Error(
        `Device encoder cannot output ${safeWidth}x${safeHeight} using profile ${codecProfile}. Reduce the resolution or bitrate and try again.`
      );
    }

    console.log('Stitch encoder configuration', {
      width: safeWidth,
      height: safeHeight,
      codecProfile,
      bitrate: resolvedBitrate,
      maxSourceBitrate,
      rotation: aggregateRotation,
    });

    // Create output
    updateProgress('processing', 'Creating output container...', 10);

    let videoSource: VideoSampleSource | null = new VideoSampleSource(
      createAvcEncodingConfig(resolvedBitrate, safeWidth, safeHeight, codecProfile)
    );

    const bufferTarget = new BufferTarget();
    let output: Output | null = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: bufferTarget,
    });

    output.addVideoTrack(videoSource, { rotation: aggregateRotation, frameRate: MAX_OUTPUT_FPS });

    // Add audio track if provided
    let audioSource: AudioBufferSource | null = null;
    let pendingAudioBuffer: AudioBuffer | null = null;
    let outputStarted = false;

    if (audioData) {
      updateProgress('processing', 'Detecting supported audio codec...', 8);

      // Detect the best supported audio codec for MP4
      // Try common codecs in order of preference: aac, mp3 (no opus - Twitter doesn't support it)
      const audioCodec = await getFirstEncodableAudioCodec(['aac', 'mp3'], {
        numberOfChannels: audioData.buffer.numberOfChannels,
        sampleRate: audioData.buffer.sampleRate,
        bitrate: 128000,
      });

      if (!audioCodec) {
        console.warn('[VideoStitch] No supported audio codec found, continuing without audio');
        updateProgress('processing', 'Warning: no supported audio codec — audio skipped', 10);
      } else {
        updateProgress('processing', `Adding audio track (${audioCodec})...`, 10);

        // Create audio source from the decoded audio buffer
        audioSource = new AudioBufferSource({
          codec: audioCodec,
          bitrate: 128000,
        });

        output.addAudioTrack(audioSource);
        pendingAudioBuffer = audioData.buffer;
      }
    }

    await output.start();
    outputStarted = true;

    try {
    // Feed audio early so the muxer can interleave audio packets with video frames.
    // Writing audio after all video causes broken interleaving (Discord won't play audio).
    if (audioSource && pendingAudioBuffer) {
      updateProgress('processing', 'Encoding audio track...', 12);
      const trimTarget = probedVideoDuration > 0 ? probedVideoDuration : audioData!.duration;
      const trimmedBuffer = trimAudioBuffer(pendingAudioBuffer, trimTarget);
      await audioSource.add(trimmedBuffer);
      await audioSource.close();
      audioSource = null;
      pendingAudioBuffer = null;
    }

    // Track the highest timestamp we've written to ensure monotonicity
    // Start at -frameInterval so first frame can be at timestamp 0
    const frameInterval = 1 / MAX_OUTPUT_FPS;
    let highestWrittenTimestamp = -frameInterval;

    // Process each video blob
    for (let videoIndex = 0; videoIndex < videoBlobs.length; videoIndex++) {
      const videoBlob = videoBlobs[videoIndex];
      const videoNumber = videoIndex + 1;

      updateProgress(
        'processing',
        `Processing video ${videoNumber}/${videoBlobs.length}...`,
        5 + (videoIndex / videoBlobs.length) * 90,
        videoNumber
      );

      // Create input for this video
      const blobSource = new BlobSource(videoBlob);
      const input = new Input({
        source: blobSource,
        formats: ALL_FORMATS,
      });

      try {
        const videoTracks = await input.getVideoTracks();
        if (videoTracks.length === 0) {
          console.warn(`No video tracks in video ${videoNumber}`);
          continue;
        }

        const videoTrack = videoTracks[0];
        const sink = new VideoSampleSink(videoTrack);

        // Get duration of this video
        const videoDuration = await input.computeDuration();

        // Track the base offset for this video segment
        const segmentBaseTime = highestWrittenTimestamp + frameInterval;
        // Track minimum timestamp in this segment to normalize
        let segmentMinTimestamp: number | null = null;

        // Read and write samples from this video
        let samplesFromThisVideo = 0;
        for await (const sample of sink.samples(0, videoDuration)) {
          const originalTimestamp = sample.timestamp ?? 0;

          // On first sample, record the minimum timestamp to normalize from
          if (segmentMinTimestamp === null) {
            segmentMinTimestamp = originalTimestamp;
          }

          // Normalize timestamp relative to segment start, then offset by base time
          const normalizedTimestamp = originalTimestamp - segmentMinTimestamp;
          const adjustedTimestamp = segmentBaseTime + normalizedTimestamp;

          // Snap to 60fps grid for consistent framerate
          const snappedTimestamp = Math.round(adjustedTimestamp / frameInterval) * frameInterval;

          // Skip duplicate frames that land on the same timestamp slot
          // This ensures strict 60fps without exceeding the target rate
          if (snappedTimestamp < highestWrittenTimestamp) {
            sample.close();
            continue;
          }

          sample.setTimestamp(snappedTimestamp);
          sample.setDuration(frameInterval);
          await videoSource!.add(sample);

          // Update highest written timestamp
          highestWrittenTimestamp = snappedTimestamp;

          sample.close();
          samplesFromThisVideo++;

          // Update progress
          if (samplesFromThisVideo % 10 === 0) {
            const videoProgress = samplesFromThisVideo / 300; // Rough estimate
            const overallProgress =
              5 + ((videoIndex + videoProgress) / videoBlobs.length) * 90;
            updateProgress(
              'processing',
              `Processing video ${videoNumber}/${videoBlobs.length}: ${samplesFromThisVideo} frames...`,
              overallProgress,
              videoNumber
            );
          }
        }
      } catch (videoError) {
        const errorMsg =
          videoError instanceof Error
            ? videoError.message
            : `Failed to process video ${videoNumber}`;
        console.error(`Error processing video ${videoNumber}:`, videoError);
        throw new Error(errorMsg);
      } finally {
        input.dispose();
      }
    }

    // Flush encoder before finalizing container
    await videoSource!.close();
    videoSource = null; // Already closed, prevent double-close in finally
    updateProgress('processing', 'Finalizing stitched video...', 97);

    // Finalize output
    await output!.finalize();
    outputStarted = false; // Successfully finalized
    output = null;
    const buffer = bufferTarget.buffer;

    if (!buffer) {
      throw new Error('Failed to generate output buffer');
    }

    const outputBlob = new Blob([buffer], { type: 'video/mp4' });

    updateProgress(
      'complete',
      `Successfully stitched ${videoBlobs.length} videos into ${(outputBlob.size / 1024 / 1024).toFixed(2)}MB file`,
      100
    );

    return outputBlob;
    } finally {
      // Clean up encoding resources on error
      pendingAudioBuffer = null;
      if (audioSource) {
        try {
          await audioSource.close();
        } catch (e) {
          console.warn('Failed to close audioSource:', e);
        }
      }
      if (videoSource) {
        try {
          await videoSource.close();
        } catch (e) {
          console.warn('Failed to close videoSource:', e);
        }
      }
      if (output && outputStarted) {
        try {
          await output.cancel();
        } catch (e) {
          console.warn('Failed to cancel output:', e);
        }
      }
    }
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    console.error('Video stitching error:', normalizedError);

    const errorProgress: StitchProgress = {
      status: 'error',
      message: `Error: ${normalizedError.message}`,
      progress: 0,
      error: normalizedError.message,
    };

    onProgress?.(errorProgress);

    throw normalizedError;
  }
}

interface UseStitchVideosReturn {
  stitchVideos: (
    videoBlobs: Blob[],
    audioData?: AudioData | null,
    onProgress?: (progress: StitchProgress) => void
  ) => Promise<Blob | null>;
  progress: StitchProgress;
  reset: () => void;
}

/**
 * Hook for stitching multiple video blobs together sequentially
 * Reads frames from each video and writes them to output in order
 */
export const useStitchVideos = (): UseStitchVideosReturn => {
  const [progress, setProgress] = useState<StitchProgress>({
    status: 'idle',
    message: 'Ready',
    progress: 0,
  });

  const stitchVideos = useCallback(
    async (
      videoBlobs: Blob[],
      audioData?: AudioData | null,
      onProgress?: (progress: StitchProgress) => void
    ): Promise<Blob | null> => {
      try {
        setProgress({
          status: 'processing',
          message: 'Initializing...',
          progress: 0,
        });

        const result = await stitchVideosAsync(videoBlobs, audioData, (p) => {
          setProgress(p);
          onProgress?.(p);
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Video stitching failed';
        setProgress({
          status: 'error',
          message: errorMessage,
          progress: 0,
          error: errorMessage,
        });
        return null;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress({
      status: 'idle',
      message: 'Ready',
      progress: 0,
    });
  }, []);

  return {
    stitchVideos,
    progress,
    reset,
  };
};
