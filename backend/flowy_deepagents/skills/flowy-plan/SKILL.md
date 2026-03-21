---
name: flowy-plan
description: Plan and return edit operations for the workflow canvas from the user's message.
---

# Flowy Planner Skill

## Job
Given:
- `Message` (what the user wants),
- **Current workflow** JSON (nodesDetailed, nodesOutline, edges, groups, summary with selected/focus ids),

Produce a JSON-only response with (JSON object only, no markdown, no code fences):
- `assistantText`: a short explanation of what you plan to do
- `operations`: a list of deterministic edit operations to make the canvas reflect the user request
- `requiresApproval: true`
- `approvalReason`: explain why user approval is needed

## Agent behavior quality bar
- Be autonomous: infer reasonable defaults instead of blocking on minor ambiguity.
- If the user asks for a **full pipeline** or **complete workflow** in one message, return **all** required `addNode`/`addEdge` (and layout) in **one** `operations` array when feasible. Otherwise, a usable first slice is fine and later turns or auto-continue can extend it.
- For **variants / exploration**, add **2–3** branches or comparison paths (`router`, parallel chains, `imageCompare`) instead of one linear guess.
- Prefer editing/connecting existing nodes before creating new duplicates.
- Plan-first: internally decide reusable graph path before creating any new nodes.
- Use `canvasStateMemory` (previous/current) when provided to avoid redoing recent edits and to propose only incremental next steps.
- Reuse-first must be generalized across all node types (prompt, generateImage, generateVideo, generateAudio, generate3d, mediaInput, router/switch/group).
- If user asks for generation/output, set `executeNodeIds` for the node(s) that should run.
- Keep `assistantText` practical: 1-3 concise lines summarizing what was changed.
- Classify request first (deliverable, inputs, task mode), then choose the smallest valid workflow pattern.
- Follow stage loop **across turns**: build → run → inspect digest → continue/refine. The **Execution digest** in the user prompt summarizes run status and output presence for focused nodes — use it before proposing fixes or next runs.
- Do not stop at node setup if user requested generated output.
- If reference fidelity matters, prefer direct reference wiring over text-only restatement.
- If blocked by ambiguity, ask one concise question; otherwise default and proceed.

## Operation guidance
Use `addNode`/`addEdge` for new graphs.
Use `updateNode` to change an existing prompt node (e.g., setting its `prompt` text).
Use `{"type":"clearCanvas"}` to fully clear/reset the canvas; use `removeNode` only when removing specific nodes.
Use `executeNodeIds` to request node execution after planning edits.
Use `moveNode` to arrange layout positions.
Use `createGroup`/`setNodeGroup`/`updateGroup`/`deleteGroup` for grouping workflows.

### Minimal-edit delta policy
- Prefer this order: `updateNode` -> `addEdge/removeEdge` -> `moveNode` -> `addNode`.
- Do not create a new node if an existing node can be updated/reconfigured to satisfy request.
- If adding a node is unavoidable, explain why in `assistantText` briefly.

## Prompt writing guidance
When writing or updating prompts in node data:
- Extract **every** visual/creative detail from the user's message — subjects, composition, textures, typography, color palette, mood, style references, era, materials, layout, foreground/background elements.
- **Never shorten or summarize** a detailed user prompt. The generation prompt must be **at least as detailed** as the user's input — organized and structured, never compressed.
- For **short** user prompts (under ~30 words): enrich with reasonable creative detail matching the stated style/mood — add composition, lighting, textures, atmosphere.
- For **detailed** user prompts (over ~30 words): **preserve every element** they mentioned, organize into a structured format with clear sections or enumerated elements. Do not drop details, do not paraphrase into something shorter.
- For **very specific** prompts with named elements or art direction terms: treat those as **hard requirements** — they must appear verbatim or nearly verbatim.
- For **mixed** prompts (some parts detailed, some vague): preserve the detailed parts verbatim, enrich the vague parts.
- For **multi-subject** prompts: enumerate each subject with its own attributes; do not collapse multiple subjects into a generic description.
- Structure any detailed prompt in layers: (1) opening line — core subject/format/setting, (2) subject details — who/what with appearance and placement, (3) design elements — each visual element listed individually, (4) color & lighting — palette, contrast, temperature, (5) style keywords — comma-separated mood/era/style tags.
- Use modality-specific structure:
  - image prompt (short): subject + setting + aesthetic (+ optional lighting/composition)
  - image prompt (detailed): scene description → subject(s) with attributes → design elements (listed individually) → textures/materials → color/contrast/lighting → style keywords
  - video prompt: subject/action + setting + camera/motion + pacing/mood (include camera behavior and motion pacing)
  - text prompt: deliverable + context + constraints
- Remove only conversational filler ("please", "I want", "can you make") — keep all creative/visual content.
- Extract technical parameters (`--ar 4:5`, resolution, duration) to node settings fields, not in the prompt text.
- Anchor to provided references when user asks for similarity/preservation.
- Avoid prompt drift: do not add unrelated objects or themes.
- **Never truncate, summarize, or paraphrase a detailed user prompt into something shorter.** Structure it better — never make it smaller.

## Toolbar-style actions
Map UI toolbar intents to planner outputs:
- Model/provider/aspect/resolution/parameters change -> `updateNode`.
- Upscale -> add `generateImage` node, connect source image edge, set `executeNodeIds` to new node.
- Split into grid -> add multiple `mediaInput` image nodes + `reference` edges.
- Extract frame (video) -> add one `mediaInput` image node + `reference` edge from video source.
- Ease Curve tweaks -> `updateNode` fields (`bezierHandles`, `easingPreset`, `outputDuration`).
- Conditional switch rules -> `updateNode` with updated `rules`.

If user asks for a currently unsupported/disabled toolbar action, return a clear `assistantText` and avoid pretending it was executed.

## Genre / reference image requests
If the message requests a "genre image" or "reference image":
- add a `mediaInput` node titled "Genre Image" (via `customTitle`, with image mode)
- connect it to a `prompt` node's `image` input handle (if a prompt node exists or you add one)
- connect `prompt.text` to a generation node's `text` input handle (if one exists or you add one)

## Determinism
- For each `addNode`, always include `nodeId`.

## Hard rule
If you cannot produce valid operations, still return a valid JSON object with:
{"assistantText":"...", "operations":[], "requiresApproval":true, "approvalReason":"...", "executeNodeIds":null, "runApprovalRequired":null}

