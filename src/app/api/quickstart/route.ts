import { NextRequest, NextResponse } from "next/server";
import { openaiChatCompletionTokenParams } from "@/utils/openaiChatCompletionParams";
import { GoogleGenAI } from "@google/genai";
import { WorkflowFile } from "@/store/workflowStore";
import type { LLMModelType, LLMProvider } from "@/types";
import { ContentLevel, getPresetTemplate } from "@/lib/quickstart/templates";
import {
  buildQuickstartPrompt,
  buildQuickstartSystemInstruction,
} from "@/lib/quickstart/prompts";
import {
  validateWorkflowJSON,
  repairWorkflowJSON,
  parseJSONFromResponse,
} from "@/lib/quickstart/validation";
import { ImageInputNodeData } from "@/types";
import fs from "fs/promises";
import path from "path";

export const maxDuration = 60; // 1 minute timeout

const GOOGLE_MODEL_MAP: Record<string, string> = {
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-3-flash-preview": "gemini-3-flash-preview",
  "gemini-3-pro-preview": "gemini-3-pro-preview",
  "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4.1-nano": "gpt-4.1-nano",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-5.4-nano": "gpt-5.4-nano",
};

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "claude-sonnet-4.5": "claude-sonnet-4-5-20250929",
  "claude-haiku-4.5": "claude-haiku-4-5-20251001",
  "claude-opus-4.6": "claude-opus-4-6",
};

/**
 * Convert local image paths (e.g., /sample-images/model.jpg) to base64 data URLs
 */
async function convertLocalImagesToBase64(workflow: WorkflowFile): Promise<WorkflowFile> {
  const updatedNodes = await Promise.all(
    workflow.nodes.map(async (node) => {
      if (node.type === "imageInput") {
        const data = node.data as ImageInputNodeData;
        // Check if image is a local path (starts with /sample-images/)
        if (data.image && data.image.startsWith("/sample-images/")) {
          try {
            // Read file from public folder
            const publicPath = path.join(process.cwd(), "public", data.image);
            const fileBuffer = await fs.readFile(publicPath);
            const base64 = fileBuffer.toString("base64");

            // Determine MIME type from extension
            const ext = path.extname(data.image).toLowerCase();
            const mimeType = ext === ".png" ? "image/png"
              : ext === ".webp" ? "image/webp"
              : "image/jpeg";

            const dataUrl = `data:${mimeType};base64,${base64}`;

            return {
              ...node,
              data: {
                ...data,
                image: dataUrl,
              },
            };
          } catch (error) {
            console.error(`Failed to convert image to base64: ${data.image}`, error);
            // Return node unchanged if conversion fails
            return node;
          }
        }
      }
      return node;
    })
  );

  return {
    ...workflow,
    nodes: updatedNodes,
  };
}

interface QuickstartRequest {
  description: string;
  contentLevel: ContentLevel;
  templateId?: string;
  provider?: LLMProvider;
  model?: LLMModelType;
  systemInstructionExtra?: string;
}

interface QuickstartResponse {
  success: boolean;
  workflow?: WorkflowFile;
  error?: string;
}

async function generateQuickstartText({
  provider,
  model,
  prompt,
  systemInstruction,
  temperature,
  maxOutputTokens,
  requestId,
}: {
  provider: LLMProvider;
  model: LLMModelType;
  prompt: string;
  systemInstruction: string;
  temperature: number;
  maxOutputTokens: number;
  requestId: string;
}): Promise<string> {
  const startTime = Date.now();

  if (provider === "google") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY not configured. Add it to .env.local (or configure it in Settings)."
      );
    }

    const modelId = GOOGLE_MODEL_MAP[model] ?? null;
    if (!modelId) {
      throw new Error(`Unsupported Gemini model: ${model}`);
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: { temperature, maxOutputTokens, systemInstruction },
    });

    const responseText = response.text;
    if (!responseText) throw new Error("No response from Gemini API");

    console.log(
      `[Quickstart:${requestId}] Gemini response in ${Date.now() - startTime}ms`
    );
    return responseText;
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY not configured. Add it to .env.local (or configure it in Settings)."
      );
    }

    const modelId = OPENAI_MODEL_MAP[model] ?? null;
    if (!modelId) {
      throw new Error(`Unsupported OpenAI model: ${model}`);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        temperature,
        ...openaiChatCompletionTokenParams(modelId, maxOutputTokens),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) throw new Error("No response from OpenAI API");

    console.log(
      `[Quickstart:${requestId}] OpenAI response in ${Date.now() - startTime}ms`
    );
    return responseText;
  }

  // anthropic
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not configured. Add it to .env.local (or configure it in Settings)."
    );
  }

  const modelId = ANTHROPIC_MODEL_MAP[model] ?? null;
  if (!modelId) {
    throw new Error(`Unsupported Anthropic model: ${model}`);
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      system: systemInstruction,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      temperature,
      max_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const responseText = data.content?.[0]?.text;
  if (!responseText) throw new Error("No response from Anthropic API");

  console.log(
    `[Quickstart:${requestId}] Anthropic response in ${Date.now() - startTime}ms`
  );
  return responseText;
}

