# Product Requirements Document
## Node-Based Image Annotation & Generation Workflow

**Version:** 1.0  
**Last Updated:** December 2025  
**Status:** Draft

---

## 1. Overview

### 1.1 Product Summary

A web-based, node-based workflow application for creating annotated images and generating AI images using Nano Banana Pro (Google Gemini 3 Pro Image). Users connect nodes on a canvas to build image generation pipelines, annotate images in a full-screen editor, and chain multiple generation steps together.

### 1.2 Problem Statement

Current AI image generation tools are either:
- **Too simple**: Single prompt → single output, no iteration control
- **Too complex**: ComfyUI-style interfaces with steep learning curves

Users need a middle ground: visual workflow building with intuitive annotation tools that allows iterative, chained generation without technical complexity.

### 1.3 Target Users

- Designers exploring AI-assisted image creation
- Content creators iterating on visual concepts
- Developers prototyping generative image workflows
- Anyone experimenting with Nano Banana Pro's image editing capabilities

### 1.4 Success Criteria

- User can build a workflow from image input to generated output in under 2 minutes
- User can chain 3+ generation steps in a single workflow
- Annotations correctly flatten and pass to Nano Banana Pro API
- Generated images can feed back into subsequent workflow nodes

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript |
| Node Editor | @xyflow/react (React Flow v12) |
| Canvas/Drawing | react-konva (Konva.js) |
| State Management | Zustand |
| Styling | Tailwind CSS |
| AI Integration | Google AI Studio API (@google/genai) |
| Deployment | Vercel |

---

## 3. Core Features

### 3.1 Node Graph Canvas

**Description:** An infinite canvas where users place and connect nodes to build workflows.

**Requirements:**

| ID | Requirement | Priority |
|----|-------------|----------|
| NG-01 | Display an off-white canvas with subtle grid background | Must |
| NG-02 | Support pan (drag) and zoom (scroll/pinch) | Must |
| NG-03 | Drag nodes from a sidebar or floating bar onto canvas | Must |
| NG-04 | Connect nodes via edges by dragging from output handle to input handle | Must |
| NG-05 | Delete nodes and edges (keyboard shortcut + context menu) | Must |
| NG-06 | Validate connections (only compatible types can connect) | Must |
| NG-07 | Visual feedback when workflow is running (node highlighting) | Must |

**Node Connection Rules:**

```
Image Input Node    → [image output]
Annotation Node     → [image input] [image output]  
Prompt Node         → [text output]
Nano Banana Node    → [image input] [prompt input] [image output]
Output Node         → [image input]
```

---

### 3.2 Node Types

#### 3.2.1 Image Input Node

**Purpose:** Load an image into the workflow.

| ID | Requirement | Priority |
|----|-------------|----------|
| IN-01 | Accept image upload via file picker (PNG, JPG, WebP) | Must |
| IN-02 | Accept image via drag-and-drop onto node | Must |
| IN-03 | Display thumbnail preview of loaded image | Must |
| IN-04 | Show filename and dimensions | Should |
| IN-05 | Output: base64 image data | Must |

**UI:** 
- Dashed border drop zone when empty
- Thumbnail with remove button when populated

---

#### 3.2.2 Annotation Node

**Purpose:** Open a full-screen annotation editor to draw on an image.

| ID | Requirement | Priority |
|----|-------------|----------|
| AN-01 | Accept image input from connected node | Must |
| AN-02 | Display thumbnail of current annotated state | Must |
| AN-03 | "Edit" button opens full-screen annotation modal | Must |
| AN-04 | Output: flattened image (original + annotations as single image) | Must |
| AN-05 | Preserve annotations when modal is closed and reopened | Must |

**Annotation Modal Requirements:** See Section 3.3

---

#### 3.2.3 Prompt Node

**Purpose:** Define text instructions for image generation.

| ID | Requirement | Priority |
|----|-------------|----------|
| PR-01 | Multi-line text input field | Must |
| PR-02 | Character count display | Should |
| PR-03 | Placeholder text with example prompt | Should |
| PR-04 | Output: prompt text string | Must |

**UI:**
- Expandable text area within node
- Minimum 3 lines visible, expandable to 10

---

#### 3.2.4 Nano Banana Node

**Purpose:** Send image + prompt to Nano Banana Pro API and receive generated image.

