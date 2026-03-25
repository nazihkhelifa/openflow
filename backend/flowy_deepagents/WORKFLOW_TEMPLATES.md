# Workflow Templates (Pro Engineering Reference)

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
- Rule: one `prompt` node per branch when wording differs; shared prompt only if identical.
- Add `imageCompare` to output end if user wants side-by-side review.
- Run: all branch `generateImage` nodes together.
- Use when: user asks for options, alternatives, moodboard, or "show me X versions".

### 3) Image → Video
- Nodes: `mediaInput` (or existing image source) → `generateVideo`
- Add motion/camera/pacing detail directly in `generateVideo` prompt field.
- Run: `executeNodeIds = [generateVideo]`
- Use when: user wants to animate a still image.

### 4) Full Pipeline: Text → Image → Video
- Stage 1: `prompt` → `generateImage` (run image first)
- Stage 2: `generateImage.image` → `generateVideo` (run video after image is ready)
- Note: chain output from stage 1 into stage 2 input; executeNodeIds tracks current stage target.
- Use when: user wants to go from concept to final animated output in one intent.

### 5) Reference Image Edit
- Nodes: `mediaInput` → `generateImage` (image-conditioned)
- Prompt must name what to preserve AND what to transform.
- Use `reference` edge if style transfer; use `image` edge if image-to-image edit.
- Run: `executeNodeIds = [generateImage]`
- Use when: user brings an image and wants to alter/restyle/edit it.

### 6) Audio Generation
- Nodes: `prompt` → `generateAudio`
- Prompt: include genre, mood, tempo, instruments, duration target.
- Run: `generateAudio`
- Use when: user wants music, SFX, voiceover, or ambient audio.

### 7) 3D Generation
- Nodes: `prompt` (or `mediaInput`) → `generate3d` → `glbViewer`
- Run: `generate3d`
- Viewer auto-updates when upstream generation completes.
- Use when: user wants a 3D asset from text or image.

---

## ADVANCED PATTERNS

### 8) Conditional / Decision-Based Workflow
- Nodes: source → `conditionalSwitch` → branch A (`generateImage`) + branch B (`generateVideo`)
- Use `router` when routing by content type; use `switch` for explicit user-controlled toggle; use `conditionalSwitch` for rule-based auto-routing.
- Wire: source output → `conditionalSwitch.image` or `.text`; each output handle → separate generation node.
- Add `annotation` nodes near the switch to document the routing logic for future users.
- Use when: user wants the workflow to auto-select output type based on input or condition.

### 9) Iterative Refinement Chain (Image → Refine → Refine → Output)
- Nodes: `prompt` → `generateImage` (v1) → `generateImage` (v2, image-conditioned) → `generateImage` (v3, final)
- Each downstream node receives the prior output as `image` input + its own `prompt` for refinement instruction.
- Group each refinement step in a labeled group (blue/green/purple) for readability.
- Use when: user wants progressive enhancement (upscale, style-polish, detail-add chain).

### 10) Multi-Source Reference Workflow
- Nodes: multiple `mediaInput` nodes (style ref, content ref, subject ref) → `generateImage`
- Route: content ref via `image` edge; style/identity refs via `reference` edges.
- Prompt must explicitly name each reference role: "using [A] as style, [B] as subject".
- Use when: user provides 2+ reference images with distinct roles.

### 11) Brand / Style Consistency Pipeline
- Nodes: shared `mediaInput` (brand ref) + shared `prompt` (brand guidelines) → N `generateImage` branches
- Wire: brand ref → each generation node via `reference` edge; brand prompt → each generation node via `text` edge.
- Each branch gets its own content-specific `prompt` wired via `text` as secondary input? No — each generation node accepts at most ONE text input. Instead: pre-merge brand + content instructions into one `prompt` per branch.
- Group all brand-constrained branches under one group ("Brand Variants").
- Use when: user needs multiple outputs that must stay on-brand.

### 12) Full Multimodal Synthesis (Image + Audio + Video)
- Stage 1: `prompt` → `generateImage` (visual)
- Stage 2: `prompt` → `generateAudio` (soundtrack/SFX)
- Stage 3: `generateImage.image` → `generateVideo` (animate image)
- Organize left-to-right with three parallel vertical lanes (Visual / Audio / Video), then converge at review.
- Add `annotation` nodes labeling each lane.
- Use when: user wants a complete multimedia deliverable.

### 13) Batch / High-Count Variant Generation (4–8 variants)
- Nodes: optional shared source + N branches (N = exact count user specified).
- Layout: arrange in a grid — 4 variants in 2 columns × 2 rows; 6 variants in 3 columns × 2 rows.
- Horizontal spacing: ~420px per column; vertical spacing: ~220px per row.
- Each branch: one `prompt` + one `generateImage` node.
- Create one group per row or one group for all variants.
- Run all N generation nodes together.
- Use when: user asks for 4, 6, or 8 options explicitly.

