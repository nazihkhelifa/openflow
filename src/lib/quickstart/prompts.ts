import { ContentLevel } from "./templates";

/**
 * System prompt used by /api/quickstart to reliably generate valid Openflows workflows.
 * It includes the current node types and what each one does.
 */
export function buildQuickstartSystemInstruction(): string {
  return `You are generating an Openflows workflow JSON.

CRITICAL:
- OUTPUT MUST BE ONLY VALID JSON (no markdown, no explanations).
- nodes[].type MUST be one of the supported node types:
  mediaInput, imageInput, audioInput, annotation, prompt, generateImage, generateVideo, generate3d, generateAudio, imageCompare, easeCurve, router, switch, conditionalSwitch, glbViewer
- Do NOT use legacy node types like "nanoBanana" or "output".
- Every edge must use allowed handle types: "image", "text", "audio", "video", "easeCurve", "3d", and the special "reference".
- Handle matching rule (except "reference"): connect image→image, text→text, audio→audio, video→video, 3d→3d, easeCurve→easeCurve.

Node capabilities (high-level):
- mediaInput: provides media output (image/audio/video/3d depending on mode); can accept "reference" in image mode.
- prompt: outputs "text".
- annotation: image-editing step; image → image.
- generateImage: image + text → image.
- generateVideo: image + text → video.
- generate3d: image + text → 3d (and typically an image preview).
- generateAudio: text → audio.
- imageCompare: image + image → image.
- easeCurve: curve-related routing; uses video and outputs/consumes "easeCurve".
- router/switch/conditionalSwitch: routing nodes; use "text" inputs to decide which outputs should be connected.
- glbViewer: visualizes "3d" and can provide an image preview.

GRAPH GUIDELINES:
- Lay out nodes left-to-right (increasing x).
- Use customTitle on every node to describe its role.
`;
}

/**
 * Build a comprehensive prompt for Gemini to generate a workflow
 */