export async function POST(request: NextRequest) {
  const requestId = `qs-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[Quickstart:${requestId}] New request received`);

  try {
    const body: QuickstartRequest = await request.json();
    const { description, contentLevel, templateId, systemInstructionExtra } = body;
    const provider: LLMProvider = body.provider ?? "google";
    const model: LLMModelType = body.model ?? "gemini-3-flash-preview";

    console.log(`[Quickstart:${requestId}] Parameters:`, {
      hasDescription: !!description,
      descriptionLength: description?.length || 0,
      contentLevel,
      templateId,
      provider,
      model,
    });

    // If a preset template is selected, return it directly
    if (templateId) {
      console.log(`[Quickstart:${requestId}] Using preset template: ${templateId}`);
      try {
        const workflow = getPresetTemplate(templateId, contentLevel);
        // Convert any local image paths to base64 for the Gemini API
        const workflowWithBase64 = await convertLocalImagesToBase64(workflow);
        console.log(`[Quickstart:${requestId}] Preset template loaded successfully`);
        return NextResponse.json<QuickstartResponse>({
          success: true,
          workflow: workflowWithBase64,
        });
      } catch (error) {
        console.error(`[Quickstart:${requestId}] Preset template error:`, error);
        return NextResponse.json<QuickstartResponse>(
          {
            success: false,
            error: error instanceof Error ? error.message : "Failed to load template",
          },
          { status: 400 }
        );
      }
    }

    // Validate description
    if (!description || typeof description !== "string" || description.trim().length < 3) {
      console.warn(`[Quickstart:${requestId}] Invalid description`);
      return NextResponse.json<QuickstartResponse>(
        {
          success: false,
          error: "Please provide a description of your workflow (at least 3 characters)",
        },
        { status: 400 }
      );
    }

    // Build the prompt
    const prompt = buildQuickstartPrompt(description.trim(), contentLevel);
    console.log(`[Quickstart:${requestId}] Prompt built, length: ${prompt.length}`);

    const systemInstruction = [
      buildQuickstartSystemInstruction(),
      systemInstructionExtra ? `Additional system instructions:\n${systemInstructionExtra}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    console.log(
      `[Quickstart:${requestId}] Calling ${provider} (${model}) for workflow generation...`
    );

    const temperature = 0.3; // Lower for more consistent JSON output
    const maxOutputTokens = 16384; // For complex workflows with many nodes

    const responseText = await generateQuickstartText({
      provider,
      model,
      prompt,
      systemInstruction,
      temperature,
      maxOutputTokens,
      requestId,
    });

    console.log(`[Quickstart:${requestId}] Response text length: ${responseText.length}`);

    // Parse JSON from response
    let parsedWorkflow: unknown;
    try {
      parsedWorkflow = parseJSONFromResponse(responseText);
      console.log(`[Quickstart:${requestId}] JSON parsed successfully`);
    } catch (error) {
      console.error(`[Quickstart:${requestId}] JSON parse error:`, error);
      console.error(`[Quickstart:${requestId}] Response text:`, responseText.substring(0, 500));
      return NextResponse.json<QuickstartResponse>(
        {
          success: false,
          error: "Failed to parse workflow from AI response. Please try again.",
        },
        { status: 500 }
      );
    }

    // Validate the workflow
    const validation = validateWorkflowJSON(parsedWorkflow);
    console.log(`[Quickstart:${requestId}] Validation result:`, {
      valid: validation.valid,
      errorCount: validation.errors.length,
    });

    // Repair if needed
    let workflow: WorkflowFile;
    if (!validation.valid) {
      console.log(`[Quickstart:${requestId}] Repairing workflow...`);
      validation.errors.forEach((err) => {
        console.log(`[Quickstart:${requestId}] Validation error: ${err.path} - ${err.message}`);
      });
      workflow = repairWorkflowJSON(parsedWorkflow);
      console.log(`[Quickstart:${requestId}] Workflow repaired`);
    } else {
      workflow = parsedWorkflow as WorkflowFile;
    }

    // Ensure the workflow has an ID
    if (!workflow.id) {
      workflow.id = `wf_${Date.now()}_quickstart`;
    }

    console.log(`[Quickstart:${requestId}] Success - nodes: ${workflow.nodes.length}, edges: ${workflow.edges.length}`);

    return NextResponse.json<QuickstartResponse>({
      success: true,
      workflow,
    });
  } catch (error) {
    console.error(`[Quickstart:${requestId}] Unexpected error:`, error);

    // Handle rate limiting
    if (error instanceof Error && error.message.includes("429")) {
      return NextResponse.json<QuickstartResponse>(
        {
          success: false,
          error: "Rate limit reached. Please wait a moment and try again.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json<QuickstartResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate workflow",
      },
      { status: 500 }
    );
  }
}
