# Flowy Agent Abilities Audit (Iteration 1)

Date: 2026-03-25
Scope reviewed:
- `backend/flowy_deepagents/*`
- `backend/flowy_mcp_server.py`
- `src/components/*` (workflow, toolbars, groups, chat)
- `src/lib/workflow/canvasConnectionRules.ts`
- `src/lib/flowy/planner_schema.json`
- `src/lib/quickstart/prompts.ts`

## Why workflows feel "not correct" today

The current stack can plan many operations, but correctness is inconsistent because:
1. Prompt guidance is mixed (current + legacy node vocabulary) in quickstart prompts.
2. Some critical behaviors are validated but not executed end-to-end in backend stubs.
3. Some UI features exist but are only partially wired (or hidden/missing entry points).

---

## Ability Matrix (Requested vs Existing)

Legend:
- `SUPPORTED`: implemented and actively used
- `PARTIAL`: present but weak/incomplete/inconsistent
- `MISSING`: no reliable implementation

### 1) Upload image to workflow media input + use in chat + add to graph on request
- Status: `SUPPORTED` (with caveats)
- Existing:
  - Workflow upload/drop/paste into `mediaInput` exists in `src/components/WorkflowCanvas.tsx`.
  - Upload node media handling exists in `src/components/nodes/input/UploadNode.tsx`.
  - Chat image attachment flow exists in:
    - `src/components/FlowyCanvasChatComposer.tsx`
    - `src/components/FlowyAgentPanel.tsx`
    - `/api/flowy/plan` and `/api/flowy/plan/stream` routes.
  - Backend attachment ingestion exists in `backend/flowy_deepagents/content_writer.py`:
    - `_coerce_image_attachments`
    - `_build_human_message_with_attachments`
    - `_materialize_attachment_operations` (can emit `mediaInput`-related ops).
- Caveat:
  - Legacy chat path `src/components/ChatPanel.tsx` does not provide equivalent attachment UX.

### 2) Use image as reference OR extract prompt only (without forcing upload node)
- Status: `PARTIAL`
- Existing:
  - Reference edges/tooling are present:
    - `src/components/edges/ReferenceEdge.tsx`
    - `UploadToolbar`, `GenerateImageToolbar`, `GenerateVideoToolbar`.
  - Prompt execution can consume connected images:
    - `src/store/execution/simpleNodeExecutors.ts` (`executePrompt` sends `images` to `/api/llm`).
  - Backend can pass image attachments to multimodal planner (`content_writer.py`).
- Gaps:
  - No explicit deterministic "extract prompt from image only" tool path; mostly LLM inference.
  - `reference` handle behavior is not strictly typed in the connection type mapper (acts wildcard when unresolved).

### 3) Full rules for allowed/disallowed node input/output handle types
- Status: `SUPPORTED` (core), `PARTIAL` (edge cases)
- Existing:
  - Frontend canonical rules: `src/lib/workflow/canvasConnectionRules.ts`
  - Backend mirror rules: `backend/flowy_deepagents/connection_validation.py`
  - Planner schema allowlists: `src/lib/flowy/planner_schema.json`
  - Backend operation and edge validation in `content_writer.py`.
- Gaps:
  - Unknown handles resolve to permissive path in some cases.
  - `reference` is listed in schema handles but not strongly enforced as a first-class strict category in all branches.

### 4) Toolbar abilities
- Status: `PARTIAL`
- Existing:
  - Strong toolbar surface exists in:
    - `UploadToolbar.tsx`
    - `GenerateImageToolbar.tsx`
    - `GenerateVideoToolbar.tsx`
  - Actions include split-grid, extract-frame, upscale insertion, model tuning actions, etc.
  - Backend has toolbar intent validation (`_validate_toolbar_intent_plan` in `content_writer.py`).
- Gaps:
  - Some toolbar buttons are placeholders/disabled.
  - Backend validates intent patterns but does not execute frontend UI commands itself.

### 5) Aspect ratio + model change + model info
- Status: `SUPPORTED` (core), `PARTIAL` (consistency)
- Existing:
  - Frontend model/aspect controls and node defaults:
    - `GenerateImageToolbar.tsx`
    - `src/store/utils/nodeDefaults.ts`
    - `src/store/utils/localStorage.ts`
  - Model metadata API:
    - `src/app/api/models/route.ts`
  - Backend aspect/model normalization:
    - `_effective_aspect_ratio_on_canvas`
    - `_normalize_operation_models`
    - `_pick_best_model_alias`
  - Global rules/defaults:
    - `src/lib/flowy/planner_schema.json` (`modelCapabilities`, `modelSelectionRules`, `aspectRatioPolicy`).
