import { describe, it, expect, vi, beforeEach } from "vitest";
import { applySpeedCurveAsync } from "../useApplySpeedCurve";

// Mock mediabunny with proper class constructors
const mockCanEncodeVideo = vi.fn();
const mockGetVideoTracks = vi.fn();
const mockDispose = vi.fn();
const mockOutputStart = vi.fn().mockResolvedValue(undefined);
const mockOutputFinalize = vi.fn().mockResolvedValue(undefined);
const mockVideoSourceAdd = vi.fn().mockResolvedValue(undefined);
const mockVideoSourceClose = vi.fn().mockResolvedValue(undefined);
const mockAddVideoTrack = vi.fn();
const mockBufferTargetBuffer = new ArrayBuffer(100);

vi.mock("mediabunny", () => {
  class BlobSourceMock { constructor() {} }
  class InputMock {
    getVideoTracks: any;
    computeDuration: any;
    dispose: any;
    constructor() {
      this.getVideoTracks = (...args: any[]) => mockGetVideoTracks(...args);
      this.computeDuration = vi.fn().mockResolvedValue(5.0);
      this.dispose = (...args: any[]) => mockDispose(...args);
    }
  }
  class OutputMock {
    addVideoTrack: any;
    start: any;
    finalize: any;
    constructor() {
      this.addVideoTrack = (...args: any[]) => mockAddVideoTrack(...args);
      this.start = (...args: any[]) => mockOutputStart(...args);
      this.finalize = (...args: any[]) => mockOutputFinalize(...args);
    }
  }
  class VideoSampleSinkMock {
    samplesAtTimestamps: any;
    constructor() {
      this.samplesAtTimestamps = vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          for (let i = 0; i < 5; i++) {
            yield {
              timestamp: i * 0.033,
              clone: vi.fn().mockReturnValue({
                setTimestamp: vi.fn(),
                setDuration: vi.fn(),
                close: vi.fn(),
              }),
              close: vi.fn(),
            };
          }
        },
      });
    }
  }
  class VideoSampleSourceMock {
    add: any;
    close: any;
    constructor() {
      this.add = (...args: any[]) => mockVideoSourceAdd(...args);
      this.close = (...args: any[]) => mockVideoSourceClose(...args);
    }
  }
  class BufferTargetMock {
    get buffer() { return mockBufferTargetBuffer; }
  }
  class Mp4OutputFormatMock { constructor() {} }

  return {
    BlobSource: BlobSourceMock,
    Input: InputMock,
    Output: OutputMock,
    VideoSampleSink: VideoSampleSinkMock,
    VideoSampleSource: VideoSampleSourceMock,
    BufferTarget: BufferTargetMock,
    Mp4OutputFormat: Mp4OutputFormatMock,
    ALL_FORMATS: [],
    canEncodeVideo: (...args: unknown[]) => mockCanEncodeVideo(...args),
  };
});

vi.mock("@/lib/video-encoding", () => ({
  createAvcEncodingConfig: vi.fn(() => ({})),
  AVC_LEVEL_4_0: "avc1.640028",
  AVC_LEVEL_5_1: "avc1.640033",
}));

// Mock document.createElement('video') for getVideoDimensions
const mockVideoElement = {
  preload: "",
  src: "",
  videoWidth: 1920,
  videoHeight: 1080,
  onloadedmetadata: null as (() => void) | null,
  onerror: null as (() => void) | null,
};

const origCreateElement = document.createElement.bind(document);