| ID | Requirement | Priority |
|----|-------------|----------|
| NB-01 | Accept image input (required) | Must |
| NB-02 | Accept prompt input (required) | Must |
| NB-03 | "Generate" button for manual trigger (when not in workflow run) | Should |
| NB-04 | Display generation status (idle/loading/complete/error) | Must |
| NB-05 | Show thumbnail of generated result | Must |
| NB-06 | Output: generated image as base64 | Must |
| NB-07 | Display error messages from API failures | Must |
| NB-08 | Aspect ratio selector (1:1, 16:9, 9:16, 4:3, 3:4) | Should |
| NB-09 | Resolution selector (1K, 2K) | Should |

**UI:**
- Two input handles (image, prompt) on left
- One output handle on right
- Status indicator (spinner when loading)
- Thumbnail preview area

---

#### 3.2.5 Output Node

**Purpose:** Display final generated image and allow sending to other nodes.

| ID | Requirement | Priority |
|----|-------------|----------|
| OUT-01 | Accept image input | Must |
| OUT-02 | Display full preview of image (larger than other nodes) | Must |
| OUT-03 | "Download" button to save image locally | Must |
| OUT-04 | "Send to Node" action to pass image to another node's input | Must |
| OUT-05 | Click to view full-size in lightbox/modal | Should |

**"Send to Node" Flow:**
1. User clicks "Send to Node" on Output Node
2. User clicks on target node (Annotation Node or Nano Banana Node)
3. Image is connected/passed to that node's image input
4. Visual confirmation of transfer

---

### 3.3 Annotation Modal (Full-Screen Editor)

**Description:** A full-screen overlay for annotating images with drawing tools.

#### 3.3.1 Canvas

| ID | Requirement | Priority |
|----|-------------|----------|
| AM-01 | Display source image as background layer | Must |
| AM-02 | Annotation layer on top (separate from background) | Must |
| AM-03 | Pan and zoom canvas | Must |
| AM-04 | Fit-to-screen on open | Must |
| AM-05 | Zoom controls (buttons + scroll) | Must |

#### 3.3.2 Drawing Tools

| ID | Requirement | Priority |
|----|-------------|----------|
| DT-01 | **Rectangle tool**: Click-drag to draw rectangles | Must |
| DT-02 | **Circle/Ellipse tool**: Click-drag to draw circles | Must |
| DT-03 | **Arrow tool**: Click-drag to draw arrows | Must |
| DT-04 | **Freehand/Brush tool**: Draw freeform strokes | Must |
| DT-05 | **Text tool**: Click to place text, type to edit | Must |
| DT-06 | **Select tool**: Click to select shapes, drag to move | Must |
| DT-07 | Delete selected shape (Delete/Backspace key) | Must |

#### 3.3.3 Tool Options

| ID | Requirement | Priority |
|----|-------------|----------|
| TO-01 | Color picker for stroke/fill | Must |
| TO-02 | Stroke width selector (thin/medium/thick) | Must |
| TO-03 | Fill toggle (filled vs outline only) for shapes | Should |
| TO-04 | Font size selector for text tool | Must |
| TO-05 | Opacity slider | Should |

#### 3.3.4 Modal Actions

| ID | Requirement | Priority |
|----|-------------|----------|
| MA-01 | "Done" button: Flatten and save, close modal | Must |
| MA-02 | "Cancel" button: Discard changes, close modal | Must |
| MA-03 | "Clear All" button: Remove all annotations | Must |
| MA-04 | Undo/Redo (Ctrl+Z / Ctrl+Shift+Z) | Should |
| MA-05 | Escape key closes modal (with unsaved changes warning) | Should |

#### 3.3.5 Flattening

| ID | Requirement | Priority |
|----|-------------|----------|
| FL-01 | Combine background image + annotation layer into single image | Must |
| FL-02 | Output as PNG base64 | Must |
| FL-03 | Maintain original image dimensions | Must |

---

### 3.4 Floating Action Bar

**Description:** A fixed toolbar at the bottom of the screen for adding nodes and running workflows.

| ID | Requirement | Priority |
|----|-------------|----------|
| FA-01 | Fixed position at bottom center of viewport | Must |
| FA-02 | Buttons to add each node type to canvas | Must |
| FA-03 | **Run Workflow** button (play icon) | Must |
| FA-04 | Visual distinction for Run button (green/primary color) | Must |
| FA-05 | Disable Run button when workflow is invalid or running | Must |
| FA-06 | Show workflow running state (spinner/progress) | Must |

