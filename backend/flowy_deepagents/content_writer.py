#!/usr/bin/env python3
from __future__ import annotations

import functools
import json
import os
import sys
from collections import Counter
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union, cast

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage  # type: ignore
from langchain_openai import ChatOpenAI  # type: ignore
from pydantic import BaseModel, Field

from canvas_context import (
    build_canvas_context_for_llm,
    build_execution_digest_for_llm,
    load_planner_schema,
)
from connection_validation import handle_id_allowed, validate_planned_edge


FLOWY_DEEPAGENTS_DIR = os.path.join(os.path.dirname(__file__), "")


def _sanitize_text(value: str) -> str:
    """Replace invalid Unicode surrogates so UTF-8 writes never crash."""
    try:
        return value.encode("utf-8", errors="replace").decode("utf-8", errors="replace")
    except Exception:
        return value


def _sanitize_json_value(value: Any) -> Any:
    if isinstance(value, str):
        return _sanitize_text(value)
    if isinstance(value, list):
        return [_sanitize_json_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    return value


def _safe_json_dumps(value: Any, ensure_ascii: bool = False, indent: Optional[int] = None) -> str:
    return json.dumps(_sanitize_json_value(value), ensure_ascii=ensure_ascii, indent=indent)


def _safe_stream_write(stream: Any, text: str) -> None:
    try:
        stream.write(text)
    except UnicodeEncodeError:
        stream.write(_sanitize_text(text))


_STAGE_META: Dict[str, Dict[str, str]] = {
    "init": {"stageId": "analyze_request", "stageTitle": "Analyze request", "source": "planner"},
    "advisor": {"stageId": "build_plan", "stageTitle": "Plan advisor", "source": "planner"},
    "routing": {"stageId": "analyze_request", "stageTitle": "Classify intent", "source": "planner"},
    "decomposing": {"stageId": "build_plan", "stageTitle": "Decompose goal", "source": "planner"},
    "decomposed": {"stageId": "build_plan", "stageTitle": "Goal stages ready", "source": "planner"},
    "subagent_planner": {"stageId": "build_plan", "stageTitle": "Planner stage", "source": "planner"},
    "subagent_prompt_specialist": {
        "stageId": "build_plan",
        "stageTitle": "Prompt specialist stage",
        "source": "prompt_specialist",
    },
    "subagent_builder": {"stageId": "apply_canvas_ops", "stageTitle": "Builder stage", "source": "builder"},
    "planning": {"stageId": "apply_canvas_ops", "stageTitle": "Generate operations", "source": "builder"},
    "retrying": {"stageId": "apply_canvas_ops", "stageTitle": "Retry operations", "source": "builder"},
}


def _emit_progress(stage: str, detail: str = "") -> None:
    """Write a progress event to stderr (picked up by the Node.js API route for SSE)."""
    meta = _STAGE_META.get(stage, {})
    event = {
        "progress": stage,
        "detail": detail,
        "stageId": meta.get("stageId", stage),
        "stageTitle": meta.get("stageTitle", stage.replace("_", " ")),
        "status": "running",
        "source": meta.get("source", "planner"),
    }
    event_json = _safe_json_dumps(event, ensure_ascii=False)
    _safe_stream_write(sys.stderr, f"FLOWY_PROGRESS:{event_json}\n")
    sys.stderr.flush()


class RouterIntentModel(BaseModel):
    """Structured router output (OpenAI structured output / JSON schema)."""

    intent: Literal["conversation", "canvas_edit"]
    reply: str = ""
    reason: str = ""


# Edit-operation kinds the parser can prioritize (must stay aligned with planner_schema operationTypes).
CanvasOperationHint = Literal[
    "addNode",
    "removeNode",
    "clearCanvas",
    "updateNode",
    "addEdge",
    "removeEdge",
    "moveNode",
    "createGroup",
    "deleteGroup",
    "updateGroup",
    "setNodeGroup",
]

_CANVAS_OP_HINTS_SET: Set[str] = {
    "addNode",
    "removeNode",
    "clearCanvas",
    "updateNode",
    "addEdge",
    "removeEdge",
    "moveNode",
    "createGroup",
    "deleteGroup",
    "updateGroup",
    "setNodeGroup",
}


def _sanitize_canvas_operation_hints(raw: Any) -> List[CanvasOperationHint]:
    if not isinstance(raw, list):
        return []
    out: List[CanvasOperationHint] = []
    for x in raw[:16]:
        if isinstance(x, str) and x in _CANVAS_OP_HINTS_SET:
            out.append(cast(CanvasOperationHint, x))
    return out


class AgentControlIntentModel(BaseModel):
    intent: Literal[
        "none",
        "next_stage",
        "prev_stage",
        "goto_stage",
        "show_stages",
        "clear_plan",
        "stop",
        "run_now",
        "dismiss_changes",
    ] = "none"
    stageNumber: Optional[int] = None
    reply: str = ""
    reason: str = ""
    confidence: float = 0.0
    directCommand: bool = False


class UserIntentSignalsModel(BaseModel):
    visualAssessmentRequest: bool = False
    planEditRequest: bool = False
    asksUpscale: bool = False
    asksSplitGrid: bool = False
    asksExtractFrame: bool = False
    asksModelTune: bool = False
    asksEaseCurveEdit: bool = False
    asksSwitchRulesEdit: bool = False
    asksExecuteNodes: bool = Field(
        default=False,
        description="True when the user primarily wants to run/generate/execute existing nodes (not rewire the graph).",
    )
    canvasOperationHints: List[CanvasOperationHint] = Field(
        default_factory=list,
        description=(
            "Ordered list of EditOperation `type` values implied by the user message; "
            "first entry is the strongest signal. Empty when not a structural canvas edit."
        ),
    )
    rationale: str = ""


class FlowyPlanJsonModel(BaseModel):
    """Top-level planner JSON; operations stay as dicts for downstream validation."""

    assistantText: str = ""
    operations: List[Dict[str, Any]] = Field(default_factory=list)
    uiCommands: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Optional Openflow-only DOM automation; client executes after approval.",
    )
    requiresApproval: bool = True
    approvalReason: str = ""
    executeNodeIds: Optional[List[str]] = None
    runApprovalRequired: Optional[bool] = None


class CapabilityRegistryModel(BaseModel):
    nodeTypesPresent: List[str] = Field(default_factory=list)
    operationTypesSupported: List[str] = Field(default_factory=list)
    handleTypesSupported: List[str] = Field(default_factory=list)
    selectedNodeTypes: List[str] = Field(default_factory=list)
    canExecuteSelected: bool = False


class PostApplyVerificationModel(BaseModel):
    ok: bool = True
    predictedNodeDelta: int = 0
    predictedEdgeDelta: int = 0
    warnings: List[str] = Field(default_factory=list)


class PlanAdvisorJsonModel(BaseModel):
    assistantText: str = ""


class GoalStageModel(BaseModel):
    id: str = ""
    title: str = ""
    instruction: str = ""
    dependsOn: List[str] = Field(default_factory=list)
    expectedOutput: str = ""
    requiresExecution: bool = True


class GoalDecompositionModel(BaseModel):
    shouldDecompose: bool = False
    stages: List[GoalStageModel] = Field(default_factory=list)
    overallStrategy: str = ""
    estimatedComplexity: Literal["simple", "moderate", "complex"] = "simple"


def _normalize_chat_history(raw: Any) -> List[Dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: List[Dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        text = item.get("text")
        if role not in {"user", "assistant"}:
            continue
        if not isinstance(text, str) or not text.strip():
            continue
        out.append({"role": role, "text": text.strip()})
    return out


def _cap_chat_history(history: List[Dict[str, str]], max_turns: int, max_chars: int) -> List[Dict[str, str]]:
    if not history or max_turns <= 0:
        return []
    chunk = history[-max_turns:]
    total = 0
    kept_rev: List[Dict[str, str]] = []
    for turn in reversed(chunk):
        tlen = len(turn["text"]) + 24
        if total + tlen > max_chars and kept_rev:
            break
        kept_rev.append(turn)
        total += tlen
    return list(reversed(kept_rev))


def _history_to_langchain_messages(history: List[Dict[str, str]]) -> List[Union[HumanMessage, AIMessage]]:
    msgs: List[Union[HumanMessage, AIMessage]] = []
    for h in history:
        if h["role"] == "user":
            msgs.append(HumanMessage(content=h["text"]))
        else:
            msgs.append(AIMessage(content=h["text"]))
    return msgs


def _decompose_goal(
    model: Any,
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    chat_history: List[Dict[str, str]],
) -> Optional[GoalDecompositionModel]:
    """
    Run the goal decomposer to split complex goals into ordered stages.
    Returns None if decomposition is not needed or fails.
    """
    decomposer_md = _read_text_file("GOAL_DECOMPOSER.md").strip()
    if not decomposer_md:
        return None

    brief = _build_workflow_brief_for_router(workflow_state, selected_node_ids)
    user_content = (
        f"UserGoal:\n{message}\n\n"
        f"WorkflowBrief (JSON):\n{json.dumps(brief, ensure_ascii=False)}\n\n"
        "Return ONLY the JSON object."
    )
    lc_messages: List[Any] = [SystemMessage(content=decomposer_md)]
    lc_messages.extend(_history_to_langchain_messages(chat_history))
    lc_messages.append(HumanMessage(content=user_content))

    try:
        structured = model.with_structured_output(GoalDecompositionModel)
        result = structured.invoke(lc_messages)
        if isinstance(result, GoalDecompositionModel):
            return result if result.shouldDecompose and result.stages else None
    except Exception:
        pass

    try:
        resp = model.invoke(lc_messages, response_format={"type": "json_object"})
        raw = str(getattr(resp, "content", "") or "")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict) and data.get("shouldDecompose") and data.get("stages"):
            return GoalDecompositionModel(**data)
    except Exception:
        pass

    return None


def _revise_decomposition(
    model: Any,
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    chat_history: List[Dict[str, str]],
    prior_stages: List[GoalStageModel],
) -> Optional[GoalDecompositionModel]:
    """
    Revise an existing decomposition from user instructions
    (add/remove/reorder/update steps) and return a fresh stage list.
    """
    prior = [
        {
            "id": s.id,
            "title": s.title,
            "instruction": s.instruction,
            "dependsOn": s.dependsOn,
            "expectedOutput": s.expectedOutput,
            "requiresExecution": s.requiresExecution,
        }
        for s in prior_stages
    ]
    brief = _build_workflow_brief_for_router(workflow_state, selected_node_ids)
    system_prompt = (
        "You revise an existing stage plan for a node-based creative workflow.\n"
        "Return ONLY JSON matching GoalDecompositionModel.\n"
        "Keep stages concrete, minimal, and execution-ready.\n"
        "Respect the user's requested edits to steps (remove, add, reorder, replace).\n"
        "If user wants a totally different plan, replace the plan.\n"
        "Do not output markdown."
    )
    user_content = (
        f"UserPlanEditRequest:\n{message}\n\n"
        f"ExistingStages (JSON):\n{json.dumps(prior, ensure_ascii=False, indent=2)}\n\n"
        f"WorkflowBrief (JSON):\n{json.dumps(brief, ensure_ascii=False)}\n\n"
        "Return ONLY the JSON object."
    )
    lc_messages: List[Any] = [SystemMessage(content=system_prompt)]
    lc_messages.extend(_history_to_langchain_messages(chat_history))
    lc_messages.append(HumanMessage(content=user_content))

    try:
        structured = model.with_structured_output(GoalDecompositionModel)
        result = structured.invoke(lc_messages)
        if isinstance(result, GoalDecompositionModel) and result.shouldDecompose and result.stages:
            return result
    except Exception:
        pass

    try:
        resp = model.invoke(lc_messages, response_format={"type": "json_object"})
        raw = str(getattr(resp, "content", "") or "")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict) and data.get("shouldDecompose") and data.get("stages"):
            return GoalDecompositionModel(**data)
    except Exception:
        pass
    return None


