# Backend Agent Reference

This document captures the current backend "Flowy" agent capabilities in `backend/` so future modifications can be made safely.

## 1) Backend Agent Entry Points

- Primary planner runtime: `backend/flowy_deepagents/content_writer.py`
- Legacy compatibility entrypoint: `backend/flowy_deep_agent_cli.py` (delegates to `content_writer.py`)
- MCP bridge server: `backend/flowy_mcp_server.py`
- Prompt/spec docs that shape behavior:
  - `backend/flowy_deepagents/AGENTS.md`
  - `backend/flowy_deepagents/ROUTER.md`
  - `backend/flowy_deepagents/PLAN_ADVISOR.md`
  - `backend/flowy_deepagents/GOAL_DECOMPOSER.md`
  - `backend/flowy_deepagents/WORKFLOW_TEMPLATES.md`
  - `backend/flowy_deepagents/subagents.yaml`

## 2) Core Runtime Modes

`content_writer.py` supports two modes via payload `agentMode`:

- `assist` (default):
  - Intended to generate canvas operations.
  - Can still route conversational requests unless canvas-control policy forces edit behavior.
- `plan`:
  - Chat/advisory mode only.
  - Returns guidance text without edit operations.

## 3) High-Level Processing Pipeline

For each request, the planner generally does:

1. Parse input payload:
   - `message`, `workflowState`, `selectedNodeIds`, `attachments`, `modelCatalog`, `canvasStateMemory`, `chatHistory`, `openflowUiSnapshot`, flags.
2. Build LLMs (provider/model resolution, API-key validation).
3. Extract user intent signals (toolbar/run/visual/etc).
4. Parse agent-control commands (`next_stage`, `goto_stage`, `run_now`, etc).
5. If control command is valid and confident enough: return control response immediately.
6. If in `plan` mode: run advisor-only response path.
7. In `assist` mode, optionally run intent router (`conversation` vs `canvas_edit`).
8. If routed to chat (and not policy-overridden): return chat response.
9. Else run staged planning:
   - Stage planner/decomposer
   - Prompt specialist shaping
   - Builder generation + normalization + optimization + validation/retries
10. Return final plan payload with safety policy, post-apply check, telemetry, and optional decomposition metadata.

## 4) Functional Components and What They Do

### 4.1 Router (Conversation vs Edit)

- Uses `ROUTER.md`.
- Classifies as:
  - `conversation`: advisory reply only
  - `canvas_edit`: proceed with planning operations
- Falls back safely if router output is malformed.

### 4.2 Agent Control Intent Parser

- Detects explicit control commands:
  - `none`, `next_stage`, `prev_stage`, `goto_stage`, `show_stages`,
    `clear_plan`, `stop`, `run_now`, `dismiss_changes`
- Requires:
  - `directCommand=true`
  - confidence >= `FLOWY_CONTROL_INTENT_THRESHOLD` (default 0.8)
- Emits control-only response with no operations when triggered.

### 4.3 User Intent Signals Extractor

Produces structured booleans/signals including:

- `visualAssessmentRequest`
- `planEditRequest`
- `asksUpscale`
- `asksSplitGrid`
- `asksExtractFrame`
- `asksModelTune`
- `asksEaseCurveEdit`
- `asksSwitchRulesEdit`
- `asksExecuteNodes`
- `canvasOperationHints` (ordered edit-operation type hints)
- `rationale`

These signals influence stage planning and toolbar validation logic.

### 4.4 Goal Decomposer

- Uses `GOAL_DECOMPOSER.md`.
- Decides if a request should be split into dependent stages.
- Output includes:
  - `shouldDecompose`
  - `stages[]` with `id/title/instruction/dependsOn/expectedOutput/requiresExecution`
  - `overallStrategy`
  - `estimatedComplexity`
- Supports revising decomposition when user requests plan edits and previous stages exist.

### 4.5 Plan Advisor (Chat-Only)

- Uses `PLAN_ADVISOR.md`.
- Produces advisory `assistantText` only.
- Used in:
  - explicit `plan` mode
  - some conversation/visual-assessment paths

### 4.6 Prompt Specialist Stage

- Adds continuity hints (for example from `canvasStateMemory.updatedAt`).
- Keeps planner message stable while nudging reuse/minimal-edits behavior.

### 4.7 Builder Stage (Operations Generator)

- Runs with system prompt assembled from:
  - `AGENTS.md`
  - `skills/flowy-plan/SKILL.md`
  - `WORKFLOW_TEMPLATES.md`
  - optional schema/model capability registry from `flowy_schema`
- Generates JSON operations with up to 3 attempts.
- On retries, feeds prior validation errors back into prompt.

Post-generation processing pipeline:

1. Materialize attachment-driven operations.
2. Normalize operation model/provider values against model catalog.
3. Optimize operations pre-validation (dedupe/structure cleanup and heuristics).
4. Validate edit operations and toolbar intent consistency.
5. Return successful plan or validation-failed payload with diagnostics.

### 4.8 Safety, Approval, and Verification

- Risk tier classification per operation (`safe`, `caution`, `destructive`).
- Destructive operations always require manual approval.
- Caution operations require approval when policy enabled:
  - payload flag `requireCautionApproval`
  - or env `FLOWY_REQUIRE_CAUTION_APPROVAL`
- Returns:
  - `safetyPolicy` (risk summary + policy flags)
  - `postApplyCheck` (predicted node/edge deltas, warnings)
  - `capabilityRegistry` (available node/edge/group context)
  - `telemetry` (router bypass, counts, validation status, etc)

## 5) Data Contracts and Key Output Fields

Primary planner responses include combinations of:

- `ok`
- `mode` (`chat`, `plan`, `control`)
- `assistantText`
- `operations`
- `uiCommands` (optional UI action list)
- `requiresApproval`
- `approvalReason`
- `executeNodeIds` (when generation should run)
- `runApprovalRequired`
- `intentSignals`
- `decomposition` (when staged plan is active)
- `safetyPolicy`
- `postApplyCheck`
- `telemetry`
- `debugLastText` / `validationErrors` on failures

## 6) Model/Provider Capabilities

Provider/model resolution behavior:

- Payload supports `provider` (`openai` or `google`) and `model`.
- If provider omitted:
  - infers `google` when model contains "gemini", else `openai`.
- Defaults model from env `FLOWY_PLANNER_MODEL` (`gpt-4.1-mini` if unset).
- OpenAI path requires `OPENAI_API_KEY`.
- Google path requires `GOOGLE_API_KEY` or `GEMINI_API_KEY`.
- Separate temperatures for planner and router model instances.

## 7) Environment Variables Used by Backend Agent

Common runtime controls:

- `FLOWY_PLANNER_MODEL`
- `FLOWY_PLANNER_MAX_OUTPUT_TOKENS`
- `FLOWY_SKIP_INTENT_ROUTER`
- `FLOWY_SKIP_DECOMPOSITION`
- `FLOWY_ENFORCE_CANVAS_CONTROL`
- `FLOWY_REQUIRE_CAUTION_APPROVAL`
- `FLOWY_CONTROL_INTENT_THRESHOLD`
- `FLOWY_CHAT_HISTORY_MAX_TURNS`
- `FLOWY_CHAT_HISTORY_MAX_CHARS`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY` / `GEMINI_API_KEY`

MCP server variable:

- `FLOWY_SITE_BASE_URL` (default `http://localhost:3000`)

## 8) MCP Server Functionalities (`flowy_mcp_server.py`)

The MCP server exposes tool-callable functionality:

- `ping`:
  - health check, returns `"pong"`
- `get_canvas_state`:
  - stub empty-state response (MVP fallback)
- `get_canvas_state_project(project_id)`:
  - fetches canvas state via website API (`/api/flowy/canvas-state`)
- `plan_edits(message, workflow_state, selected_node_ids)`:
  - local heuristic planner, returns operation plan with approval required
- `apply_edit_operations(operations)`:
  - operation-shape validator stub (does not persist canvas mutation)
- `plan_edits_web(...)`:
  - delegates planning to website `/api/flowy/plan`
- `plan_and_apply_edits_web(...)`:
  - plan via `/api/flowy/plan`, then apply via `/api/flowy/apply`
- `plan_edits_project(...)`:
  - plan against file-backed project (`projectId`)
- `plan_and_apply_edits_project(...)`:
  - plan+apply against file-backed project (`projectId`)

## 9) Heuristic Planner Behavior (MCP Local Fallback)

In MCP local fallback (`_heuristic_plan_edits`), behavior includes:

- Empty canvas:
  - builds minimal image or image-to-video chain depending on message keywords.
- Non-empty canvas:
  - prefers updating existing prompt nodes.
- Selected-node aware editing:
  - can update connected prompt nodes and wire selected image sources.
- Basic clear intents:
  - supports reset-like requests by removing nodes.
- Returns operations compatible with canvas edit-operation schema.

This fallback is useful for resilience but less capable than deep planner endpoint flow.

## 10) Subagent Role Definitions (`subagents.yaml`)

Defined conceptual roles and contracts:

- `parser`: intent and control normalization, operation-hint extraction.
- `planner`: stage strategy and objective framing.
- `prompt_specialist`: message enrichment/model hints without topology mutation.
- `builder`: deterministic operation generation + execute targets.
- `validator`: safety/risk/telemetry/post-apply checks.

These mirror the staged flow implemented in `content_writer.py`.

## 11) Current Limitations / Modification Notes

- MCP `apply_edit_operations` is currently a stub validator; true persistence occurs through website API routes.
- `get_canvas_state` (non-project) currently returns empty stub state.
- Conversation routing in assist mode can be overridden by canvas-control policy.
- Validation can fail despite syntactically valid JSON if operation semantics/toolbar intent checks do not pass.
- Planner behavior is strongly prompt-driven by markdown specs in `flowy_deepagents/`; edits there materially change outcomes.

## 12) Recommended Safe Change Strategy

When modifying backend agent behavior, prefer this order:

1. Update spec prompts (`ROUTER.md`, `PLAN_ADVISOR.md`, `GOAL_DECOMPOSER.md`, `AGENTS.md`) when behavior policy changes.
2. Update typed contracts/models in `content_writer.py` if response shape changes.
3. Update operation normalization/validation for any new node types or handle semantics.
4. Keep safety and approval rules explicit and test with both destructive and caution-tier operations.
5. If adding MCP capabilities, keep local stubs and web bridge behavior clearly separated.

## 13) Troubleshooting: `validation_failed` with Truncated LLM JSON

Symptom example:

- `validation_failed`
- debug output starts as valid JSON but ends mid-string/object, e.g. cut inside `operations[*].data.text`.

Why this happens:

- The model response gets cut (token/output truncation) while returning a large JSON payload.
- Common when prompts are very long and many nodes/variants are emitted in one response.

Current mitigation in backend:

- Builder now detects likely truncated JSON output (`truncated_json_output`) when text starts like planner JSON but does not close properly.
- Retry instructions now explicitly ask for compact JSON on truncation retries.
- Closing planner instruction now emphasizes compact payloads (short `assistantText`, avoid oversized text blobs in node data).

Operational suggestions:

- Reduce per-node prompt verbosity for multi-branch requests.
- Prefer staged generation (split into smaller steps) for 4+ heavy variants.
- If needed, raise planner output token budget via `FLOWY_PLANNER_MAX_OUTPUT_TOKENS`.