describe("useApplySpeedCurve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockCanEncodeVideo.mockResolvedValue(true);

    const mockVideoTrack = {
      displayWidth: 1920,
      displayHeight: 1080,
      codedWidth: 1920,
      codedHeight: 1080,
      rotation: 0,
      computeDuration: vi.fn().mockResolvedValue(5.0),
      computePacketStats: vi.fn().mockResolvedValue({
        averageBitrate: 8_000_000,
        averagePacketRate: 30,
      }),
    };
    mockGetVideoTracks.mockResolvedValue([mockVideoTrack]);

    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "video") {
        const video = { ...mockVideoElement };
        setTimeout(() => video.onloadedmetadata?.(), 0);
        return video as unknown as HTMLVideoElement;
      }
      return origCreateElement(tag);
    });

    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("returns null when no video tracks found", async () => {
    mockGetVideoTracks.mockResolvedValue([]);
    const result = await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(result).toBeNull();
  });

  it("reports progress milestones", async () => {
    const onProgress = vi.fn();
    await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }), 5, 1.5, onProgress);

    expect(onProgress).toHaveBeenCalled();
    const messages = onProgress.mock.calls.map((c: any[]) => c[0].message);
    expect(messages.some((m: string) => m.includes("Creating input"))).toBe(true);
  });

  it("accepts string easing function name", async () => {
    const result = await applySpeedCurveAsync(
      new Blob(["video"], { type: "video/mp4" }), 5, 1.5, undefined, "easeInOutCubic"
    );
    expect(result).toBeInstanceOf(Blob);
  });

  it("accepts function easing", async () => {
    const linear = (t: number) => t;
    const result = await applySpeedCurveAsync(
      new Blob(["video"], { type: "video/mp4" }), 5, 1.5, undefined, linear
    );
    expect(result).toBeInstanceOf(Blob);
  });

  it("uses default parameters", async () => {
    const result = await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(result).toBeInstanceOf(Blob);
  });

  it("returns video/mp4 Blob on success", async () => {
    const result = await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(result).toBeInstanceOf(Blob);
    expect(result!.type).toBe("video/mp4");
  });

  it("uses dimension fallback when getVideoDimensions fails", async () => {
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "video") {
        const video = { ...mockVideoElement };
        setTimeout(() => video.onerror?.(), 0);
        return video as unknown as HTMLVideoElement;
      }
      return origCreateElement(tag);
    });

    // Should still succeed with fallback dimensions (logged warning)
    const result = await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(result).toBeInstanceOf(Blob);
  });

  it("cascades through encoder tiers", async () => {
    mockCanEncodeVideo
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(result).toBeInstanceOf(Blob);
    expect(mockCanEncodeVideo.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns null and reports error when all tiers fail", async () => {
    mockCanEncodeVideo.mockResolvedValue(false);

    const onProgress = vi.fn();
    const result = await applySpeedCurveAsync(
      new Blob(["video"], { type: "video/mp4" }), 5, 1.5, onProgress
    );

    expect(result).toBeNull();
    const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(lastCall[0].status).toBe("error");
  });

  it("handles errors gracefully and returns null", async () => {
    mockGetVideoTracks.mockRejectedValue(new Error("Track error"));

    const result = await applySpeedCurveAsync(
      new Blob(["video"], { type: "video/mp4" }), 5, 1.5
    );
    expect(result).toBeNull();
  });

  it("disposes input even on error", async () => {
    // Make getVideoTracks succeed but then fail later
    const mockTrack = {
      displayWidth: 1920,
      displayHeight: 1080,
      codedWidth: 1920,
      codedHeight: 1080,
      rotation: 0,
      computeDuration: vi.fn().mockRejectedValue(new Error("fail")),
      computePacketStats: vi.fn().mockRejectedValue(new Error("fail")),
    };
    mockGetVideoTracks.mockResolvedValue([mockTrack]);
    mockCanEncodeVideo.mockResolvedValue(false);

    await applySpeedCurveAsync(new Blob(["video"], { type: "video/mp4" }));
    expect(mockDispose).toHaveBeenCalled();
  });

  it("accepts custom bitrate parameter", async () => {
    const result = await applySpeedCurveAsync(
      new Blob(["video"], { type: "video/mp4" }), 5, 1.5, undefined, "easeInOutSine", 16_000_000
    );
    expect(result).toBeInstanceOf(Blob);
  });
});