**Layout:**
```
[ + Image ] [ + Annotate ] [ + Prompt ] [ + Generate ] [ + Output ] | [ ▶ Run Workflow ]
```

---

### 3.5 Workflow Execution

**Description:** When user clicks "Run Workflow," execute all nodes in dependency order.

| ID | Requirement | Priority |
|----|-------------|----------|
| WE-01 | Validate workflow before execution (all required inputs connected) | Must |
| WE-02 | Topologically sort nodes by dependencies | Must |
| WE-03 | Execute nodes sequentially in sorted order | Must |
| WE-04 | Pass output data to connected downstream nodes | Must |
| WE-05 | Highlight currently executing node | Must |
| WE-06 | Show error state on node if execution fails | Must |
| WE-07 | Stop execution on error (don't continue to downstream nodes) | Must |
| WE-08 | Support multiple parallel branches (execute independent branches) | Should |
| WE-09 | "Stop" button to cancel running workflow | Should |

**Execution Flow Example:**
```
1. Image Input Node → outputs image
2. Annotation Node → receives image, outputs flattened annotated image
3. Prompt Node → outputs prompt text
4. Nano Banana Node → receives image + prompt, calls API, outputs generated image
5. Output Node → receives and displays generated image
```

**Chained Workflow Example:**
```
[Image Input] → [Annotate] → [Prompt 1] → [Generate 1] → [Annotate 2] → [Prompt 2] → [Generate 2] → [Output]
```

---

### 3.6 API Integration

**Description:** Integration with Google AI Studio API for Nano Banana Pro.

| ID | Requirement | Priority |
|----|-------------|----------|
| API-01 | Use @google/genai SDK | Must |
| API-02 | API key provided via environment variable (GEMINI_API_KEY) | Must |
| API-03 | API route: POST /api/generate | Must |
| API-04 | Request: { image: base64, prompt: string, aspectRatio?, resolution? } | Must |
| API-05 | Response: { image: base64 } or { error: string } | Must |
| API-06 | Handle rate limiting gracefully (show user-friendly error) | Must |
| API-07 | Timeout after 120 seconds | Must |

**API Route Implementation:**
```typescript
// POST /api/generate
{
  image: string,      // base64 encoded PNG
  prompt: string,     // user prompt
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
  resolution: "1K" | "2K"
}

// Response
{
  success: true,
  image: string       // base64 encoded PNG
}
// or
{
  success: false,
  error: string
}
```

---

## 4. User Interface

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Logo                                              [?] Help         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                                                                     │
│                     Node Graph Canvas                               │
│                     (pan, zoom, nodes, edges)                       │
│                                                                     │
│                                                                     │
│                                                                     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│         [ Floating Action Bar - centered at bottom ]                │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Visual Design

| Element | Specification |
|---------|---------------|
| Canvas Background | Off-white (#FAFAF9 or stone-50) with subtle dot grid |
| Node Background | White with subtle shadow |
| Node Border | Light gray, thicker when selected |
| Edge Color | Gray, animated flow when running |
| Action Bar | White/glass with rounded-full corners, shadow |
| Run Button | Green (#22C55E), white icon |
| Accent Color | Blue (#3B82F6) for selections and focus states |

### 4.3 Annotation Modal Visual Design

| Element | Specification |
|---------|---------------|
| Overlay | Dark semi-transparent backdrop |
| Modal | Near full-screen with small margin |
| Toolbar | Left side vertical toolbar |
| Canvas | Center, takes majority of space |
| Options Panel | Bottom horizontal bar for color/stroke options |
| Action Buttons | Top right (Done, Cancel) |

---

## 5. Out of Scope (v1)

The following are explicitly **not included** in v1:

- User authentication and accounts
- Cloud storage of workflows or images
- Save/load workflow functionality
- Multiple AI model support (only Nano Banana Pro)
- Real-time collaboration
- Undo/redo at workflow level (node deletion, etc.)
- Keyboard shortcuts for node creation
- Node grouping or subgraphs
- Custom node creation
- Batch processing
- History/versioning of generations
- Sharing workflows via URL

---

## 6. Environment Configuration

Users must provide their own Google AI Studio API key:

**.env.local**
```
GEMINI_API_KEY=your_api_key_here
```

**Setup Instructions (for README):**
1. Go to https://aistudio.google.com/app/apikey
2. Create a new API key
3. Copy the key
4. Create `.env.local` in project root
5. Add `GEMINI_API_KEY=your_key`
6. Restart dev server

---

## 7. Error States

| Scenario | User Feedback |
|----------|---------------|
| No API key configured | Toast: "API key not configured. Add GEMINI_API_KEY to .env.local" |
| API rate limit | Toast: "Rate limit reached. Please wait and try again." |
| API error (generic) | Toast: "Generation failed: [error message]" + node shows error state |
| Invalid workflow (missing connections) | Run button disabled, tooltip: "Connect all required inputs" |
| Image upload too large | Toast: "Image too large. Maximum size is 10MB." |
| Unsupported image format | Toast: "Unsupported format. Use PNG, JPG, or WebP." |

---

## 8. Technical Notes

### 8.1 State Structure (Zustand)

```typescript
interface WorkflowStore {
  nodes: Node[];
  edges: Edge[];
  
  // Node operations
  addNode: (type: NodeType, position: XYPosition) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  removeNode: (nodeId: string) => void;
  
  // Edge operations
  addEdge: (edge: Edge) => void;
  removeEdge: (edgeId: string) => void;
  
  // Execution
  isRunning: boolean;
  currentNodeId: string | null;
  executeWorkflow: () => Promise<void>;
  stopWorkflow: () => void;
}

interface AnnotationStore {
  isModalOpen: boolean;
  sourceNodeId: string | null;
  sourceImage: string | null;
  annotations: KonvaShape[];
  
  openModal: (nodeId: string, image: string) => void;
  closeModal: () => void;
  addAnnotation: (shape: KonvaShape) => void;
  updateAnnotation: (id: string, updates: Partial<KonvaShape>) => void;
  deleteAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  flattenImage: () => string; // returns base64
}
```

### 8.2 Node Data Interfaces

```typescript
interface ImageInputNodeData {
  image: string | null;  // base64
  filename: string | null;
  dimensions: { width: number; height: number } | null;
}

interface AnnotationNodeData {
  sourceImage: string | null;    // from connected node
  annotations: KonvaShape[];      // stored annotation shapes
  outputImage: string | null;     // flattened result
}

interface PromptNodeData {
  prompt: string;
}

interface NanoBananaNodeData {
  inputImage: string | null;
  inputPrompt: string | null;
  outputImage: string | null;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  status: 'idle' | 'loading' | 'complete' | 'error';
  error: string | null;
}

interface OutputNodeData {
  image: string | null;
}
```

---

## 9. Acceptance Criteria

### 9.1 Core Workflow

- [ ] User can add all 5 node types to canvas
- [ ] User can connect nodes via drag-and-drop edges
- [ ] User can delete nodes and edges
- [ ] User can upload an image to Image Input Node
- [ ] User can open Annotation Modal from Annotation Node
- [ ] User can draw rectangles, circles, arrows, freehand, and text
- [ ] User can change annotation color and stroke width
- [ ] User can save annotations and see flattened preview in node
- [ ] User can enter prompt text in Prompt Node
- [ ] User can run workflow and see generation progress
- [ ] Generated image appears in Output Node
- [ ] User can download generated image

### 9.2 Chained Workflow

- [ ] User can connect Output Node to another Annotation Node
- [ ] User can build a workflow with 2+ generation steps
- [ ] Workflow executes all steps in correct order
- [ ] Each generation uses the output of the previous step

### 9.3 Error Handling

- [ ] Invalid workflow shows disabled Run button with tooltip
- [ ] API errors display user-friendly messages
- [ ] Missing API key shows configuration instructions

---

## 10. Appendix

### 10.1 Nano Banana Pro API Reference

**Model:** `gemini-3-pro-image-preview`

**Request Format:**
```javascript
const response = await ai.models.generateContent({
  model: 'gemini-3-pro-image-preview',
  contents: [
    { 
      role: 'user', 
      parts: [
        { text: prompt },
        { 
          inlineData: { 
            mimeType: 'image/png', 
            data: base64Image 
          } 
        }
      ]
    }
  ],
  generationConfig: {
    responseModalities: ['Image'],
    imageConfig: { 
      aspectRatio: '16:9',
      imageSize: '2K' 
    }
  }
});
```

**Response:**
- `response.candidates[0].content.parts` contains either:
  - `{ text: string }` - text response
  - `{ inlineData: { mimeType: string, data: string } }` - image as base64

---

*End of Document*
