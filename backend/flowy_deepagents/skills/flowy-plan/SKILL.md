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
- Produce a usable first stage quickly, then optional refinements.
- Prefer editing/connecting existing nodes before creating new duplicates.
- If user asks for generation/output, set `executeNodeIds` for the node(s) that should run.
- Keep `assistantText` practical: 1-3 concise lines summarizing what was changed.
- Classify request first (deliverable, inputs, task mode), then choose the smallest valid workflow pattern.
- Follow stage loop: build -> run -> inspect -> continue/refine.
- Do not stop at node setup if user requested generated output.
- If reference fidelity matters, prefer direct reference wiring over text-only restatement.
- If blocked by ambiguity, ask one concise question; otherwise default and proceed.

## Operation guidance
Use `addNode`/`addEdge` for new graphs.
Use `updateNode` to change an existing prompt node (e.g., setting its `prompt` text).
Use `removeNode` to clear/reset the canvas.
Use `executeNodeIds` to request node execution after planning edits.
Use `moveNode` to arrange layout positions.
Use `createGroup`/`setNodeGroup`/`updateGroup`/`deleteGroup` for grouping workflows.

## Prompt writing guidance
When writing or updating prompts in node data:
- Extract user intent first (subject/action, setting, style, constraints).
- Use modality-specific structure:
  - image prompt: subject + setting + aesthetic (+ optional lighting/composition)
  - video prompt: subject/action + setting + camera/motion + pacing/mood
  - text prompt: deliverable + context + constraints
- Keep prompts concrete and concise; avoid chatty filler.
- Anchor to provided references when user asks for similarity/preservation.
- Avoid prompt drift: do not add unrelated objects or themes.

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

