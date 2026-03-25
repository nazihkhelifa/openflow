# Workflow Patterns (Pro Engineering Reference)

Use these as defaults, then adapt to user intent and existing canvas.
Master these patterns before inventing new topology.

---

## CORE PATTERNS

### 1) Text → Image (Minimal)
- Nodes: `prompt` → `generateImage`
- Run: `executeNodeIds = [generateImage]`
- Use when: user asks to create/generate one image from a description.

### 2) Variations / A-B / Moodboard
- Nodes: shared source (optional) + 2-N branches each: `prompt` → `generateImage`
- Rule: one `prompt` per branch when wording differs; shared `prompt` only if identical.
- Add `imageCompare` at output end for side-by-side review (wire `gen-v1.image → imageCompare.image`, `gen-v2.image → imageCompare.image-1`).
- Run: all branch `generateImage` nodes together.
- Use when: user asks for options, alternatives, moodboard, or "show me X versions".

### 3) Image → Video
- Nodes: `mediaInput` (or existing image source) → `generateVideo`
- Add motion/camera/pacing in `generateVideo` prompt field.
- Run: `executeNodeIds = [generateVideo]`
- Use when: user wants to animate a still image.

### 4) Full Pipeline: Text → Image → Video
- Stage 1: `prompt` → `generateImage` (run image first)
- Stage 2: `generateImage.image` → `generateVideo` (run video after image is ready)
- Run stage 1 target first; then stage 2 target on next invocation.
- Use when: user wants concept → animated output in one intent.

### 5) Reference Image Edit
- Nodes: `mediaInput` → `generateImage` (image-conditioned)
- Prompt must name what to preserve AND what to transform.
- Use `reference` handle if style transfer; use `image` handle if image-to-image edit.
- Run: `executeNodeIds = [generateImage]`
- Use when: user brings an image and wants to alter/restyle/edit it.

### 6) Audio Generation
- Nodes: `prompt` → `generateAudio`
- Prompt: include genre, mood, tempo, instruments, duration target.
- Run: `generateAudio`
- Use when: user wants music, SFX, voiceover, or ambient audio.

### 7) 3D Generation
- Nodes: `prompt` (or `mediaInput`) → `generate3d` → `glbViewer`
- Wire: `generate3d.3d → glbViewer.3d`
- Run: `generate3d`
- Viewer auto-displays result.
- Use when: user wants a 3D asset from text or image.

---

## ADVANCED PATTERNS

### 8) Conditional / Decision-Based Workflow
- Nodes: source → `conditionalSwitch` → branch A (`generateImage`) + branch B (`generateVideo`)
- Use `router` when routing by content type; `switch` for user-controlled toggle; `conditionalSwitch` for rule-based auto-routing.
- Wire: source.text → `conditionalSwitch.text`; rule source handles → separate generation nodes.
- Add `comment` nodes near the switch to document routing logic.
- Use when: workflow needs to auto-select output type based on conditions.

### 9) Iterative Refinement Chain (Image → Refine → Refine → Output)
- Nodes: `prompt` → `generateImage` (v1) → `generateImage` (v2, image-conditioned) → `generateImage` (v3, final)
- Each downstream node receives prior output as `image` input + its own `prompt` for refinement instruction.
- Group each refinement step in a labeled group (blue → green → purple).
- Use when: user wants progressive enhancement (upscale, style-polish, detail-add chain).

### 10) Multi-Source Reference Workflow
- Nodes: multiple `mediaInput` nodes (style ref, content ref, subject ref) → `generateImage`
- Route: content ref via `image` edge; style/identity refs via `reference` edges.
- Prompt must name each reference role: "using [A] as style, [B] as subject".
- Use when: user provides 2+ references with distinct roles.

### 11) Brand / Style Consistency Pipeline
- Nodes: shared `mediaInput` (brand ref) + N `generateImage` branches
- Wire: brand ref → each generation node via `reference` edge.
- Each branch gets one merged `prompt` (brand guidelines + branch-specific content).
- Group all branches under one group ("Brand Variants", color `green`).
- Use when: user needs multiple outputs that must stay on-brand.

### 12) Full Multimodal Synthesis (Image + Audio + Video)
- Stage 1: `prompt` → `generateImage` (visual lane)
- Stage 2: `prompt` → `generateAudio` (audio lane)
- Stage 3: `generateImage.image` → `generateVideo` (video lane)
- Organize as three parallel vertical lanes. Add `comment` nodes as lane headers ("Visual", "Audio", "Video").
- Execute each lane's terminal node.
- Use when: user wants a complete multimedia deliverable.

### 13) Batch / High-Count Variant Generation (4–8 variants)
- Nodes: optional shared source + N branches (exactly N = count user specified).
- Layout: grid — 4 variants in 2 cols × 2 rows; 6 in 3 cols × 2 rows.
- Horizontal spacing: ~420px per column; vertical: ~220px per row.
- Each branch: one `prompt` + one `generateImage`.
- Create one group per row or one group for all variants.
- Run all N generation nodes together.
- Use when: user asks for exactly 4, 6, or 8 options.

### 14) Ease Curve → Video Motion Control
- Nodes: `easeCurve` → `generateVideo`
- Wire: `easeCurve.easeCurve → generateVideo.easeCurve`
- Set `easingPreset` in easeCurve data (e.g. `easeInOutSine`, `spring`, `linear`).
- Combine with `mediaInput.image → generateVideo.image` for full motion-controlled animation.
- Use when: user asks for specific camera motion pacing, acceleration, or easing effects.

