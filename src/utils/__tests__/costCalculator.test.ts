import { describe, it, expect } from "vitest";
import { hasNonGeminiProviders } from "@/utils/costCalculator";
import { WorkflowNode } from "@/types";

describe("hasNonGeminiProviders", () => {
  it("should return false for empty nodes array", () => {
    expect(hasNonGeminiProviders([])).toBe(false);
  });

  it("should return false for non-generation nodes only", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "prompt",
        position: { x: 0, y: 0 },
        data: { prompt: "test" },
      },
      {
        id: "2",
        type: "imageInput",
        position: { x: 0, y: 0 },
        data: {},
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(false);
  });

  it("should return false for nanoBanana node with no selectedModel (legacy Gemini)", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: { model: "nano-banana", resolution: "1K" },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(false);
  });

  it("should return false for nanoBanana node with gemini selectedModel", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana-pro",
          resolution: "1K",
          selectedModel: {
            provider: "gemini",
            modelId: "nano-banana-pro",
            displayName: "Nano Banana Pro",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(false);
  });

  it("should return true for nanoBanana node with fal provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "fal",
            modelId: "fal-ai/flux",
            displayName: "Flux",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return true for nanoBanana node with replicate provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "replicate",
            modelId: "some-model",
            displayName: "Some Model",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return true for nanoBanana node with kie provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "kie",
            modelId: "kie-model",
            displayName: "Kie Model",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return true for nanoBanana node with wavespeed provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "wavespeed",
            modelId: "ws-model",
            displayName: "WaveSpeed Model",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return true for generateVideo node with non-Gemini provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "generateVideo",
        position: { x: 0, y: 0 },
        data: {
          selectedModel: {
            provider: "kie",
            modelId: "kling-video",
            displayName: "Kling Video",
          },
          status: "idle",
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return false for generateVideo node with no selectedModel", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "generateVideo",
        position: { x: 0, y: 0 },
        data: { status: "idle" },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(false);
  });

  it("should return true for generate3d node with non-Gemini provider", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "generate3d",
        position: { x: 0, y: 0 },
        data: {
          selectedModel: {
            provider: "fal",
            modelId: "fal-3d",
            displayName: "Fal 3D",
          },
          status: "idle",
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });

  it("should return false for generate3d node with no selectedModel", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "generate3d",
        position: { x: 0, y: 0 },
        data: { status: "idle" },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(false);
  });

  it("should return true when mixed Gemini and non-Gemini nodes exist", () => {
    const nodes: WorkflowNode[] = [
      {
        id: "1",
        type: "nanoBanana",
        position: { x: 0, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "gemini",
            modelId: "nano-banana",
            displayName: "Nano Banana",
          },
        },
      },
      {
        id: "2",
        type: "nanoBanana",
        position: { x: 100, y: 0 },
        data: {
          model: "nano-banana",
          resolution: "1K",
          selectedModel: {
            provider: "fal",
            modelId: "fal-ai/flux",
            displayName: "Flux",
          },
        },
      },
    ];
    expect(hasNonGeminiProviders(nodes)).toBe(true);
  });
});
