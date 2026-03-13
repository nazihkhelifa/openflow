import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to define mocks that work with hoisted vi.mock
const { mockGenerateVideos, mockGetVideosOperation, MockGoogleGenAI } = vi.hoisted(() => {
  const mockGenerateVideos = vi.fn();
  const mockGetVideosOperation = vi.fn();

  class MockGoogleGenAI {
    apiKey: string;
    models = {
      generateContent: vi.fn(),
      generateVideos: mockGenerateVideos,
    };
    operations = {
      getVideosOperation: mockGetVideosOperation,
    };

    constructor(config: { apiKey: string }) {
      this.apiKey = config.apiKey;
      MockGoogleGenAI.lastCalledWith = config;
    }

    static lastCalledWith: { apiKey: string } | null = null;
    static reset() {
      MockGoogleGenAI.lastCalledWith = null;
    }
  }

  return { mockGenerateVideos, mockGetVideosOperation, MockGoogleGenAI };
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: MockGoogleGenAI,
}));

// Mock global fetch for video download
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { generateWithGeminiVideo } from "../gemini";

describe("generateWithGeminiVideo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockGoogleGenAI.reset();
  });

  it("should generate a text-to-video successfully", async () => {
    // Mock generateVideos to return a completed operation immediately
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          {
            video: {
              uri: "https://generativelanguage.googleapis.com/v1/video?id=123",
            },
          },
        ],
      },
    });

    // Mock video download
    const videoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00]);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(videoBytes.buffer),
    });

    const result = await generateWithGeminiVideo(
      "test-001",
      "test-api-key",
      "veo-3.1/text-to-video",
      "A cat playing piano",
      [],
      { aspectRatio: "16:9", durationSeconds: "8" },
    );

    expect(result.success).toBe(true);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].type).toBe("video");
    expect(result.outputs![0].data).toMatch(/^data:video\/mp4;base64,/);

    // Verify generateVideos was called with correct model
    expect(mockGenerateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "veo-3.1-generate-preview",
        prompt: "A cat playing piano",
        config: expect.objectContaining({
          numberOfVideos: 1,
          aspectRatio: "16:9",
          durationSeconds: 8,
        }),
      })
    );
  });

  it("should poll until operation is done", async () => {
    // Use fake timers to avoid real 10s waits
    vi.useFakeTimers();

    // First call: not done
    mockGenerateVideos.mockResolvedValue({ done: false });

    // Second call (poll): done
    mockGetVideosOperation.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          {
            video: {
              uri: "https://generativelanguage.googleapis.com/v1/video?id=456",
            },
          },
        ],
      },
    });

    // Mock video download
    const videoBytes = new Uint8Array([0x00, 0x01]);
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(videoBytes.buffer),
    });

    // Start generation (will hit the polling loop)
    const resultPromise = generateWithGeminiVideo(
      "test-002",
      "test-api-key",
      "veo-3.1-fast/text-to-video",
      "A sunset timelapse",
      [],
      {},
    );

    // Advance timer past the poll interval
    await vi.advanceTimersByTimeAsync(10_000);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(mockGetVideosOperation).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("should handle image-to-video with base64 image input", async () => {
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          { video: { uri: "https://example.com/video?id=789" } },
        ],
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x01]).buffer),
    });

    const result = await generateWithGeminiVideo(
      "test-003",
      "test-api-key",
      "veo-3.1/image-to-video",
      "Animate this image",
      ["data:image/png;base64,iVBORw0KGgo="],
      {},
    );

    expect(result.success).toBe(true);

    // Verify image was passed in the request
    expect(mockGenerateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.objectContaining({
          imageBytes: "iVBORw0KGgo=",
          mimeType: "image/png",
        }),
      })
    );
  });

  it("should return error for unknown model", async () => {
    const result = await generateWithGeminiVideo(
      "test-004",
      "test-api-key",
      "unknown-model",
      "test prompt",
      [],
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown Veo model");
  });

  it("should return error when no videos are generated", async () => {
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [],
      },
    });

    const result = await generateWithGeminiVideo(
      "test-005",
      "test-api-key",
      "veo-3.1/text-to-video",
      "test prompt",
      [],
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("No video generated");
  });

  it("should return error when video download fails", async () => {
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          { video: { uri: "https://example.com/video?id=fail" } },
        ],
      },
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
    });

    const result = await generateWithGeminiVideo(
      "test-006",
      "test-api-key",
      "veo-3.1/text-to-video",
      "test prompt",
      [],
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to download generated video");
  });

  it("should map veo-3.1-fast models to correct API model ID", async () => {
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          { video: { uri: "https://example.com/video?id=fast" } },
        ],
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x01]).buffer),
    });

    await generateWithGeminiVideo(
      "test-007",
      "test-api-key",
      "veo-3.1-fast/image-to-video",
      "test",
      ["data:image/jpeg;base64,abc123"],
      {},
    );

    expect(mockGenerateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "veo-3.1-fast-generate-preview",
      })
    );
  });

  it("should pass seed and negativePrompt parameters", async () => {
    mockGenerateVideos.mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          { video: { uri: "https://example.com/video?id=params" } },
        ],
      },
    });

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([0x01]).buffer),
    });

    await generateWithGeminiVideo(
      "test-008",
      "test-api-key",
      "veo-3.1/text-to-video",
      "test",
      [],
      { seed: 42, negativePrompt: "blurry, low quality", resolution: "1080p" },
    );

    expect(mockGenerateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          seed: 42,
          negativePrompt: "blurry, low quality",
          resolution: "1080p",
        }),
      })
    );
  });
});
