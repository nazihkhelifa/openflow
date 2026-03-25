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