- Gaps:
  - Mixed legacy/new model field conventions still coexist in parts of the stack.

### 6) Existing models list + default params per model + default model per node type
- Status: `PARTIAL` (mostly available, not fully unified)
- Existing:
  - Model catalog endpoint exists (`/api/models`).
  - Planner schema provides global defaults (`defaultImage`, `defaultVideo`, `defaultText`).
  - Node defaults are created in `createDefaultNodeData`.
- Gaps:
  - No single authoritative "per-node-type default parameter matrix" exposed as one source for agent + UI + backend.
  - Resolution/default param logic is partly node-specific, partly provider/model-specific.

### 7) Arrange nodes, move, delete nodes, clear workflows/canvas
- Status: `SUPPORTED` (move/delete), `PARTIAL` (clear UX path consistency)
- Existing:
  - Move/arrange operations supported (`WorkflowCanvas`, `MultiSelectToolbar`).
  - Delete selected/context menu exists.
  - Operation types include `moveNode`, `removeNode`, `clearCanvas`.
  - Backend plan/apply web routes exist in MCP bridge methods.
- Gaps:
  - `backend/flowy_mcp_server.py` local `apply_edit_operations()` is still a stub.
  - "Clear all canvas/workflow" UX entry point is not consistently surfaced everywhere.

### 8) Groups: create, color, remove nodes from groups, delete groups
- Status: `SUPPORTED`
- Existing:
  - Group create/ungroup and overlay controls:
    - `MultiSelectToolbar.tsx`
    - `GroupsOverlay.tsx`
  - Store support:
    - `createGroup`, `deleteGroup`, `updateGroup`
    - `addNodesToGroup`, `removeNodesFromGroup`, `setNodeGroupId`, etc.
  - Backend operation validation supports group ops, with color allowlist in deepagents.
- Caveat:
  - "Remove from group" in backend operation terms is typically done via `setNodeGroup` with null/empty target rather than a dedicated op name.

---

## Backend Deepagents-Specific Findings

Main capability center is `backend/flowy_deepagents/content_writer.py`:
- Validates planned edits and connections against schema and canvas-like rules.
- Handles attachment-aware planning for images.
- Applies intent validation for advanced toolbar workflows.
- Normalizes model and aspect decisions from user intents/platform hints.

Main gap:
- `backend/flowy_mcp_server.py` still includes MVP stub behavior in local apply path, so not every planned operation becomes a guaranteed real mutation unless routed through web apply endpoints.

---

## Quickstart Prompt Health (Important)

`src/lib/quickstart/prompts.ts` is currently inconsistent:
- `buildQuickstartSystemInstruction()` pushes modern node policy.
- `buildQuickstartPrompt()` and `buildSimplePrompt()` still contain legacy references (`nanoBanana`, `output`, old examples/checklists).

Impact:
- Agent may produce plans that are syntactically valid but semantically outdated vs current node ecosystem.

---

## Immediate Priority Fixes (for next iteration)

1. Unify prompt contracts in `prompts.ts` to current node vocabulary only.
2. Add explicit "image-to-prompt-extraction-only" intent path (no forced media node creation when user requests extraction only).
3. Tighten `reference` handle validation so it is consistently enforced across frontend/backend checks.
4. Promote one canonical source for per-node default model + default params and consume it in both planner and UI defaults.
5. Replace remaining backend apply stubs with authoritative apply flow (or hard-disable stub path to avoid false success).

---

## Confidence and Limits

- High confidence on capabilities listed above (verified by code-level paths).
- Medium confidence on unscanned folders outside reviewed scope; this is iteration 1 and should be extended with additional pass over execution/runtime services and API routes if needed.

---

## Iteration 2 Backend Upgrades Applied (2026-03-25)

Updated files:
- `backend/flowy_deepagents/content_writer.py`
- `backend/flowy_deepagents/AGENTS.md`

What was upgraded:
1. Added new intent signal:
   - `asksPromptExtractFromImageOnly` to better distinguish extraction-only requests from full reference-wiring requests.
2. Strengthened prompt instructions sent to planner:
   - explicit attachment handling modes (reference workflow mode vs prompt-extraction-only mode).
3. Improved operation normalization:
   - auto-convert full-canvas removeNode chains into `clearCanvas` for cleaner plans.
   - auto-fill `executeNodeIds` when run intent is explicit and generation targets are obvious.