### 15) A/B Decision Preview (Switch-Controlled Output)
- Nodes: `switch` → two output paths (each with own generation node) → `imageCompare`
- Target `switch` with `generic-input`; outputs use named switch entry IDs.
- Wire final outputs into `imageCompare` (`image` and `image-1`).
- Use when: user wants to toggle between two workflow approaches without rebuilding.

### 16) Canvas-Documented Complex Workflow
- Rule: for any workflow with 6+ nodes, add `comment` nodes as stage headers.
- Place `comment` nodes above/left of each stage group: "Stage 1: Input", "Stage 2: Generate", "Stage 3: Review".
- Use `comment` for per-node tips ("swap style ref here", "run this first").
- `comment` nodes have NO handles — NEVER wire them into edges.
- Use when: user asks to "document", "organize", or "make this readable"; apply proactively on complex builds.

### 17) Upscale / Post-Process Chain
- Nodes: `generateImage` (base) → `generateImage` (upscale, image-conditioned)
- The upscale node receives base output as `image` + a short upscale-specific `prompt`.
- Wire: `base-gen.image → upscale-gen.image`
- Use when: user asks to upscale, enhance, add detail, or increase resolution.

### 18) Image Annotation / Overlay Layer
- Nodes: `mediaInput` (or `generateImage`) → `annotation`
- Wire: source.image → `annotation.image`
- Configure overlay content in the annotation layer editor.
- `annotation` outputs annotated image via `annotation.image` → next node.
- Use when: user wants to add text overlays, graphics, or annotations ON TOP of an existing image.

### 19) Camera Angle Reframe
- Nodes: `mediaInput` (or `generateImage`) → `cameraAngleControl` → `generateImage`
- Wire: source.image → `cameraAngleControl.image`; `cameraAngleControl.image` → next gen node
- Set `angleSettings` (`rotation`, `tilt`, `zoom`, `wideAngle`) and `cameraPrompt` in data.
- Use when: user wants to reframe, zoom, rotate, or tilt the composition.

### 20) Frame Extraction + Restyle
- Nodes: `mediaInput` (video) → `generateImage` (restyle via `reference` edge)
- Wire: `mediaInput.video` → extraction → new `mediaInput.image` (via toolbar "Extract frame" action)
- Or: add `mediaInput` for extracted frame → `generateImage` with `reference` + style `prompt`
- Use when: user uploads a video and wants to restyle a frame.

### 21) Prompt-Only Mode (Text Extraction / No Graph Mutation)
- No canvas operations emitted.
- Return text in `assistantText` only.
- Do NOT add `mediaInput` or any node.
- Use when: user says "extract a prompt from this image", "write a prompt for", "give me a prompt" — intent is extraction/advisory only.

### 23) Canvas-Native Planning (Visible Step-by-Step Build)
- Use when: complex request (4+ nodes, multi-stage, or multi-modal).
- Phase 1 — Plan: emit numbered comment nodes as a build plan, spread left-to-right at y=-140.
  - `nodeId: "plan-step-N"`, `author: "Flowy"`, `authorType: "agent"`
  - Text: `"Step N: <exact build instruction>"`
  - Immediately execute Step 1 ops in the same response, then resolve plan-step-1.
- Phase 2+ — Execute: each subsequent call executes only the next unresolved plan step + resolves it.
- Layout: plan row at y=-140, actual workflow nodes at y=0+.
- Max 6 steps. One step per response. Always resolve step before moving on.
- The Planning Context block in your prompt tells you exactly which step is next.

### 22) Minimal Reset + Rebuild
- First operation: `clearCanvas`
- Then: build the simplest runnable workflow satisfying the request.
- Use `clearCanvas` instead of multiple `removeNode` chains when user says "start over", "clear everything", "build from scratch", or graph is tangled.

---

## TOPOLOGY RULES (Senior Standard)

### Spatial layout defaults
- Left → right by stages: sources (x=100) → prompts (x=500) → generation (x=900) → output/review (x=1300).
- Horizontal gap between stages: 350–450px.
- Vertical gap between branches: 180–240px.
- Grid layouts for N variants: 420px horizontal × 220px vertical per cell.
- Never overlap nodes.

### Group color semantics
- `blue` = input / reference stage
- `green` = generation stage
- `purple` = review / output stage
- `orange` = special / annotation layers
- `neutral` = misc

### Wiring discipline
- ONE `text` edge max into any generation node.
- ONE `image` edge max into any generation node.
- `reference` edges: source must be `mediaInput` or `generateImage`; target must be `generateImage` or `generateVideo`.
- `easeCurve` output: only to `generateVideo.easeCurve`.
- `comment` nodes: NEVER in data edges.
- `annotation` nodes: wired via `image` handles only (image in → annotated image out).

### Chain vs Branch decision
- **Chain** (serial): when each stage needs the prior output → refinement, animate generated image, upscale.
- **Branch** (parallel): when stages are independent → variants, simultaneous outputs.
- **Hybrid**: branch generation, merge at `imageCompare`.

### When to use control nodes
- `router`: variable input type that needs automatic fan-out.
- `switch`: user-controlled toggle between two explicit paths.
- `conditionalSwitch`: rule-based text routing with explicit conditions.
- Use sparingly — only when genuine conditional logic is required.

### Execution targeting
- Only set `executeNodeIds` when user asks for output NOW.
- Target terminal generation nodes: `generateImage`, `generateVideo`, `generateAudio`, `generate3d`, `prompt`.
- Never execute: `comment`, `mediaInput`, `glbViewer`, `imageCompare`, `easeCurve`, `router`, `switch`, `conditionalSwitch`, `annotation`.
- For multi-stage chains: execute only the current stage's terminal node.
