import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateWithReplicate } from "../replicate";
import type { GenerationInput } from "@/lib/providers/types";

/**
 * Tests for prompt passthrough when dynamicInputs are present.
 *
 * Bug: When a generate node has both a prompt AND image input connected,
 * the dynamicInputs code path processes images but never reads input.prompt,
 * causing "prompt is required" errors from the Replicate API.
 */

// Captured request bodies from fetch calls
let capturedPredictionBody: Record<string, unknown> | null = null;

function makeInput(overrides: Partial<GenerationInput> = {}): GenerationInput {
  return {
    model: {
      id: "owner/test-model",
      name: "Test Model",
      description: null,
      provider: "replicate",
      capabilities: ["text-to-image"],
    },
    prompt: "a photo of a cat",
    images: [],
    parameters: {},
    ...overrides,
  };
}

/**
 * Create a mock fetch that intercepts Replicate API calls.
 * - Model info: returns schema with prompt + image_input properties
 * - Prediction creation: captures body, returns succeeded
 * - Media fetch: returns fake image
 */
function createMockFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    // Model info request
    if (urlStr.includes("/models/owner/test-model") && !urlStr.includes("/predictions")) {
      return new Response(
        JSON.stringify({
          latest_version: {
            id: "abc123",
            openapi_schema: {
              components: {
                schemas: {
                  Input: {
                    properties: {
                      prompt: { type: "string", description: "Text prompt" },
                      image_input: { type: "string", description: "Input image URL" },
                    },
                  },
                },
              },
            },
          },
        }),
        { status: 200 }
      );
    }

    // Prediction creation
    if (urlStr.includes("/predictions") && init?.method === "POST") {
      const body = JSON.parse(init.body as string);
      capturedPredictionBody = body.input;
      return new Response(
        JSON.stringify({
          id: "pred-123",
          status: "succeeded",
          output: ["https://replicate.delivery/test/image.png"],
        }),
        { status: 201 }
      );
    }

    // Media fetch (output image)
    if (urlStr.includes("replicate.delivery")) {
      return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }

    return new Response("Not Found", { status: 404 });
  });
}

describe("Replicate prompt passthrough with dynamicInputs", () => {
  let mockFetch: ReturnType<typeof createMockFetch>;

  beforeEach(() => {
    capturedPredictionBody = null;
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes prompt when dynamicInputs has image_input but no prompt", async () => {
    const input = makeInput({
      prompt: "a photo of a cat",
      dynamicInputs: {
        image_input: "https://cdn.example.com/img.png",
      },
    });

    await generateWithReplicate("test-req", "test-api-key", input);

    expect(capturedPredictionBody).not.toBeNull();
    expect(capturedPredictionBody!.prompt).toBe("a photo of a cat");
    expect(capturedPredictionBody!.image_input).toBe("https://cdn.example.com/img.png");
  });

  it("does not duplicate prompt when dynamicInputs already contains prompt", async () => {
    const input = makeInput({
      prompt: "a cat",
      dynamicInputs: {
        prompt: "a dog",
        image_input: "https://cdn.example.com/img.png",
      },
    });

    await generateWithReplicate("test-req", "test-api-key", input);

    expect(capturedPredictionBody).not.toBeNull();
    // dynamicInputs value wins - not overwritten by input.prompt
    expect(capturedPredictionBody!.prompt).toBe("a dog");
  });

  it("works without dynamicInputs (existing behavior)", async () => {
    const input = makeInput({
      prompt: "a cat",
      dynamicInputs: undefined,
    });

    await generateWithReplicate("test-req", "test-api-key", input);

    expect(capturedPredictionBody).not.toBeNull();
    expect(capturedPredictionBody!.prompt).toBe("a cat");
  });
});