4. Tightened edge validation for `reference` handle:
   - reference target must be `mediaInput`
   - reference sourceHandle must be `image` or `video`
   - disallow invalid source node types for reference wiring (`prompt`, `generateAudio`)
5. Expanded planner behavior charter (`AGENTS.md`) for senior workflow quality:
   - cleaner stage topology rules
   - explicit run-now behavior
   - stronger production-grade defaults and reset behavior guidance

Known remaining gap after iteration 2:
- `backend/flowy_mcp_server.py` local `apply_edit_operations()` still uses stub apply semantics and should be fully wired to authoritative apply path for end-to-end reliability.

---

## Iteration 2.1 Stability Patch (LLM truncation guard)

Issue observed:
- `validation_failed` with truncated planner JSON where node prompt/comment text was polluted with copied UI snapshot DOM/error text.

Backend fixes applied in `backend/flowy_deepagents/content_writer.py`:
1. Added `_sanitize_openflow_ui_snapshot(...)`
   - removes known noisy lines (`validation_failed`, `DOM Path`, `HTML Element`, `React Component`, `Position`)
   - trims snapshot payload length before injecting into LLM prompt context.
2. Added `_sanitize_node_text_payloads(...)`
   - strips accidental UI dump blocks from node `data.prompt`/`data.text` and related text fields
   - caps long text blobs to reduce truncation risk.
3. Builder pipeline now sanitizes operations after normalization and before validation.
4. Updated close-plan instruction:
   - explicitly forbids copying raw DOM/error/UI snapshot text into node data.

Expected effect:
- Lower invalid/truncated JSON incidence.
- Cleaner prompt/comment node payloads.
- More stable generation of large multi-branch workflows.

---

## Iteration 2.2 Truncation Hardening (complex multi-look plans)

Issue observed:
- Complex "4-look + crops" requests still produced truncated JSON due to oversized per-node prompt payloads.

Additional backend hardening in `backend/flowy_deepagents/content_writer.py`:
1. Tightened planner instruction contract (`CLOSE_CANVAS_PLAN`):
   - `customTitle <= 80 chars`
   - `prompt/text <= 420 chars per node`
   - explicitly avoid long prose blocks in node data.
2. Strengthened retry compact-mode guidance on truncation:
   - assistant text under 160 chars
   - prompt/text under 320 chars
   - prefer compact updates and short structured node payloads.
3. Reduced sanitizer cap for node text payloads:
   - text fields now trimmed to 420 chars (down from 1200).

Expected effect:
- Better resilience on high-branch editorial workflows.
- Fewer JSON truncation failures before validation.

---

## Iteration 2.3 UI Stability Fix (EditableEdge NaN)

Issue observed:
- Console warning/error: `Received NaN for the cy attribute` in `EditableEdge` SVG rendering.

Cause:
- `EditableEdge` renders draggable handle circles using computed handle positions derived from `sourceX/sourceY/targetX/targetY`.
- During transient graph edits, ReactFlow can temporarily provide `NaN` for these coordinates.

Fix:
- In `src/components/edges/EditableEdge.tsx`:
  - Added finite-number guards in `handlePositions` computation; returns `[]` when any coordinate is NaN.
  - Added extra safe-casting when rendering `cx/cy` circles.
- Added regression test:
  - `src/components/__tests__/EditableEdge.test.tsx` covers NaN input and asserts no `console.error`.

---

## Iteration 3 — Pro Workflow Engineer Upgrade (2026-03-25)

Goal: make the agent capable of creating ANY type of workflow a user may ask for — acting as a senior workflow developer/engineer.

### Changes applied

#### `backend/flowy_deepagents/WORKFLOW_TEMPLATES.md` — major rewrite
- Expanded from 7 templates to 20 templates covering:
  - All existing basic patterns (text→image, variations, image→video, full pipeline, reference edit, audio, 3D).
  - Conditional/decision-based workflows using `router`, `switch`, `conditionalSwitch`.
  - Iterative refinement chains (image→refine→refine→upscale).
  - Multi-source reference workflows (style ref + content ref + subject ref).
  - Brand/style consistency pipelines.
  - Full multimodal synthesis (image + audio + video in three parallel lanes).
  - Batch/high-count variant generation (4–8 variants, grid layout).
  - Ease curve → video motion control.
  - A/B decision preview with `switch` + `imageCompare`.
  - Annotation-documented complex workflows.
  - Upscale/post-process chains.
  - Frame extraction + restyle.
  - Prompt-only extraction mode (no graph mutation).
  - Minimal reset + rebuild with `clearCanvas`.