### 14) Ease Curve → Video Motion Control
- Nodes: `easeCurve` → `generateVideo`
- Wire: `easeCurve.easeCurve` → `generateVideo.easeCurve`
- Configure the curve on `easeCurve` node (easeIn, easeOut, linear, spring, etc.).
- Combine with `mediaInput` → `generateVideo` for full motion-controlled animation.
- Use when: user asks for specific motion pacing, acceleration, or camera easing.

### 15) A/B Decision Preview (Switch-Controlled Output)
- Nodes: `switch` node → two output paths (each with own generation node)
- Wire: `switch` output A → branch A generation; switch output B → branch B.
- Add `imageCompare` at the end to review both outputs side-by-side.
- Use when: user wants to quickly toggle between two workflow approaches without re-building.

### 16) Annotation-Documented Complex Workflow
- Rule: for any workflow with 6+ nodes, add `annotation` nodes as stage labels.
- Pattern: place `annotation` ("Stage 1: Input") above/left of input nodes; "Stage 2: Generate" above generation nodes; "Stage 3: Review" above output nodes.
- Use `comment` nodes for per-node tips or user-facing notes ("run this first", "swap style ref here").
- Do NOT wire annotation/comment nodes into data edges. They are purely documentary.
- Use when: user asks to "document", "organize", or "make this readable"; also apply proactively to complex workflows.

### 17) Upscale / Post-Process Chain
- Nodes: `generateImage` (base) → `generateImage` (upscale, image-conditioned)
- The upscale node receives the base output as `image` input + a short upscale-specific `prompt`.
- Wire: base `generateImage.image` → upscale `generateImage.image`.
- Use when: user asks to upscale, enhance, add detail, or increase resolution.

### 18) Frame Extraction + Restyle
- Nodes: `mediaInput` (video source) → `generateImage` (restyle via `reference` edge)
- Wire: `mediaInput.video` → `generateImage.reference`
- Add `prompt` node describing the target style.
- Use when: user uploads a video and wants to extract a frame style or restyle a frame.

### 19) Prompt-Only Mode (Text Extraction / No Graph Mutation)
- No canvas operations emitted.
- Return prompt text in `assistantText` only.
- Do NOT add `mediaInput` or any node unless user explicitly asks for it.
- Use when: user says "extract a prompt from this image", "write a prompt for", "give me a prompt" — intent is extraction/advisory, not graph wiring.

### 20) Minimal Reset + Rebuild
- Single `clearCanvas` operation followed by a fresh minimal workflow.
- Use `clearCanvas` instead of multiple `removeNode` chains when user says "start over", "clear everything", "build from scratch", or when current graph is tangled/incorrect.
- After clear, build the simplest runnable workflow that satisfies the request.

---

## TOPOLOGY RULES (Senior Standard)

### Spatial layout defaults
- Left → right by stages: sources (x=100) → prompts (x=500) → generation (x=900) → output/review (x=1300).
- Horizontal gap between stages: 350–450px.
- Vertical gap between branches: 180–240px.
- Grid layouts for N variants: 420px horizontal × 220px vertical per cell.
- Never overlap nodes. Stagger if needed.

### Group usage
- Group sibling variants or related sub-pipelines.
- Use color semantics: `blue` = input/reference stage; `green` = generation stage; `purple` = review/output; `orange` = annotation/docs; `neutral` = misc.
- Max 1 group per logical stage lane; do not over-group.

### Wiring discipline
- At most ONE text edge into any generation node.
- At most ONE image edge into any generation node.
- Reference edges: source must be `mediaInput` or `generateImage`; target must be `generateImage` or `generateVideo`.
- `easeCurve` output only connects to `generateVideo.easeCurve`.
- `annotation` and `comment` nodes: NEVER in data edges.

### Chain vs Branch decision
- **Chain** (serial): when each stage needs the output of the prior stage (refinement, animation from generated image, upscale).
- **Branch** (parallel): when stages are independent and user wants comparison or simultaneous output.
- Hybrid: branch generation, then merge at a shared review node (`imageCompare`).

### When to use control nodes
- `router`: auto-routing by detected content type (image vs video vs audio).
- `switch`: user-controlled toggle between two explicit workflow paths.
- `conditionalSwitch`: rule-based branching (e.g., if input has face → route to portrait flow; else → scene flow).
- Use these sparingly — only when workflow needs genuine conditional logic, not just for visual decoration.

### Execution targeting
- Only set `executeNodeIds` when user asks for output NOW.
- Target the terminal generation node(s) of each runnable branch.
- Never auto-execute annotation, comment, mediaInput, or viewer nodes.
- For multi-stage chains, execute only the current stage's terminal node.