@functools.lru_cache(maxsize=1)
def _planner_allowlists() -> Tuple[Set[str], Set[str], Set[str]]:
    """Allowlists from src/lib/flowy/planner_schema.json (repo root relative)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    schema = load_planner_schema(script_dir)
    nodes = set(str(x) for x in (schema.get("nodeTypes") or []))
    handles = set(str(x) for x in (schema.get("handleTypes") or []))
    handles |= set(str(x) for x in (schema.get("extraHandleIds") or []))
    ops = set(str(x) for x in (schema.get("operationTypes") or []))
    if not nodes or not handles or not ops:
        raise ValueError("planner_schema.json missing nodeTypes, handleTypes, or operationTypes")
    return nodes, handles, ops


def _read_stdin_json() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return cast(Dict[str, Any], _sanitize_json_value(json.loads(raw)))


def _coerce_image_attachments(raw_attachments: Any) -> List[Dict[str, str]]:
    """
    Accept attachments from UI and keep only safe image data URLs.
    Each output item: {id, name, mimeType, dataUrl}
    """
    out: List[Dict[str, str]] = []
    if not isinstance(raw_attachments, list):
        return out
    for i, item in enumerate(raw_attachments):
        if not isinstance(item, dict):
            continue
        data_url = str(item.get("dataUrl") or "")
        is_data_image = data_url.startswith("data:image/")
        is_http_image = data_url.startswith("http://") or data_url.startswith("https://")
        if not (is_data_image or is_http_image):
            continue
        att_id = str(item.get("id") or f"att-{i+1}")
        out.append(
            {
                "id": att_id,
                "name": str(item.get("name") or att_id),
                "mimeType": str(item.get("mimeType") or "image/*"),
                "dataUrl": data_url,
            }
        )
    return out


def _build_human_message_with_attachments(
    text_prompt: str, attachments: List[Dict[str, str]]
) -> HumanMessage:
    if not attachments:
        return HumanMessage(content=text_prompt)
    content: List[Dict[str, Any]] = [{"type": "text", "text": text_prompt}]
    for att in attachments[:6]:
        content.append({"type": "image_url", "image_url": {"url": att["dataUrl"]}})
    return HumanMessage(content=content)


def _materialize_attachment_operations(
    operations: List[Dict[str, Any]], attachments: List[Dict[str, str]]
) -> List[Dict[str, Any]]:
    """
    Planner can emit addNode mediaInput with:
      data.imageFromAttachmentId = "<id>"
    We rewrite it to concrete image payload:
      data.image = "data:image/..."
      data.mode = "image"
      data.filename = attachment name
    """
    if not attachments:
        return operations
    by_id = {a["id"]: a for a in attachments}
    out: List[Dict[str, Any]] = []
    for op in operations:
        if (
            isinstance(op, dict)
            and op.get("type") == "addNode"
            and op.get("nodeType") == "mediaInput"
            and isinstance(op.get("data"), dict)
        ):
            data = dict(op["data"])
            att_id = data.get("imageFromAttachmentId")
            if isinstance(att_id, str) and att_id in by_id:
                att = by_id[att_id]
                data["mode"] = "image"
                data["image"] = att["dataUrl"]
                if not data.get("filename"):
                    data["filename"] = att["name"]
                data.pop("imageFromAttachmentId", None)
                out.append({**op, "data": data})
                continue
        out.append(op)
    return out


def _coerce_model_catalog(raw: Any) -> Dict[str, List[Dict[str, str]]]:
    out: Dict[str, List[Dict[str, str]]] = {}
    if not isinstance(raw, dict):
        return out
    for node_type, entries in raw.items():
        if not isinstance(node_type, str) or not isinstance(entries, list):
            continue
        cleaned: List[Dict[str, str]] = []
        for e in entries:
            if not isinstance(e, dict):
                continue
            provider = str(e.get("provider") or "").strip()
            model_id = str(e.get("modelId") or "").strip()
            display = str(e.get("displayName") or model_id).strip()
            if not model_id:
                continue
            cleaned.append({"provider": provider, "modelId": model_id, "displayName": display})
        if cleaned:
            out[node_type] = cleaned
    return out


def _coerce_canvas_state_memory(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    out: Dict[str, Any] = {}
    if "previous" in raw:
        out["previous"] = raw.get("previous")
    if "current" in raw:
        out["current"] = raw.get("current")
    if isinstance(raw.get("updatedAt"), (int, float)):
        out["updatedAt"] = int(raw["updatedAt"])
    return out


def _pick_best_model_alias(raw_value: str, candidates: List[Dict[str, str]]) -> Optional[Dict[str, str]]:
    query = (raw_value or "").strip().lower()
    if not query or not candidates:
        return None
    query_norm = query.replace("-", "").replace("_", "").replace(" ", "")
    best_score = -1
    best: Optional[Dict[str, str]] = None
    for c in candidates:
        model_id = (c.get("modelId") or "").lower()
        display = (c.get("displayName") or "").lower()
        provider = (c.get("provider") or "").lower()
        hay = " ".join([model_id, display, provider]).strip()
        hay_norm = hay.replace("-", "").replace("_", "").replace(" ", "")
        score = 0
        if query == model_id or query == display:
            score += 100
        if query in hay:
            score += 40
        if query_norm == hay_norm:
            score += 80
        if query_norm in hay_norm:
            score += 30
        for token in [t for t in query.split() if len(t) > 1]:
            if token in hay:
                score += 8
        if score > best_score:
            best_score = score
            best = c
    return best if best_score > 0 else None


def _normalize_operation_models(
    operations: List[Dict[str, Any]], model_catalog: Dict[str, List[Dict[str, str]]]
) -> List[Dict[str, Any]]:
    if not operations or not model_catalog:
        return operations
    out: List[Dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict):
            out.append(op)
            continue
        op_type = op.get("type")
        if op_type not in {"addNode", "updateNode"}:
            out.append(op)
            continue
        node_type = op.get("nodeType") if op_type == "addNode" else None
        data = op.get("data")
        if not isinstance(data, dict):
            out.append(op)
            continue
        resolved_node_type = node_type
        if op_type == "updateNode" and isinstance(op.get("nodeType"), str):
            resolved_node_type = op.get("nodeType")
        if not isinstance(resolved_node_type, str):
            # Try broad matching when nodeType is absent (common in updateNode).
            # We'll use a merged candidate pool and still write exact selectedModel.
            merged_candidates: List[Dict[str, str]] = []
            for vals in model_catalog.values():
                merged_candidates.extend(vals)
            candidates = merged_candidates
        else:
            candidates = model_catalog.get(resolved_node_type, [])
        if not candidates:
            out.append(op)
            continue
        next_data = dict(data)
        raw_model = None
        if isinstance(next_data.get("model"), str):
            raw_model = next_data.get("model")
        elif isinstance(next_data.get("selectedModel"), dict):
            sm = next_data.get("selectedModel") or {}
            if isinstance(sm.get("modelId"), str):
                raw_model = sm.get("modelId")
            elif isinstance(sm.get("displayName"), str):
                raw_model = sm.get("displayName")
        if isinstance(raw_model, str):
            chosen = _pick_best_model_alias(raw_model, candidates)
            if chosen:
                next_data["selectedModel"] = {
                    "provider": chosen.get("provider") or "",
                    "modelId": chosen.get("modelId") or "",
                    "displayName": chosen.get("displayName") or chosen.get("modelId") or "",
                }
                # Keep legacy model field aligned for nodes that still use it.
                next_data["model"] = chosen.get("modelId") or raw_model
        out.append({**op, "data": next_data})
    return out


def _effective_aspect_ratio_on_canvas(existing: Dict[str, Any], existing_data: Dict[str, Any]) -> Optional[str]:
    """
    Align no-op detection with ImageNode.tsx / ControlPanel:
    - Gemini: top-level data.aspectRatio
    - External (replicate/fal/kie): prefer parameters.aspect_ratio (etc.), then top-level
    """
    sm = existing_data.get("selectedModel")
    prov = str((sm or {}).get("provider") or "").strip() if isinstance(sm, dict) else ""
    is_gemini = not prov or prov == "gemini"
    if is_gemini:
        ar = existing_data.get("aspectRatio")
        return ar.strip() if isinstance(ar, str) and ar.strip() else None
    params = existing_data.get("parameters")
    if isinstance(params, dict):
        for key in ("aspect_ratio", "aspectRatio", "output_aspect_ratio", "ratio"):
            val = params.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    ar2 = existing_data.get("aspectRatio")
    return ar2.strip() if isinstance(ar2, str) and ar2.strip() else None


def _optimize_operations_pre_validation(
    operations: List[Dict[str, Any]],
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
) -> List[Dict[str, Any]]:
    """
    Generalized optimizer pass before validation/apply.
    Goals:
    - Reuse existing graph where safe
    - Remove obvious redundant operations
    - Keep deterministic order and semantics
    """
    if not isinstance(operations, list) or not operations:
        return operations

    nodes = [n for n in (workflow_state.get("nodes") or []) if isinstance(n, dict)]
    node_by_id: Dict[str, Dict[str, Any]] = {str(n.get("id")): n for n in nodes if n.get("id")}

    selected_prompt_ids = [
        str(n.get("id"))
        for n in nodes
        if n.get("type") == "prompt" and str(n.get("id")) in set(selected_node_ids or [])
    ]
    any_prompt_ids = [str(n.get("id")) for n in nodes if n.get("type") == "prompt" and n.get("id")]

    planned_id_remap: Dict[str, str] = {}
    planned_prompt_adds = [
        op
        for op in operations
        if isinstance(op, dict) and op.get("type") == "addNode" and op.get("nodeType") == "prompt"
    ]
    allow_prompt_reuse = len(planned_prompt_adds) <= 1

    # Phase A: prompt-node reuse transformation (safe / high-value case)
    transformed: List[Dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict):
            transformed.append(op)
            continue
        if op.get("type") != "addNode" or op.get("nodeType") != "prompt":
            transformed.append(op)
            continue
        if not allow_prompt_reuse:
            # Variation/branch plans often need one prompt node per branch.
            # Do not collapse multiple planned prompt nodes into one reused node.
            transformed.append(op)
            continue
        data = op.get("data")
        planned_id = op.get("nodeId")
        if not isinstance(data, dict) or not isinstance(planned_id, str):
            transformed.append(op)
            continue
        prompt_text = data.get("prompt")
        if not isinstance(prompt_text, str) or not prompt_text.strip():
            transformed.append(op)
            continue

        reusable_prompt_id = (
            selected_prompt_ids[0] if selected_prompt_ids else (any_prompt_ids[0] if any_prompt_ids else None)
        )
        if not reusable_prompt_id:
            transformed.append(op)
            continue

        planned_id_remap[planned_id] = reusable_prompt_id
        transformed.append(
            {
                "type": "updateNode",
                "nodeId": reusable_prompt_id,
                "data": {"prompt": prompt_text},
            }
        )

    # Remap references to reused IDs
    def _map_id(raw_id: Any) -> Any:
        if isinstance(raw_id, str) and raw_id in planned_id_remap:
            return planned_id_remap[raw_id]
        return raw_id

    remapped: List[Dict[str, Any]] = []
    for op in transformed:
        if not isinstance(op, dict):
            remapped.append(op)
            continue
        t = op.get("type")
        if t == "addEdge":
            remapped.append(
                {
                    **op,
                    "source": _map_id(op.get("source")),
                    "target": _map_id(op.get("target")),
                }
            )
        elif t in {"updateNode", "removeNode", "moveNode", "setNodeGroup"}:
            remapped.append({**op, "nodeId": _map_id(op.get("nodeId"))})
        elif t == "createGroup" and isinstance(op.get("nodeIds"), list):
            remapped.append({**op, "nodeIds": [_map_id(x) for x in op.get("nodeIds", [])]})
        else:
            remapped.append(op)

    # Phase B: merge repeated updateNode operations for same node
    merged_updates: List[Dict[str, Any]] = []
    pending_update_by_node: Dict[str, Dict[str, Any]] = {}

    def _flush_update(node_id: str) -> None:
        upd = pending_update_by_node.pop(node_id, None)
        if upd:
            merged_updates.append(upd)

    for op in remapped:
        if not isinstance(op, dict):
            continue
        if op.get("type") == "updateNode" and isinstance(op.get("nodeId"), str) and isinstance(op.get("data"), dict):
            node_id = op["nodeId"]
            prev = pending_update_by_node.get(node_id)
            if prev is None:
                pending_update_by_node[node_id] = dict(op)
            else:
                merged = dict(prev)
                merged_data = dict(prev.get("data") or {})
                merged_data.update(op.get("data") or {})
                merged["data"] = merged_data
                pending_update_by_node[node_id] = merged
            continue
        # Preserve order boundary: flush updates before non-update op
        for nid in list(pending_update_by_node.keys()):
            _flush_update(nid)
        merged_updates.append(op)

    for nid in list(pending_update_by_node.keys()):
        _flush_update(nid)

    # Phase C: remove no-op updates and dedupe edges
    out: List[Dict[str, Any]] = []
    seen_edges: Set[Tuple[str, str, str, str]] = set()

    for op in merged_updates:
        if not isinstance(op, dict):
            continue
        t = op.get("type")
        if t == "updateNode":
            node_id = op.get("nodeId")
            data = op.get("data")
            if not isinstance(node_id, str) or not isinstance(data, dict):
                continue
            existing = node_by_id.get(node_id)
            if isinstance(existing, dict) and isinstance(existing.get("data"), dict):
                existing_data = existing.get("data") or {}
                no_change = True
                for k, v in data.items():
                    if (
                        k == "aspectRatio"
                        and str(existing.get("type") or "") == "generateImage"
                    ):
                        eff = _effective_aspect_ratio_on_canvas(existing, existing_data)
                        want = v.strip() if isinstance(v, str) else v
                        if eff != want:
                            no_change = False
                            continue
                        sm = existing_data.get("selectedModel")
                        prov = (
                            str((sm or {}).get("provider") or "").strip()
                            if isinstance(sm, dict)
                            else ""
                        )
                        top_ar = existing_data.get("aspectRatio")
                        top_s = top_ar.strip() if isinstance(top_ar, str) else None
                        # External UIs often read parameters.* only; top-level aspectRatio can lag.
                        # If effective aspect already matches but top-level differs, keep the update.
                        if prov and prov != "gemini" and top_s != want:
                            no_change = False
                        continue
                    if existing_data.get(k) != v:
                        no_change = False
                        break
                if no_change:
                    continue
            out.append(op)
            continue
        if t == "addEdge":
            source = str(op.get("source") or "")
            target = str(op.get("target") or "")
            sh = str(op.get("sourceHandle") or "")
            th = str(op.get("targetHandle") or "")
            key = (source, target, sh, th)
            if key in seen_edges:
                continue
            seen_edges.add(key)
            out.append(op)
            continue
        if t == "clearCanvas":
            seen_edges.clear()
            out.append(op)
            continue
        out.append(op)

    return out


def _safe_extract_first_json_object(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    snippet = text[start : end + 1]
    try:
        return json.loads(snippet)
    except Exception:
        # If the snippet isn't valid JSON, return empty so the caller can
        # respond with invalid_json_or_empty instead of crashing.
        return {}


def _validate_edge_handles(
    source_handle: Optional[str],
    target_handle: Optional[str],
    schema: Dict[str, Any],
) -> Optional[str]:
    if not source_handle or not str(source_handle).strip():
        return "sourceHandle is required."
    if not target_handle or not str(target_handle).strip():
        return "targetHandle is required."
    sh = str(source_handle).strip()
    th = str(target_handle).strip()
    if not handle_id_allowed(sh, schema):
        return f"Invalid sourceHandle '{sh}'."
    if not handle_id_allowed(th, schema):
        return f"Invalid targetHandle '{th}'."
    return None


def _validate_edit_operations(operations: List[Dict[str, Any]], workflow_state: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    allowed_nodes, _handles, allowed_ops = _planner_allowlists()

    if not isinstance(operations, list):
        return {"ok": False, "errors": ["operations must be a list"]}

    initial_nodes = workflow_state.get("nodes") or []
    initial_edges = workflow_state.get("edges") or []

    initial_node_ids = {n.get("id") for n in initial_nodes if isinstance(n, dict) and n.get("id")}
    initial_edge_ids = {e.get("id") for e in initial_edges if isinstance(e, dict) and e.get("id")}

    # Simulate node presence in plan order so clearCanvas / removeNode / addNode chains validate correctly.
    sim_nodes: set[str] = set(initial_node_ids)
    sim_meta: Dict[str, Dict[str, Any]] = {}
    for n in initial_nodes:
        if not isinstance(n, dict):
            continue
        nid = n.get("id")
        if not nid:
            continue
        ns = str(nid)
        sim_meta[ns] = {
            "id": ns,
            "type": n.get("type"),
            "data": n.get("data") if isinstance(n.get("data"), dict) else {},
        }

    script_dir = os.path.dirname(os.path.abspath(__file__))
    planner_schema = load_planner_schema(script_dir)

    for idx, op in enumerate(operations):
        if not isinstance(op, dict):
            errors.append(f"operations[{idx}] must be an object")
            continue

        op_type = op.get("type")
        if op_type not in allowed_ops:
            errors.append(f"operations[{idx}].type invalid: {op_type}")
            continue

        if op_type == "addNode":
            node_type = op.get("nodeType")
            node_id = op.get("nodeId")
            type_ok = node_type in allowed_nodes
            if not type_ok:
                errors.append(f"operations[{idx}].nodeType invalid: {node_type}")
            id_ok = isinstance(node_id, str) and bool(node_id)
            if not id_ok:
                errors.append(f"operations[{idx}].nodeId is required for subsequent ops (missing).")
            elif node_id in sim_nodes:
                errors.append(f"operations[{idx}].nodeId already exists: {node_id}")
                id_ok = False
            if type_ok and id_ok:
                sim_nodes.add(node_id)
                sim_meta[str(node_id)] = {
                    "id": str(node_id),
                    "type": node_type,
                    "data": op.get("data") if isinstance(op.get("data"), dict) else {},
                }

        elif op_type == "removeNode":
            node_id = op.get("nodeId")
            if not node_id or node_id not in sim_nodes:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            else:
                sim_nodes.discard(node_id)
                sim_meta.pop(str(node_id), None)

        elif op_type == "updateNode":
            node_id = op.get("nodeId")
            if not node_id or node_id not in sim_nodes:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            data = op.get("data")
            if not isinstance(data, dict):
                errors.append(f"operations[{idx}].data must be an object")

        elif op_type == "addEdge":
            source = op.get("source")
            target = op.get("target")
            if not source or source not in sim_nodes:
                errors.append(f"operations[{idx}].source nodeId not found: {source}")
            if not target or target not in sim_nodes:
                errors.append(f"operations[{idx}].target nodeId not found: {target}")

            sh = op.get("sourceHandle")
            th = op.get("targetHandle")
            handle_error = _validate_edge_handles(sh, th, planner_schema)
            if handle_error:
                errors.append(f"operations[{idx}] edge handle error: {handle_error}")
            else:
                sem_err = validate_planned_edge(
                    str(source),
                    str(target),
                    str(sh) if sh is not None else None,
                    str(th) if th is not None else None,
                    list(sim_meta.values()),
                )
                if sem_err:
                    errors.append(f"operations[{idx}] edge semantics: {sem_err}")

        elif op_type == "removeEdge":
            edge_id = op.get("edgeId")
            if not edge_id or edge_id not in initial_edge_ids:
                errors.append(f"operations[{idx}].edgeId not found: {edge_id}")

        elif op_type == "moveNode":
            node_id = op.get("nodeId")
            pos = op.get("position")
            if not node_id or node_id not in sim_nodes:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            if not isinstance(pos, dict) or not isinstance(pos.get("x"), (int, float)) or not isinstance(pos.get("y"), (int, float)):
                errors.append(f"operations[{idx}].position must be an object with numeric x/y")

        elif op_type == "createGroup":
            node_ids = op.get("nodeIds")
            if not isinstance(node_ids, list) or len(node_ids) == 0:
                errors.append(f"operations[{idx}].nodeIds must be a non-empty list")
            else:
                for nid in node_ids:
                    if nid not in sim_nodes:
                        errors.append(f"operations[{idx}] nodeIds contains unknown nodeId: {nid}")
            color = op.get("color")
            if color is not None and color not in {"neutral", "blue", "green", "purple", "orange", "red"}:
                errors.append(f"operations[{idx}].color invalid: {color}")

        elif op_type == "deleteGroup":
            group_id = op.get("groupId")
            if not isinstance(group_id, str) or not group_id.strip():
                errors.append(f"operations[{idx}].groupId is required")

        elif op_type == "updateGroup":
            group_id = op.get("groupId")
            updates = op.get("updates")
            if not isinstance(group_id, str) or not group_id.strip():
                errors.append(f"operations[{idx}].groupId is required")
            if not isinstance(updates, dict):
                errors.append(f"operations[{idx}].updates must be an object")

        elif op_type == "setNodeGroup":
            node_id = op.get("nodeId")
            group_id = op.get("groupId")
            if not node_id or node_id not in sim_nodes:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            if group_id is not None and not isinstance(group_id, str):
                errors.append(f"operations[{idx}].groupId must be string or null")

        elif op_type == "clearCanvas":
            extra = [k for k in op.keys() if k != "type"]
            if extra:
                errors.append(f"operations[{idx}] clearCanvas must not include extra keys: {sorted(extra)}")
            sim_nodes.clear()
            sim_meta.clear()

    return {"ok": not errors, "errors": errors}


def _validate_toolbar_intent_plan(
    message: str,
    parsed: Dict[str, Any],
    operations: List[Dict[str, Any]],
    workflow_state: Optional[Dict[str, Any]] = None,
    selected_node_ids: Optional[List[str]] = None,
    intent_signals: Optional[UserIntentSignalsModel] = None,
) -> Dict[str, Any]:
    """
    Validate that common toolbar requests are expressed with the expected
    operation pattern so the UI can apply them deterministically.
    """
    errors: List[str] = []
    add_nodes = [op for op in operations if isinstance(op, dict) and op.get("type") == "addNode"]
    add_edges = [op for op in operations if isinstance(op, dict) and op.get("type") == "addEdge"]
    update_nodes = [op for op in operations if isinstance(op, dict) and op.get("type") == "updateNode"]
    execute_ids = parsed.get("executeNodeIds")
    execute_ids_list = execute_ids if isinstance(execute_ids, list) else []

    asks_upscale = bool(intent_signals and intent_signals.asksUpscale)
    asks_grid = bool(intent_signals and intent_signals.asksSplitGrid)
    asks_extract_frame = bool(intent_signals and intent_signals.asksExtractFrame)
    asks_model_tune = bool(intent_signals and intent_signals.asksModelTune)
    asks_ease = bool(intent_signals and intent_signals.asksEaseCurveEdit)
    asks_switch_rules = bool(intent_signals and intent_signals.asksSwitchRulesEdit)

    if asks_upscale:
        has_upscale_add = any(op.get("nodeType") == "generateImage" for op in add_nodes)
        has_image_edge = any(
            op.get("sourceHandle") == "image" and op.get("targetHandle") == "image"
            for op in add_edges
        )
        if not has_upscale_add:
            errors.append("Upscale request must add a generateImage node.")
        if not has_image_edge:
            errors.append("Upscale request must connect image -> image edge.")
        if len(execute_ids_list) == 0:
            errors.append("Upscale request must include executeNodeIds for the new node.")

    if asks_grid:
        media_adds = [op for op in add_nodes if op.get("nodeType") == "mediaInput"]
        ref_edges = [
            op
            for op in add_edges
            if op.get("targetHandle") == "reference"
        ]
        if len(media_adds) < 2:
            errors.append("Split-grid request should add multiple mediaInput nodes.")
        if len(ref_edges) < 2:
            errors.append("Split-grid request should add reference edges to grid nodes.")

    if asks_extract_frame:
        has_media_add = any(op.get("nodeType") == "mediaInput" for op in add_nodes)
        has_reference_edge = any(op.get("targetHandle") == "reference" for op in add_edges)
        if not has_media_add:
            errors.append("Extract-frame request must add a mediaInput node.")
        if not has_reference_edge:
            errors.append("Extract-frame request must add a reference edge to the frame node.")

    if asks_model_tune and len(update_nodes) == 0:
        nodes = (workflow_state or {}).get("nodes") if isinstance(workflow_state, dict) else []
        selected = set(selected_node_ids or [])
        tunable_types = {"generateImage", "generateVideo", "generate3d", "generateAudio", "prompt"}
        has_selected_tunable = any(
            isinstance(n, dict)
            and n.get("id") in selected
            and n.get("type") in tunable_types
            for n in (nodes or [])
        )
        has_any_tunable = any(
            isinstance(n, dict) and n.get("type") in tunable_types
            for n in (nodes or [])
        )
        # Only enforce updateNode when there's an existing tunable node to edit.
        # On empty/new canvases, allowing addNode plans avoids false validation failures.
        # If the optimizer dropped all ops as no-ops (canvas already matches), len(operations)==0 — accept.
        if (has_selected_tunable or has_any_tunable) and len(operations) > 0:
            errors.append("Model/settings request should include updateNode operations.")

    if asks_ease:
        touched_ease = any(
            isinstance(op.get("data"), dict)
            and any(k in op.get("data", {}) for k in ["bezierHandles", "easingPreset", "outputDuration"])
            for op in update_nodes
        )
        if not touched_ease:
            errors.append(
                "Ease-curve request should update bezierHandles/easingPreset/outputDuration via updateNode."
            )

    if asks_switch_rules:
        touched_rules = any(
            isinstance(op.get("data"), dict) and "rules" in op.get("data", {})
            for op in update_nodes
        )
        if not touched_rules:
            errors.append("Conditional-switch rule request should update rules via updateNode.")

    return {"ok": not errors, "errors": errors}


def _coerce_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    raw = str(value).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _operations_require_manual_approval(operations: Any) -> bool:
    if not isinstance(operations, list):
        return False
    destructive_ops = {"removeNode", "removeEdge", "deleteGroup", "clearCanvas"}
    for op in operations:
        if isinstance(op, dict) and str(op.get("type") or "") in destructive_ops:
            return True
    return False


def _operation_risk_tier(op: Dict[str, Any]) -> str:
    op_type = str(op.get("type") or "")
    if op_type in {"removeNode", "removeEdge", "deleteGroup", "clearCanvas"}:
        return "destructive"
    if op_type in {"updateNode", "moveNode", "updateGroup", "setNodeGroup"}:
        return "caution"
    return "safe"


def _summarize_operation_risks(operations: Any) -> Dict[str, int]:
    summary = {"safe": 0, "caution": 0, "destructive": 0}
    if not isinstance(operations, list):
        return summary
    for op in operations:
        if not isinstance(op, dict):
            continue
        tier = _operation_risk_tier(op)
        if tier in summary:
            summary[tier] += 1
    return summary


def _build_capability_registry(
    workflow_state: Dict[str, Any], selected_node_ids: List[str]
) -> CapabilityRegistryModel:
    _allowed_nodes, allowed_handles, allowed_ops = _planner_allowlists()
    nodes = [n for n in (workflow_state.get("nodes") or []) if isinstance(n, dict)]
    selected = set(selected_node_ids or [])
    selected_types: List[str] = []
    for n in nodes:
        nid = str(n.get("id") or "")
        ntype = str(n.get("type") or "")
        if nid and nid in selected and ntype:
            selected_types.append(ntype)
    can_execute_selected = any(
        t in {"generateImage", "generateVideo", "generate3d", "generateAudio", "llm", "codeRunner"}
        for t in selected_types
    )
    present_types = sorted(
        {str(n.get("type") or "") for n in nodes if isinstance(n.get("type"), str) and str(n.get("type")).strip()}
    )
    return CapabilityRegistryModel(
        nodeTypesPresent=present_types,
        operationTypesSupported=sorted(allowed_ops),
        handleTypesSupported=sorted(allowed_handles),
        selectedNodeTypes=sorted(set(selected_types)),
        canExecuteSelected=can_execute_selected,
    )


def _build_post_apply_verification(
    workflow_state: Dict[str, Any], operations: Any
) -> PostApplyVerificationModel:
    if not isinstance(operations, list):
        return PostApplyVerificationModel(ok=False, warnings=["operations_missing_or_invalid"])
    nodes_before = len([n for n in (workflow_state.get("nodes") or []) if isinstance(n, dict)])
    edges_before = len([e for e in (workflow_state.get("edges") or []) if isinstance(e, dict)])
    sim_n = nodes_before
    sim_e = edges_before
    warnings: List[str] = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        t = str(op.get("type") or "")
        if t == "addNode":
            sim_n += 1
        elif t == "removeNode":
            sim_n -= 1
        elif t == "addEdge":
            sim_e += 1
        elif t == "removeEdge":
            sim_e -= 1
        elif t == "clearCanvas":
            sim_n = 0
            sim_e = 0
        if sim_n < 0:
            warnings.append("predicted_negative_node_count")
        if sim_e < 0:
            warnings.append("predicted_negative_edge_count")
    warnings = list(dict.fromkeys(warnings))
    predicted_node_delta = sim_n - nodes_before
    predicted_edge_delta = sim_e - edges_before
    return PostApplyVerificationModel(
        ok=len(warnings) == 0,
        predictedNodeDelta=predicted_node_delta,
        predictedEdgeDelta=predicted_edge_delta,
        warnings=warnings,
    )


def _read_text_file(rel_path: str) -> str:
    abs_path = os.path.join(FLOWY_DEEPAGENTS_DIR, rel_path)
    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def _build_system_prompt() -> str:
    agents_md = _read_text_file("AGENTS.md").strip()
    skill_md = _read_text_file(os.path.join("skills", "flowy-plan", "SKILL.md")).strip()
    templates_md = _read_text_file("WORKFLOW_TEMPLATES.md").strip()
    base = agents_md + ("\n\nSkill:\n" + skill_md if skill_md else "")

    if templates_md:
        base += "\n\n" + templates_md

    try:
        schema = load_planner_schema(os.path.dirname(os.path.abspath(__file__)))
        model_caps = schema.get("modelCapabilities")
        model_rules = schema.get("modelSelectionRules")
        if model_caps or model_rules:
            registry_parts: List[str] = ["\n\n## Available Model Registry"]
            if model_caps:
                registry_parts.append(json.dumps(model_caps, ensure_ascii=False, indent=2))
            if model_rules:
                registry_parts.append("Selection defaults: " + json.dumps(model_rules, ensure_ascii=False))
            base += "\n".join(registry_parts)
        ref_bundle: Dict[str, Any] = {}
        for _k in (
            "aspectRatioPolicy",
            "socialPlatformPresets",
            "videoOutputGuidance",
            "modelFallbackChains",
        ):
            _v = schema.get(_k)
            if _v:
                ref_bundle[_k] = _v
        if ref_bundle:
            base += (
                "\n\n## Structured planner reference (JSON — aspect ratio, social presets, model fallbacks)\n"
                + json.dumps(ref_bundle, ensure_ascii=False, indent=2)
            )
    except Exception:
        pass

    return base


def _build_workflow_brief_for_router(
    workflow_state: Dict[str, Any], selected_node_ids: List[str]
) -> Dict[str, Any]:
    """Small summary for intent routing (no heavy node data)."""
    nodes = [n for n in (workflow_state.get("nodes") or []) if isinstance(n, dict)]
    edges = [e for e in (workflow_state.get("edges") or []) if isinstance(e, dict)]
    types = [str(n.get("type") or "unknown") for n in nodes]
    type_counts: Dict[str, int] = dict(Counter(types).most_common(24))
    sample: List[Dict[str, Any]] = []
    for n in nodes[:56]:
        nid = n.get("id")
        if nid:
            sample.append({"id": str(nid), "type": n.get("type")})
    groups = workflow_state.get("groups")
    group_count = len(groups) if isinstance(groups, dict) else 0
    return {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "groupCount": group_count,
        "selectedNodeIds": list(selected_node_ids),
        "nodeTypeCounts": type_counts,
        "nodesSample": sample,
        "nodesSampleIsPartial": len(nodes) > len(sample),
        "nearEmptyCanvas": len(nodes) <= 1,
    }


def _classify_user_intent(
    router_model: Any,
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    chat_history: List[Dict[str, str]],
) -> Optional[Dict[str, Any]]:
    """
    LLM router: conversation vs canvas_edit.
    Returns None if routing should be skipped / failed (caller falls back to planning).
    """
    msg = (message or "").strip()
    if not msg:
        return None

    router_md = _read_text_file("ROUTER.md").strip()
    if not router_md:
        return None

    brief = _build_workflow_brief_for_router(workflow_state, selected_node_ids)
    user = (
        f"UserMessage:\n{msg}\n\nWorkflowBrief (JSON):\n"
        f"{json.dumps(brief, ensure_ascii=False)}\n\nReturn ONLY the JSON object."
    )
    lc_messages: List[Any] = [SystemMessage(content=router_md)]
    lc_messages.extend(_history_to_langchain_messages(chat_history))
    lc_messages.append(HumanMessage(content=user))

    try:
        structured = router_model.with_structured_output(RouterIntentModel)
        parsed = structured.invoke(lc_messages)
        if isinstance(parsed, RouterIntentModel):
            out: Dict[str, Any] = {"intent": parsed.intent, "reason": parsed.reason, "reply": parsed.reply}
            return out
    except Exception:
        pass

    try:
        resp = router_model.invoke(lc_messages, response_format={"type": "json_object"})
    except Exception:
        return None

    raw = str(getattr(resp, "content", "") or "")
    try:
        data = json.loads(raw)
    except Exception:
        data = _safe_extract_first_json_object(raw)
    if not isinstance(data, dict):
        return None

    intent = str(data.get("intent") or "").strip().lower()
    reply = data.get("reply")
    if intent not in {"conversation", "canvas_edit"}:
        return None
    out_fb: Dict[str, Any] = {"intent": intent, "reason": data.get("reason")}
    if isinstance(reply, str):
        out_fb["reply"] = reply
    return out_fb


def _parse_agent_control_intent(
    router_model: Any,
    message: str,
    chat_history: List[Dict[str, str]],
) -> Optional[AgentControlIntentModel]:
    msg = (message or "").strip()
    if not msg:
        return None
    system_prompt = (
        "You classify whether the user message is an agent-control command.\n"
        "Return only JSON matching AgentControlIntentModel.\n"
        "Use intent='none' for normal creative/planning requests.\n"
        "Use goto_stage only when an explicit stage number is provided.\n"
        "Set confidence 0..1 and directCommand=true only when the message is clearly an explicit control command.\n"
        "If the message asks to build/create/edit canvas content, prefer intent='none'."
    )
    user_prompt = (
        f"UserMessage:\n{msg}\n\n"
        "Classify intent among: none, next_stage, prev_stage, goto_stage, show_stages, "
        "clear_plan, stop, run_now, dismiss_changes.\n"
        "Return ONLY JSON."
    )
    lc_messages: List[Any] = [SystemMessage(content=system_prompt)]
    lc_messages.extend(_history_to_langchain_messages(chat_history))
    lc_messages.append(HumanMessage(content=user_prompt))

    try:
        structured = router_model.with_structured_output(AgentControlIntentModel)
        out = structured.invoke(lc_messages)
        if isinstance(out, AgentControlIntentModel):
            return out
    except Exception:
        pass

    try:
        resp = router_model.invoke(lc_messages, response_format={"type": "json_object"})
        raw = str(getattr(resp, "content", "") or "")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict):
            return AgentControlIntentModel(**data)
    except Exception:
        pass
    return None


def _parse_user_intent_signals(
    router_model: Any,
    message: str,
    chat_history: List[Dict[str, str]],
) -> UserIntentSignalsModel:
    msg = (message or "").strip()
    if not msg:
        return UserIntentSignalsModel()
    system_prompt = (
        "You extract structured intent signals for a visual workflow assistant.\n"
        "Return ONLY JSON matching UserIntentSignalsModel.\n"
        "Set each boolean to true only when the user's request clearly implies it.\n"
        "For canvasOperationHints: output an ordered list of EditOperation type strings that best match "
        "what the user wants done to the **graph** (canvas). First item = strongest intent. "
        "Use an empty list when the message is pure chat, control-only, or unrelated to graph edits.\n"
        "Choose the **most specific** operation type(s); e.g. full reset → [\"clearCanvas\"] not many removeNode; "
        "connect two nodes → [\"addEdge\"]; delete selection → [\"removeNode\"]; tweak prompt/model → [\"updateNode\"].\n"
        "If the user wants both structure change and running generators, include edit hints **and** set asksExecuteNodes=true."
    )
    user_prompt = (
        f"UserMessage:\n{msg}\n\n"
        "Classify signals:\n"
        "- visualAssessmentRequest: asks critique/review/quality opinion on images/results\n"
        "- planEditRequest: asks to edit/update/remove/reorder existing stages/plan (checklist), not canvas nodes\n"
        "- asksUpscale: asks to upscale image result\n"
        "- asksSplitGrid: asks split into grid/layout variants\n"
        "- asksExtractFrame: asks extract frame from video\n"
        "- asksModelTune: asks model/provider/parameters tuning\n"
        "- asksEaseCurveEdit: asks easing/bezier/output duration edits\n"
        "- asksSwitchRulesEdit: asks switch/conditional rule edits\n"
        "- asksExecuteNodes: run/generate/render/execute now (focus on firing nodes, not redrawing graph)\n"
        "- canvasOperationHints: ordered list, each value one of:\n"
        "  addNode, removeNode, clearCanvas, updateNode, addEdge, removeEdge, moveNode, "
        "createGroup, deleteGroup, updateGroup, setNodeGroup\n"
        "- rationale: one short sentence on why you chose the hints\n"
        "Return ONLY JSON."
    )
    lc_messages: List[Any] = [SystemMessage(content=system_prompt)]
    lc_messages.extend(_history_to_langchain_messages(chat_history))
    lc_messages.append(HumanMessage(content=user_prompt))

    try:
        structured = router_model.with_structured_output(UserIntentSignalsModel)
        out = structured.invoke(lc_messages)
        if isinstance(out, UserIntentSignalsModel):
            return out
    except Exception:
        pass

    try:
        resp = router_model.invoke(lc_messages, response_format={"type": "json_object"})
        raw = str(getattr(resp, "content", "") or "")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict):
            hint_list = _sanitize_canvas_operation_hints(data.pop("canvasOperationHints", None))
            try:
                return UserIntentSignalsModel(**data, canvasOperationHints=hint_list)
            except Exception:
                return UserIntentSignalsModel(canvasOperationHints=hint_list)
    except Exception:
        pass
    return UserIntentSignalsModel()


def _format_canvas_operation_hints_block(intent_signals: Optional[UserIntentSignalsModel]) -> str:
    if not intent_signals:
        return ""
    hints = list(intent_signals.canvasOperationHints or [])
    exec_line = ""
    if intent_signals.asksExecuteNodes:
        exec_line = (
            "Execution intent: the user wants to **run/generate** on the current graph — "
            "set `executeNodeIds` to the right targets when appropriate.\n"
        )
    if not hints and not exec_line:
        return ""
    lines = [
        "## Parsed canvas edit hints (from intent parser; follow unless impossible given workflow JSON)",
        exec_line,
    ]
    if hints:
        lines.append(
            "Preferred `operations[].type` values, **in order** (first = strongest). "
            "Pick the **minimal** ops that satisfy the user; do not use a weaker substitute when a clearer type exists."
        )
        lines.append(f"- canvasOperationHints: {json.dumps(hints, ensure_ascii=False)}")
        lines.append(
            "Mapping guide: "
            "new node / add X → addNode; delete one node → removeNode; wipe whole graph → clearCanvas; "
            "change prompt/model/settings → updateNode; connect/link/wire → addEdge; disconnect → removeEdge; "
            "reposition/layout → moveNode; box multiple nodes → createGroup; remove frame only → deleteGroup; "
            "rename/recolor/lock group → updateGroup; assign node to group → setNodeGroup."
        )
    if (intent_signals.rationale or "").strip():
        lines.append(f"- parser rationale: {intent_signals.rationale.strip()}")
    return "\n".join(line for line in lines if line) + "\n\n"


def _build_user_prompt(
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    attachments: Optional[List[Dict[str, str]]] = None,
    model_catalog: Optional[Dict[str, List[Dict[str, str]]]] = None,
    canvas_state_memory: Optional[Dict[str, Any]] = None,
    intent_signals: Optional[UserIntentSignalsModel] = None,
    openflow_ui_snapshot: Optional[str] = None,
    *,
    closing_instruction: str,
) -> str:
    try:
        hops = int(os.environ.get("FLOWY_CONTEXT_NEIGHBOR_HOPS", "2"))
    except ValueError:
        hops = 2
    try:
        focus_max = int(os.environ.get("FLOWY_CONTEXT_FOCUS_MAX_NODES", "72"))
    except ValueError:
        focus_max = 72

    canvas_ctx = build_canvas_context_for_llm(
        workflow_state,
        selected_node_ids=selected_node_ids,
        neighbor_hops=hops,
        focus_max_nodes=focus_max,
    )
    canvas_json = json.dumps(canvas_ctx, ensure_ascii=False, indent=2)

    digest = build_execution_digest_for_llm(
        workflow_state,
        selected_node_ids=selected_node_ids,
        neighbor_hops=hops,
        focus_max_nodes=focus_max,
    )
    digest_json = json.dumps(digest, ensure_ascii=False, indent=2)

    attachments = attachments or []
    model_catalog = model_catalog or {}
    canvas_state_memory = canvas_state_memory or {}
    attachments_brief = (
        "Uploaded images (JSON):\n"
        + json.dumps(
            [
                {"id": a["id"], "name": a["name"], "mimeType": a["mimeType"]}
                for a in attachments
            ],
            ensure_ascii=False,
            indent=2,
        )
        + "\n\n"
        if attachments
        else ""
    )

    snap_block = ""
    if openflow_ui_snapshot and str(openflow_ui_snapshot).strip():
        snap_block = (
            "## Openflow UI snapshot (live, captured in the client — use refs below for uiCommands)\n"
            + str(openflow_ui_snapshot).strip()
            + "\n\n"
        )

    return (
        snap_block
        + f"Message: {message}\n\n"
        + _format_canvas_operation_hints_block(intent_signals)
        + attachments_brief
        + (
            "Project model catalog (use exact modelId values from here when setting/changing models):\n"
            + json.dumps(model_catalog, ensure_ascii=False, indent=2)
            + "\n\n"
            if model_catalog
            else ""
        )
        + (
            "Canvas state memory (previous -> current). Use this to reason about what changed recently:\n"
            + json.dumps(canvas_state_memory, ensure_ascii=False, indent=2)
            + "\n\n"
            if canvas_state_memory
            else ""
        )
        + "Execution digest (focused nodes): status, errors, prompt previews, hasOutput* flags — no media payloads.\n"
        f"{digest_json}\n\n"
        + "Current workflow (JSON). Use nodesDetailed for full context near the user's selection; "
        + "nodesOutline lists other nodes by id/type only; edges are the full graph.\n"
        f"{canvas_json}\n\n"
        f"{closing_instruction}"
    )


CLOSE_CANVAS_PLAN = (
    "Return a single JSON object with assistantText, operations, optional uiCommands, requiresApproval, "
    "approvalReason, executeNodeIds, runApprovalRequired.\n\n"
    "Optional uiCommands: array of Openflow-only UI steps (no external URLs). The client runs them **before** "
    "applying operations when the user approves.\n"
    "Each item has \"type\": one of snapshot, click, dblclick, hover, scrollIntoView, fill, type, press, wait, waitFor.\n"
    "Types that need a target include \"target\": an object with \"kind\": ref | dataId | agentNodeType | flowNode | handle, plus:\n"
    "  ref → \"ref\": string (e.g. ui.addNode); dataId → \"value\": string; agentNodeType → \"nodeType\": string; "
    "flowNode → \"nodeId\": string; handle → \"nodeId\": string and optional \"handleId\": string.\n"
    "fill/type need \"text\": string; wait needs \"ms\": number; waitFor optional \"timeoutMs\": number; press needs \"key\": string.\n"
    "Prefer **operations** for graph topology (nodes/edges/groups). Use **uiCommands** only when real menus/toolbars/clicks are required.\n"
    "Keep uiCommands minimal; omit or use [] when not needed."
)

CLOSE_PLAN_ADVISOR = (
    "MODE: CHAT (advisory only). Do not output edit operations or claim the canvas changed.\n"
    'Return ONLY valid JSON: {"assistantText":"..."} — a single string with your full answer.'
)


def _run_plan_advisor_only(
    model: Any,
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    attachments: Optional[List[Dict[str, str]]] = None,
    model_catalog: Optional[Dict[str, List[Dict[str, str]]]] = None,
    canvas_state_memory: Optional[Dict[str, Any]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> str:
    advisor = _read_text_file("PLAN_ADVISOR.md").strip()
    if not advisor:
        advisor = "You are a workflow chat advisor. Advise only; do not claim canvas edits."
    system_prompt = advisor + "\n\nReturn ONLY JSON: {\"assistantText\": \"...\"}."
    user_prompt = _build_user_prompt(
        message,
        workflow_state,
        selected_node_ids,
        attachments=attachments,
        model_catalog=model_catalog,
        canvas_state_memory=canvas_state_memory,
        closing_instruction=CLOSE_PLAN_ADVISOR,
    )
    hist = chat_history or []
    lc: List[Any] = [SystemMessage(content=system_prompt)]
    lc.extend(_history_to_langchain_messages(hist))
    lc.append(_build_human_message_with_attachments(user_prompt, attachments or []))

    try:
        structured = model.with_structured_output(PlanAdvisorJsonModel)
        out = structured.invoke(lc)
        if isinstance(out, PlanAdvisorJsonModel) and out.assistantText.strip():
            return out.assistantText.strip()
    except Exception:
        pass

    resp = model.invoke(lc, response_format={"type": "json_object"})
    raw = str(getattr(resp, "content", "") or "")
    try:
        data = json.loads(raw)
    except Exception:
        data = _safe_extract_first_json_object(raw)
    if isinstance(data, dict):
        text = data.get("assistantText")
        if isinstance(text, str) and text.strip():
            return text.strip()
    return (
        "I can help you design that workflow step by step. "
        "Tell me your goal (e.g. image → video) and any constraints (models, style, length)."
    )


def _run_planner_stage(
    router_model: Any,
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    chat_history: List[Dict[str, str]],
    payload: Dict[str, Any],
    intent_signals: Optional[UserIntentSignalsModel] = None,
) -> Tuple[Optional[GoalDecompositionModel], int, Optional[str], str]:
    """Subagent stage: goal decomposition and stage framing."""
    _emit_progress("subagent_planner", "framing stage plan")
    skip_decompose = os.environ.get("FLOWY_SKIP_DECOMPOSITION", "").strip().lower() in {"1", "true", "yes"}
    decomposition: Optional[GoalDecompositionModel] = None
    current_stage_instruction: Optional[str] = None
    stage_index = int(payload.get("stageIndex") or 0)
    prior_stages_json = payload.get("decompositionStages")

    if not skip_decompose and stage_index == 0 and not prior_stages_json:
        _emit_progress("decomposing", "analyzing goal complexity")
        decomposition = _decompose_goal(
            router_model, message, workflow_state, selected_node_ids, chat_history
        )
        if decomposition and decomposition.shouldDecompose:
            _emit_progress("decomposed", f"{len(decomposition.stages)} stages planned")

    if prior_stages_json and isinstance(prior_stages_json, list):
        try:
            decomposition = GoalDecompositionModel(
                shouldDecompose=True,
                stages=[GoalStageModel(**s) for s in prior_stages_json],
                overallStrategy="resumed",
                estimatedComplexity="moderate",
            )
            if decomposition.stages and bool(intent_signals and intent_signals.planEditRequest):
                _emit_progress("decomposing", "revising stage plan from user edits")
                revised = _revise_decomposition(
                    router_model,
                    message,
                    workflow_state,
                    selected_node_ids,
                    chat_history,
                    decomposition.stages,
                )
                if revised and revised.shouldDecompose and revised.stages:
                    decomposition = revised
                    stage_index = min(max(stage_index, 0), max(len(decomposition.stages) - 1, 0))
                    _emit_progress("decomposed", f"plan updated to {len(decomposition.stages)} stages")
        except Exception:
            decomposition = None

    planner_message = message
    if decomposition and decomposition.shouldDecompose and decomposition.stages:
        if stage_index < len(decomposition.stages):
            stage = decomposition.stages[stage_index]
            current_stage_instruction = stage.instruction
            planner_message = (
                f"STAGE {stage_index + 1}/{len(decomposition.stages)}: {stage.title}\n"
                f"Instruction: {stage.instruction}\n\n"
                f"Original user goal: {message}\n"
                f"Overall strategy: {decomposition.overallStrategy}"
            )
    return decomposition, stage_index, current_stage_instruction, planner_message


def _run_prompt_specialist_stage(planner_message: str, canvas_state_memory: Dict[str, Any]) -> str:
    """Subagent stage: prompt behavior shaping before builder stage."""
    _emit_progress("subagent_prompt_specialist", "preparing planning prompt")
    if not canvas_state_memory:
        return planner_message
    # Keep message stable while still signaling stateful continuity.
    updated_at = canvas_state_memory.get("updatedAt")
    if isinstance(updated_at, int):
        return (
            planner_message
            + f"\n\nCanvas state memory timestamp: {updated_at}. Reuse existing graph where possible and apply minimal edits."
        )
    return planner_message


def _run_builder_stage(
    model: Any,
    system_prompt: str,
    planner_message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    attachments: List[Dict[str, str]],
    model_catalog: Dict[str, List[Dict[str, str]]],
    canvas_state_memory: Dict[str, Any],
    chat_history: List[Dict[str, str]],
    message_for_toolbar_validation: str,
    intent_signals: Optional[UserIntentSignalsModel] = None,
    openflow_ui_snapshot: Optional[str] = None,
) -> Tuple[Dict[str, Any], bool, List[str], str]:
    """
    Subagent stage: generate operations, normalize, optimize, validate with retries.
    Returns: (parsed, validated_ok, last_errors, last_text_debug)
    """
    parsed: Dict[str, Any] = {}
    validated_ok = False
    last_errors: List[str] = []
    last_text_debug = ""

    try:
        structured_planner = model.with_structured_output(FlowyPlanJsonModel)
    except Exception:
        structured_planner = None  # type: ignore[assignment]

    _emit_progress("subagent_builder", "generating operations")

    for attempt in range(3):
        if attempt > 0:
            _emit_progress("retrying", f"attempt {attempt + 1}/3")
        user_prompt = _build_user_prompt(
            planner_message,
            workflow_state,
            selected_node_ids,
            attachments=attachments,
            model_catalog=model_catalog,
            canvas_state_memory=canvas_state_memory,
            intent_signals=intent_signals,
            openflow_ui_snapshot=openflow_ui_snapshot,
            closing_instruction=CLOSE_CANVAS_PLAN,
        )
        if attempt > 0 and last_errors:
            user_prompt += (
                "\n\nYour previous operations were invalid:\n"
                + "\n".join(f"- {e}" for e in last_errors)
                + "\n\nReturn ONLY corrected JSON."
            )
        final_human = _build_human_message_with_attachments(user_prompt, attachments)
        planner_lc: List[Any] = [SystemMessage(content=system_prompt)]
        planner_lc.extend(_history_to_langchain_messages(chat_history))
        planner_lc.append(final_human)

        candidate: Dict[str, Any] = {}
        last_text = ""
        if structured_planner is not None:
            try:
                plan_obj = structured_planner.invoke(planner_lc)
                if isinstance(plan_obj, FlowyPlanJsonModel):
                    candidate = plan_obj.model_dump(exclude_none=True)
                    last_text = json.dumps(candidate, ensure_ascii=False)
            except Exception:
                candidate = {}

        if not candidate:
            resp = model.invoke(planner_lc, response_format={"type": "json_object"})
            last_text = str(getattr(resp, "content", "") or "")
            try:
                parsed_try = json.loads(last_text)
                if isinstance(parsed_try, dict):
                    candidate = parsed_try
                else:
                    candidate = _safe_extract_first_json_object(last_text)
            except Exception:
                candidate = _safe_extract_first_json_object(last_text)

        last_text_debug = last_text[:2000] if last_text else ""

        if not candidate:
            parsed = {}
            last_errors = ["LLM did not return valid JSON."]
            continue

        try:
            normalized_candidate = FlowyPlanJsonModel(**candidate)
            candidate = normalized_candidate.model_dump(exclude_none=True)
        except Exception:
            parsed = candidate
            last_errors = ["builder_output_schema_invalid"]
            continue

        operations = candidate.get("operations", [])
        operations = _materialize_attachment_operations(operations, attachments)
        operations = _normalize_operation_models(operations, model_catalog)
        operations = _optimize_operations_pre_validation(
            operations, workflow_state=workflow_state, selected_node_ids=selected_node_ids
        )
        candidate["operations"] = operations
        validation = _validate_edit_operations(operations, workflow_state)
        toolbar_validation = _validate_toolbar_intent_plan(
            message_for_toolbar_validation,
            candidate,
            operations,
            workflow_state=workflow_state,
            selected_node_ids=selected_node_ids,
            intent_signals=intent_signals,
        )
        combined_errors = [
            *(validation.get("errors") or []),
            *(toolbar_validation.get("errors") or []),
        ]
        if validation.get("ok") and toolbar_validation.get("ok"):
            parsed = candidate
            validated_ok = True
            break

        parsed = candidate
        last_errors = combined_errors or ["validation_failed"]

    return parsed, validated_ok, last_errors, last_text_debug


def _resolve_planner_provider_model(payload: Dict[str, Any]) -> Tuple[str, str]:
    """Client sends `provider` (openai|google) and `model` (API model id)."""
    prov = str(payload.get("provider") or "").strip().lower()
    mid = str(payload.get("model") or "").strip()
    env_default = os.environ.get("FLOWY_PLANNER_MODEL", "gpt-4.1-mini")
    if not mid:
        mid = env_default
    if prov not in ("google", "openai"):
        if "gemini" in mid.lower():
            prov = "google"
        else:
            prov = "openai"
    return prov, mid


def _build_planner_chat_models(provider: str, model_id: str) -> Tuple[Any, Any]:
    """
    Main planner + router use the same model id from the Flowy panel unless
    env overrides are needed later.
    """
    planner_max_tokens: Optional[int] = None
    raw_max = os.environ.get("FLOWY_PLANNER_MAX_OUTPUT_TOKENS", "").strip()
    if raw_max:
        try:
            planner_max_tokens = int(raw_max)
        except ValueError:
            planner_max_tokens = None

    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore

        gkey = (os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
        if not gkey:
            raise ValueError(
                "GOOGLE_API_KEY or GEMINI_API_KEY is required when using Gemini as the Flowy planner."
            )
        kw: Dict[str, Any] = {
            "model": model_id,
            "google_api_key": gkey,
            "temperature": 0.2,
        }
        rkw: Dict[str, Any] = {
            "model": model_id,
            "google_api_key": gkey,
            "temperature": 0.1,
        }
        if planner_max_tokens is not None:
            kw["max_output_tokens"] = planner_max_tokens
            rkw["max_output_tokens"] = planner_max_tokens
        return ChatGoogleGenerativeAI(**kw), ChatGoogleGenerativeAI(**rkw)

    openai_key = os.environ.get("OPENAI_API_KEY")
    if not openai_key:
        raise ValueError("OPENAI_API_KEY is required when using OpenAI as the Flowy planner.")
    mk: Dict[str, Any] = {"api_key": openai_key, "model": model_id, "temperature": 0.2}
    rk: Dict[str, Any] = {"api_key": openai_key, "model": model_id, "temperature": 0.1}
    if planner_max_tokens is not None:
        mk["max_tokens"] = planner_max_tokens
        rk["max_tokens"] = planner_max_tokens
    return ChatOpenAI(**mk), ChatOpenAI(**rk)


def main() -> None:
    try:
        payload = _read_stdin_json()
        message = payload.get("message") or ""
        workflow_state = payload.get("workflowState") or {"nodes": [], "edges": []}
        selected_node_ids = payload.get("selectedNodeIds") or []
        attachments = _coerce_image_attachments(payload.get("attachments"))
        model_catalog = _coerce_model_catalog(payload.get("modelCatalog"))
        canvas_state_memory = _coerce_canvas_state_memory(payload.get("canvasStateMemory"))
        openflow_ui_snapshot = payload.get("openflowUiSnapshot")
        openflow_ui_snapshot_str = (
            str(openflow_ui_snapshot).strip() if isinstance(openflow_ui_snapshot, str) and openflow_ui_snapshot.strip() else None
        )
        try:
            hist_max_turns = int(os.environ.get("FLOWY_CHAT_HISTORY_MAX_TURNS", "14"))
        except ValueError:
            hist_max_turns = 14
        try:
            hist_max_chars = int(os.environ.get("FLOWY_CHAT_HISTORY_MAX_CHARS", "8000"))
        except ValueError:
            hist_max_chars = 8000
        chat_history = _cap_chat_history(
            _normalize_chat_history(payload.get("chatHistory")),
            max_turns=hist_max_turns,
            max_chars=hist_max_chars,
        )
        agent_mode = str(payload.get("agentMode") or "assist").strip().lower()
        if agent_mode not in {"plan", "assist"}:
            agent_mode = "assist"
        enforce_canvas_control = _coerce_bool(
            payload.get("enforceCanvasControl"),
            default=_coerce_bool(os.environ.get("FLOWY_ENFORCE_CANVAS_CONTROL"), default=True),
        )
        require_caution_approval = _coerce_bool(
            payload.get("requireCautionApproval"),
            default=_coerce_bool(os.environ.get("FLOWY_REQUIRE_CAUTION_APPROVAL"), default=False),
        )

        try:
            llm_provider, llm_model_id = _resolve_planner_provider_model(payload)
            model, router_model = _build_planner_chat_models(llm_provider, llm_model_id)
        except ValueError as e:
            _safe_stream_write(
                sys.stdout,
                _safe_json_dumps(
                    {
                        "ok": False,
                        "error": str(e),
                        "assistantText": str(e),
                        "operations": [],
                        "requiresApproval": False,
                        "approvalReason": "",
                        "runApprovalRequired": agent_mode == "assist",
                    }
                )
            )
            return

        _emit_progress("init", f"mode={agent_mode} llm={llm_provider}:{llm_model_id}")

        intent_signals = _parse_user_intent_signals(router_model, message, chat_history)

        control_intent = _parse_agent_control_intent(router_model, message, chat_history)
        try:
            control_threshold = float(os.environ.get("FLOWY_CONTROL_INTENT_THRESHOLD", "0.8"))
        except ValueError:
            control_threshold = 0.8
        control_allowed = (
            control_intent is not None
            and control_intent.intent != "none"
            and bool(control_intent.directCommand)
            and float(control_intent.confidence or 0.0) >= control_threshold
        )
        if control_allowed:
            default_reply = {
                "next_stage": "Moving to the next stage.",
                "prev_stage": "Going back to the previous stage.",
                "goto_stage": f"Jumping to stage {max(1, int(control_intent.stageNumber or 1))}.",
                "show_stages": "Showing the current stage checklist.",
                "clear_plan": "Clearing the current plan.",
                "stop": "Stopping current automation.",
                "run_now": "Running pending execution now.",
                "dismiss_changes": "Dismissing pending canvas changes.",
            }.get(control_intent.intent, "Applying control command.")
            _safe_stream_write(
                sys.stdout,
                _safe_json_dumps(
                    {
                        "ok": True,
                        "mode": "control",
                        "assistantText": (control_intent.reply or default_reply).strip(),
                        "operations": [],
                        "requiresApproval": False,
                        "approvalReason": "",
                        "runApprovalRequired": False,
                        "agentControl": {
                            "intent": control_intent.intent,
                            "stageNumber": control_intent.stageNumber,
                            "reason": control_intent.reason,
                            "confidence": control_intent.confidence,
                            "directCommand": control_intent.directCommand,
                        },
                    }
                )
            )
            return

        if agent_mode == "plan":
            _emit_progress("advisor", "running plan advisor")
            text = _run_plan_advisor_only(
                model, message, workflow_state, selected_node_ids, attachments, model_catalog=model_catalog, canvas_state_memory=canvas_state_memory, chat_history=chat_history
            )
            _safe_stream_write(
                sys.stdout,
                _safe_json_dumps(
                    {
                        "ok": True,
                        "mode": "chat",
                        "assistantText": text,
                        "operations": [],
                        "requiresApproval": False,
                        "approvalReason": "",
                        "runApprovalRequired": False,
                        "agentMode": "plan",
                    }
                )
            )
            return

        skip_router = os.environ.get("FLOWY_SKIP_INTENT_ROUTER", "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        # Router should run for assist too, so normal conversation remains possible
        # without forcing canvas edits on every message.
        if not skip_router:
            _emit_progress("routing", "classifying intent")
            route = _classify_user_intent(
                router_model, message, workflow_state, selected_node_ids, chat_history
            )
            if route and route.get("intent") == "conversation":
                if enforce_canvas_control and agent_mode == "assist":
                    _emit_progress("routing", "conversation route overridden by canvas-control policy")
                else:
                # If images are available and user asks for visual feedback,
                # route through multimodal advisor instead of a plain router reply.
                    if attachments and bool(intent_signals.visualAssessmentRequest):
                        text = _run_plan_advisor_only(
                            model, message, workflow_state, selected_node_ids, attachments, model_catalog=model_catalog, canvas_state_memory=canvas_state_memory, chat_history=chat_history
                        )
                        _safe_stream_write(
                            sys.stdout,
                            _safe_json_dumps(
                                {
                                    "ok": True,
                                    "mode": "chat",
                                    "assistantText": text,
                                    "operations": [],
                                    "requiresApproval": False,
                                    "approvalReason": "",
                                    "runApprovalRequired": False,
                                }
                            )
                        )
                        return
                    reply_text = route.get("reply")
                    if not isinstance(reply_text, str) or not reply_text.strip():
                        reply_text = (
                            "Here’s a quick answer. If you want me to change the canvas, say what to add, "
                            "connect, or run."
                        )
                    _safe_stream_write(
                        sys.stdout,
                        _safe_json_dumps(
                            {
                                "ok": True,
                                "mode": "chat",
                                "assistantText": reply_text.strip(),
                                "operations": [],
                                "requiresApproval": False,
                                "approvalReason": "",
                                "runApprovalRequired": False,
                            }
                        )
                    )
                    return

        system_prompt = _build_system_prompt()
        decomposition, stage_index, current_stage_instruction, planner_message = _run_planner_stage(
            router_model=router_model,
            message=message,
            workflow_state=workflow_state,
            selected_node_ids=selected_node_ids,
            chat_history=chat_history,
            payload=payload,
            intent_signals=intent_signals,
        )
        planner_message = _run_prompt_specialist_stage(
            planner_message=planner_message,
            canvas_state_memory=canvas_state_memory,
        )
        parsed, validated_ok, last_errors, last_text_debug = _run_builder_stage(
            model=model,
            system_prompt=system_prompt,
            planner_message=planner_message,
            workflow_state=workflow_state,
            selected_node_ids=selected_node_ids,
            attachments=attachments,
            model_catalog=model_catalog,
            canvas_state_memory=canvas_state_memory,
            chat_history=chat_history,
            message_for_toolbar_validation=message,
            intent_signals=intent_signals,
            openflow_ui_snapshot=openflow_ui_snapshot_str,
        )

        ok = validated_ok
        if not parsed:
            parsed = {
                "assistantText": "Deep planner failed to produce valid JSON.",
                "operations": [],
                "uiCommands": [],
                "requiresApproval": True,
                "approvalReason": "Planning failed.",
                "error": "invalid_json_or_empty",
                "debugLastText": last_text_debug,
            }
        elif not validated_ok:
            prev_ui = parsed.get("uiCommands") if isinstance(parsed, dict) else []
            parsed = {
                "assistantText": parsed.get("assistantText", "Planning failed."),
                "operations": parsed.get("operations", []),
                "uiCommands": prev_ui if isinstance(prev_ui, list) else [],
                "requiresApproval": True,
                "approvalReason": "Planning failed validation. User approval needed or adjust constraints.",
                "error": "validation_failed",
                "debugLastText": last_text_debug,
                "validationErrors": last_errors,
            }

        out: Dict[str, Any] = {
            "ok": ok,
            "mode": "plan",
            "assistantText": parsed.get("assistantText", ""),
            "operations": parsed.get("operations", []),
            "uiCommands": parsed.get("uiCommands") if isinstance(parsed.get("uiCommands"), list) else [],
            "requiresApproval": False,
            "approvalReason": "",
            "agentMode": agent_mode,
            "enforceCanvasControl": enforce_canvas_control,
        }
        out["debugLastText"] = last_text_debug
        out["capabilityRegistry"] = _build_capability_registry(workflow_state, selected_node_ids).model_dump()
        if parsed.get("executeNodeIds") is not None:
            out["executeNodeIds"] = parsed.get("executeNodeIds")
        risk_summary = _summarize_operation_risks(out.get("operations"))
        destructive_approval_required = _operations_require_manual_approval(out.get("operations"))
        caution_present = risk_summary.get("caution", 0) > 0
        out["requiresApproval"] = destructive_approval_required or (require_caution_approval and caution_present)
        if destructive_approval_required:
            out["approvalReason"] = "Destructive canvas operations require manual approval."
        elif require_caution_approval and caution_present:
            out["approvalReason"] = "Caution-tier operations require manual approval by policy."
        out["runApprovalRequired"] = bool(parsed.get("runApprovalRequired")) if parsed.get("runApprovalRequired") is not None else (agent_mode == "assist")
        out["safetyPolicy"] = {
            "riskSummary": risk_summary,
            "requireCautionApproval": require_caution_approval,
            "destructiveRequiresApproval": True,
        }
        out["postApplyCheck"] = _build_post_apply_verification(
            workflow_state=workflow_state,
            operations=out.get("operations"),
        ).model_dump()
        out["telemetry"] = {
            "routerBypassed": skip_router,
            "agentMode": agent_mode,
            "operationCount": len(out.get("operations") or []),
            "selectedNodeCount": len(selected_node_ids),
            "attachmentsCount": len(attachments),
            "validationOk": bool(ok),
        }
        out["intentSignals"] = intent_signals.model_dump()
        if not ok:
            out["error"] = parsed.get("error", "deep_agent_planning_failed")

        if decomposition and decomposition.shouldDecompose and decomposition.stages:
            out["decomposition"] = {
                "stages": [s.model_dump() for s in decomposition.stages],
                "currentStageIndex": stage_index,
                "totalStages": len(decomposition.stages),
                "overallStrategy": decomposition.overallStrategy,
                "estimatedComplexity": decomposition.estimatedComplexity,
                "isLastStage": stage_index >= len(decomposition.stages) - 1,
            }

        _safe_stream_write(sys.stdout, _safe_json_dumps(out))
    except Exception as e:
        _safe_stream_write(
            sys.stdout,
            _safe_json_dumps(
                {
                    "ok": False,
                    "error": f"Deep planner crashed: {e}",
                    "assistantText": "Deep planner crashed. Try again.",
                    "operations": [],
                    "requiresApproval": False,
                    "approvalReason": "",
                    "runApprovalRequired": False,
                    "debugLastText": (locals().get("last_text_debug") or "")[:2000],
                }
            )
        )


if __name__ == "__main__":
    main()