- Added `TOPOLOGY RULES` section: spatial layout defaults, group color semantics, wiring discipline, chain vs branch decision tree, execution targeting rules.

#### `backend/flowy_deepagents/AGENTS.md` — advanced engineering sections added
- New `Advanced Node Usage` section:
  - `router`, `switch`, `conditionalSwitch` usage rules and when to apply each.
  - `easeCurve` node: supported curve types, wiring to `generateVideo.easeCurve`.
  - `annotation` and `comment` documentation nodes: placement rules, never wire into data edges.
  - Chain vs Branch decision criteria.
  - Refinement chain depth limits.
  - Multi-modality synthesis lane organization.
  - `reference` handle strict enforcement rules.
- New `Workflow Engineering Mindset` section:
  - Design before emit: topology → stage count → operations.
  - Complexity budget (simple/moderate/complex thresholds).
  - Reuse-before-add strict rule.
  - Naming discipline for deterministic node IDs.
  - When to use `clearCanvas`.
- Expanded `Pre-Return Validation Checklist` from 6 to 10 items (added: single image input per gen node, annotation not in data edges, reference edge source/target constraints, deterministic IDs, dependency-ordered operations).

#### `backend/flowy_deepagents/GOAL_DECOMPOSER.md` — concrete examples added
- Added 6 concrete decomposition examples (A–F):
  - A: no decomposition (simple text-to-image).
  - B: no decomposition (parallel variants).
  - C: yes decomposition (chained modalities: image then video).
  - D: yes decomposition (complex multi-modal campaign: image + variants + video + audio + organize).
  - E: yes decomposition (refinement chain: base → lighting → upscale).
  - F: no decomposition (organization-only).

#### `backend/flowy_deepagents/content_writer.py` — prompt specialist stage upgraded
- `_run_prompt_specialist_stage` was a near-stub (only appended a timestamp). Now performs real rule-based enrichment:
  - Canvas state hints: empty/small/moderate/large graph → targeted guidance on reuse vs rebuild.
  - Modality detection: scans planner message for video/audio/3d/image keywords → injects modality-specific guidance.
  - Multi-modal detection: if 2+ modalities detected → hints to build separate generation lanes.
  - Topology strategy: detects variants/chain/conditional/annotate intent → injects topology pattern recommendation.
  - Execution intent: if `asksExecuteNodes` → reminds builder to set `executeNodeIds`.
  - Prompt-extraction-only: if `asksPromptExtractFromImageOnly` → tells builder not to emit graph ops.
  - Attachment hints: 1 attachment → reference mode hint; N attachments → role assignment guidance.
  - Video-specific hints: motion direction, camera, pacing, duration reminder; ease curve detection.
  - 3D hints: generate3d + glbViewer wiring reminder.
  - Exact variant count extraction: regex detects "N variation/variant/option" → tells builder exact branch count.
  - Function signature expanded to accept `workflow_state`, `intent_signals`, `attachments`, `model_catalog`.
  - Call site updated to pass all new parameters.

### Expected effect
- Agent can now handle complex multi-stage, multi-modal, and conditional workflow requests.
- Prompt specialist injects structured planning context before every builder invocation, reducing hallucinated topology.
- Goal decomposer has concrete examples for the LLM to follow for complex requests.
- Workflow templates cover all standard node combinations including advanced patterns.

---

## Iteration 2.4 Attachment Materialization Fix (UploadNode empty)

Issue observed:
- When the user attaches images to the chat Flow Agent, the backend can add a `mediaInput` upload node, but the node shows no image.

Root cause (confirmed by code inspection):
- `UploadNode` renders from `nodeData.image`.
- `backend/flowy_deepagents/content_writer.py` only populates `data.image` if it can resolve the planner-emitted `data.imageFromAttachmentId` to a real attachment entry.
- The planner sometimes emits an attachment reference that does not exactly match the backend-known `attachments[].id` (whitespace / numeric index / filename mismatch), so `_materialize_attachment_operations` left `imageFromAttachmentId` unresolved.

Fix applied:
- Updated `_materialize_attachment_operations` in `backend/flowy_deepagents/content_writer.py` to resolve attachments with safe heuristics:
  - trim + exact id match
  - numeric index match (`"0"`, `"1"`, ...)
  - filename match against `attachments[].name` when `data.filename` is present
  - single-attachment fallback (when only one attachment exists)

Expected effect:
- `mediaInput.data.image` will be populated reliably.
- UploadNode should display the attached images.
