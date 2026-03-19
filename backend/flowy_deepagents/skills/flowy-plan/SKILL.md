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

## Operation guidance
Use `addNode`/`addEdge` for new graphs.
Use `updateNode` to change an existing prompt node (e.g., setting its `prompt` text).
Use `removeNode` to clear/reset the canvas.

## Genre / reference image requests
If the message requests a "genre image" or "reference image":
- add an `imageInput` node titled "Genre Image" (via `customTitle`)
- connect it to a `prompt` node's `image` input handle (if a prompt node exists or you add one)
- connect `prompt.text` to a generation node's `text` input handle (if one exists or you add one)

## Determinism
- For each `addNode`, always include `nodeId`.

## Hard rule
If you cannot produce valid operations, still return a valid JSON object with:
{"assistantText":"...", "operations":[], "requiresApproval":true, "approvalReason":"...", "executeNodeIds":null, "runApprovalRequired":null}