export function buildQuickstartPrompt(
  description: string,
  contentLevel: ContentLevel
): string {
  const timestamp = Date.now();

  return `You are a workflow designer for Openflows, a visual node-based AI image generation tool. Your task is to create a workflow JSON based on the user's description.

## CRITICAL: OUTPUT FORMAT
You MUST output ONLY valid JSON. No explanations, no markdown, no code blocks. Just the raw JSON object starting with { and ending with }.

## CRITICAL: NODE TYPES (CURRENT)
Only use node.type values that are supported by the editor:
mediaInput, imageInput, audioInput, annotation, prompt, generateImage, generateVideo, generate3d, generateAudio, imageCompare, easeCurve, router, switch, conditionalSwitch, glbViewer
Do NOT use legacy node types like "nanoBanana" or "output".

## Available Node Types

### 1. imageInput
Purpose: Load/display input images from user
- Outputs: "image" handle (green, right side of node)
- Data structure:
  {
    "image": null,
    "filename": null,
    "dimensions": null,
    "customTitle": "Descriptive name for this input"
  }

### 2. prompt
Purpose: Text prompts that feed into generation or LLM nodes
- Outputs: "text" handle (blue, right side of node)
- Data structure:
  {
    "prompt": "${contentLevel === "empty" ? "" : contentLevel === "minimal" ? "Enter your prompt here..." : "Your detailed prompt text"}",
    "customTitle": "Descriptive name for this prompt"
  }

### 3. annotation
Purpose: Draw/annotate on images before generation. Only use this if the user asks for annotation capability.
- Inputs: "image" handle (left side)
- Outputs: "image" handle (right side)
- Data structure:
  {
    "sourceImage": null,
    "annotations": [],
    "outputImage": null,
    "customTitle": "Annotation step"
  }

### 4. nanoBanana
Purpose: AI image generation using Gemini (REQUIRES both image AND text inputs). This is the primary node for image generation.
- Inputs: "image" handle (accepts multiple connections), "text" handle (required)
- Outputs: "image" handle
- IMPORTANT: Always use "nano-banana-pro" model with "2K" resolution by default unless the user specifically requests otherwise.
- Data structure:
  {
    "inputImages": [],
    "inputPrompt": null,
    "outputImage": null,
    "aspectRatio": "1:1",
    "resolution": "2K",
    "model": "nano-banana-pro",
    "useGoogleSearch": false,
    "status": "idle",
    "error": null,
    "imageHistory": [],
    "selectedHistoryIndex": 0,
    "customTitle": "Generation step name"
  }

### 5. output
Purpose: Display final generated images (optional - not required)
- Inputs: "image" handle (left side)
- Data structure:
  {
    "image": null,
    "customTitle": "Final output"
  }

## EDGES/CONNECTIONS - CRITICAL SECTION

Edges connect nodes together. Every edge MUST have these fields:

\`\`\`json
{
  "id": "edge-{sourceNodeId}-{targetNodeId}-{sourceHandle}-{targetHandle}",
  "source": "{sourceNodeId}",
  "sourceHandle": "{handleType}",
  "target": "{targetNodeId}",
  "targetHandle": "{handleType}"
}
\`\`\`

### Connection Rules
1. **Type matching is mandatory**:
   - "image" handles connect ONLY to "image" handles
   - "text" handles connect ONLY to "text" handles
2. **Direction**: Data flows from source (output, right side) → target (input, left side)
3. **nanoBanana nodes REQUIRE TWO incoming edges**:
   - One edge bringing "image" data
   - One edge bringing "text" data
4. **Multiple image inputs**: nanoBanana can receive multiple image edges (for multi-image context)

### Edge Examples

**Connecting imageInput to nanoBanana (image → image):**
\`\`\`json
{
  "id": "edge-imageInput-1-nanoBanana-1-image-image",
  "source": "imageInput-1",
  "sourceHandle": "image",
  "target": "nanoBanana-1",
  "targetHandle": "image"
}
\`\`\`

**Connecting prompt to nanoBanana (text → text):**
\`\`\`json
{
  "id": "edge-prompt-1-nanoBanana-1-text-text",
  "source": "prompt-1",
  "sourceHandle": "text",
  "target": "nanoBanana-1",
  "targetHandle": "text"
}
\`\`\`

**Chaining nanoBanana to nanoBanana (image → image):**
\`\`\`json
{
  "id": "edge-nanoBanana-1-nanoBanana-2-image-image",
  "source": "nanoBanana-1",
  "sourceHandle": "image",
  "target": "nanoBanana-2",
  "targetHandle": "image"
}
\`\`\`

**Connecting prompt to nanoBanana (or prompt → prompt for LLM expansion, then to nanoBanana):**
\`\`\`json
{
  "id": "edge-prompt-1-nanoBanana-1-text-text",
  "source": "prompt-1",
  "sourceHandle": "text",
  "target": "nanoBanana-1",
  "targetHandle": "text"
}
\`\`\`

**Connecting imageInput to nanoBanana within a workflow (imageInput + prompt → nanoBanana):**
\`\`\`json
{
  "id": "edge-imageInput-10-nanoBanana-10-image-image",
  "source": "imageInput-10",
  "sourceHandle": "image",
  "target": "nanoBanana-10",
  "targetHandle": "image"
},
{
  "id": "edge-prompt-10-nanoBanana-10-text-text",
  "source": "prompt-10",
  "sourceHandle": "text",
  "target": "nanoBanana-10",
  "targetHandle": "text"
}
\`\`\`

## Node Layout Guidelines
- Start input nodes on the left (x: 50-150)
- Flow left to right, increasing x position
- Horizontal spacing: ~350-400px between columns
- Vertical spacing: ~300-330px between rows
- Prompt nodes should be positioned near the generation node they feed into
- Use these dimensions:
  - imageInput: { width: 300, height: 280 }
  - annotation: { width: 300, height: 280 }
  - prompt: { width: 329, height: 371 }
  - nanoBanana: { width: 300, height: 300 }
  - output: { width: 320, height: 320 }

## Groups (Optional - for organizing complex workflows)

Groups visually organize related nodes. Include if the workflow has 4+ nodes:

\`\`\`json
"groups": {
  "group-1": {
    "id": "group-1",
    "name": "Input Images",
    "color": "blue",
    "position": { "x": 30, "y": 80 },
    "size": { "width": 360, "height": 600 }
  }
}
\`\`\`

Nodes reference their group via \`"groupId": "group-1"\`.
Available colors: "neutral", "blue", "green", "purple", "orange"

## Node ID Format
Use format: "{type}-{number}" starting from 1
Examples: "imageInput-1", "imageInput-2", "prompt-1", "nanoBanana-1"

## Content Level: ${contentLevel.toUpperCase()}
${contentLevel === "empty" ? "- Leave ALL prompt fields completely empty (empty string)" : ""}
${contentLevel === "minimal" ? '- Add brief placeholder prompts like "Describe your scene here..." or "Enter style instructions..."' : ""}
${contentLevel === "full" ? "- Add complete, detailed example prompts that demonstrate the workflow's purpose" : ""}

## COMPLETE EXAMPLE WORKFLOW

Here is an example of a "Background Swap" workflow that combines a character with a new background:

\`\`\`json
{
  "version": 1,
  "id": "wf_${timestamp}_quickstart",
  "name": "Background Swap",
  "nodes": [
    {
      "id": "imageInput-1",
      "type": "imageInput",
      "position": { "x": 50, "y": 100 },
      "data": {
        "image": null,
        "filename": null,
        "dimensions": null,
        "customTitle": "Character"
      },
      "style": { "width": 300, "height": 280 }
    },
    {
      "id": "imageInput-2",
      "type": "imageInput",
      "position": { "x": 50, "y": 420 },
      "data": {
        "image": null,
        "filename": null,
        "dimensions": null,
        "customTitle": "New Background"
      },
      "style": { "width": 300, "height": 280 }
    },
    {
      "id": "prompt-1",
      "type": "prompt",
      "position": { "x": 400, "y": 100 },
      "data": {
        "prompt": "Place the character from the first image into the background scene from the second image. Match the lighting and color grading so it looks like a natural photograph. Preserve all details of the character's appearance.",
        "customTitle": "Combine Instructions"
      },
      "style": { "width": 320, "height": 220 }
    },
    {
      "id": "nanoBanana-1",
      "type": "generateImage",
      "position": { "x": 780, "y": 200 },
      "data": {
        "inputImages": [],
        "inputPrompt": null,
        "outputImage": null,
        "aspectRatio": "1:1",
        "resolution": "2K",
        "model": "nano-banana-pro",
        "useGoogleSearch": false,
        "status": "idle",
        "error": null,
        "imageHistory": [],
        "selectedHistoryIndex": 0,
        "customTitle": "Generate Composite"
      },
      "style": { "width": 300, "height": 300 }
    }
  ],
  "edges": [
    {
      "id": "edge-imageInput-1-nanoBanana-1-image-image",
      "source": "imageInput-1",
      "sourceHandle": "image",
      "target": "nanoBanana-1",
      "targetHandle": "image"
    },
    {
      "id": "edge-imageInput-2-nanoBanana-1-image-image",
      "source": "imageInput-2",
      "sourceHandle": "image",
      "target": "nanoBanana-1",
      "targetHandle": "image"
    },
    {
      "id": "edge-prompt-1-nanoBanana-1-text-text",
      "source": "prompt-1",
      "sourceHandle": "text",
      "target": "nanoBanana-1",
      "targetHandle": "text"
    }
  ],
  "edgeStyle": "curved"
}
\`\`\`

Notice how:
- Every nanoBanana has BOTH image edge(s) AND a text edge connected to it
- Edge IDs follow the pattern exactly: "edge-{source}-{target}-{sourceHandle}-{targetHandle}"
- Nodes are laid out left-to-right with proper spacing
- customTitle makes each node's purpose clear

## User's Request
"${description}"

## CHECKLIST BEFORE OUTPUT
1. ✓ Every nanoBanana node has at least one "image" edge AND one "text" edge targeting it
2. ✓ All edge IDs follow the format: "edge-{source}-{target}-{sourceHandle}-{targetHandle}"
3. ✓ Handle types match: image→image, text→text, reference→reference
4. ✓ Nodes have customTitle fields describing their purpose
5. ✓ Layout flows left-to-right with proper spacing

Generate a practical, well-organized workflow for: "${description}"

OUTPUT ONLY THE JSON:`;
}

/**
 * Build a simpler prompt for quick generation
 */
export function buildSimplePrompt(description: string): string {
  return `Create a Openflows workflow JSON for: "${description}"

Node types: imageInput (output: image), prompt (output: text, can run LLM generation), nanoBanana (inputs: image+text, output: image), annotation (input: image, output: image), output (input: image).

Rules:
- nanoBanana NEEDS both image and text inputs - create edges for BOTH
- image handles connect to image, text to text
- Node IDs: type-number (e.g., imageInput-1)
- Edge IDs: edge-source-target-sourceHandle-targetHandle
- Every edge needs: id, source, sourceHandle, target, targetHandle

Return ONLY valid JSON with: version:1, name, nodes[], edges[], edgeStyle:"curved"`;
}
