#!/usr/bin/env python3
from __future__ import annotations

import functools
import json
import os
import sys
from collections import Counter
from typing import Any, Dict, List, Literal, Optional, Set, Tuple, Union

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage  # type: ignore
from langchain_openai import ChatOpenAI  # type: ignore
from pydantic import BaseModel, Field

from canvas_context import (
    build_canvas_context_for_llm,
    build_execution_digest_for_llm,
    load_planner_schema,
)


FLOWY_DEEPAGENTS_DIR = os.path.join(os.path.dirname(__file__), "")


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
    "quality_check": {"stageId": "quality_check", "stageTitle": "Quality check", "source": "planner"},
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
    event_json = json.dumps(event, ensure_ascii=False)
    sys.stderr.write(f"FLOWY_PROGRESS:{event_json}\n")
    sys.stderr.flush()


class RouterIntentModel(BaseModel):
    """Structured router output (OpenAI structured output / JSON schema)."""

    intent: Literal["conversation", "canvas_edit"]
    reply: str = ""
    reason: str = ""


class FlowyPlanJsonModel(BaseModel):
    """Top-level planner JSON; operations stay as dicts for downstream validation."""

    assistantText: str = ""
    operations: List[Dict[str, Any]] = Field(default_factory=list)
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


class QualityCheckModel(BaseModel):
    verdict: Literal["accept", "refine", "regenerate", "error_recovery"] = "accept"
    confidence: float = 0.8
    assessment: str = ""
    issues: List[str] = Field(default_factory=list)
    refinementSuggestion: Optional[str] = None
    nextAction: Optional[str] = None


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


def _check_quality(
    model: Any,
    user_goal: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    attachments: Optional[List[Dict[str, str]]] = None,
    stage_instruction: Optional[str] = None,
) -> Optional[QualityCheckModel]:
    """
    Post-execution quality checker. Inspects execution digest and decides
    whether to accept, refine, or regenerate outputs.
    """
    checker_md = _read_text_file("QUALITY_CHECKER.md").strip()
    if not checker_md:
        return None

    brief = _build_workflow_brief_for_router(workflow_state, selected_node_ids)
    try:
        hops = int(os.environ.get("FLOWY_CONTEXT_NEIGHBOR_HOPS", "2"))
    except ValueError:
        hops = 2
    try:
        focus_max = int(os.environ.get("FLOWY_CONTEXT_FOCUS_MAX_NODES", "72"))
    except ValueError:
        focus_max = 72

    digest = build_execution_digest_for_llm(
        workflow_state,
        selected_node_ids=selected_node_ids,
        neighbor_hops=hops,
        focus_max_nodes=focus_max,
    )

    user_content = (
        f"UserGoal:\n{user_goal}\n\n"
        + (f"StageInstruction:\n{stage_instruction}\n\n" if stage_instruction else "")
        + f"ExecutionDigest (JSON):\n{json.dumps(digest, ensure_ascii=False, indent=2)}\n\n"
        + f"WorkflowBrief (JSON):\n{json.dumps(brief, ensure_ascii=False)}\n\n"
        + "Return ONLY the JSON object."
    )
    lc_messages: List[Any] = [SystemMessage(content=checker_md)]
    lc_messages.append(_build_human_message_with_attachments(user_content, attachments or []))

    try:
        structured = model.with_structured_output(QualityCheckModel)
        result = structured.invoke(lc_messages)
        if isinstance(result, QualityCheckModel):
            return result
    except Exception:
        pass

    try:
        resp = model.invoke(lc_messages, response_format={"type": "json_object"})
        raw = str(getattr(resp, "content", "") or "")
        data = json.loads(raw) if raw.strip() else {}
        if isinstance(data, dict) and data.get("verdict"):
            return QualityCheckModel(**data)
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
    ops = set(str(x) for x in (schema.get("operationTypes") or []))
    if not nodes or not handles or not ops:
        raise ValueError("planner_schema.json missing nodeTypes, handleTypes, or operationTypes")
    return nodes, handles, ops


def _read_stdin_json() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


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


def _looks_like_visual_assessment_request(message: str) -> bool:
    m = (message or "").lower()
    cues = [
        "what do you think",
        "thoughts on this",
        "rate this",
        "is this good",
        "critique",
        "feedback",
        "analyze this image",
        "analyze this",
        "review this image",
        "quality",
    ]
    return any(c in m for c in cues)


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

    # Phase A: prompt-node reuse transformation (safe / high-value case)
    transformed: List[Dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict):
            transformed.append(op)
            continue
        if op.get("type") != "addNode" or op.get("nodeType") != "prompt":
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


def _validate_edge_handles(source_handle: Optional[str], target_handle: Optional[str]) -> Optional[str]:
    allowed_handles = _planner_allowlists()[1]
    if not source_handle and not target_handle:
        return "Edge handles must be provided (sourceHandle and targetHandle)."
    if source_handle not in allowed_handles:
        return f"Invalid sourceHandle '{source_handle}'."
    if target_handle not in allowed_handles:
        return f"Invalid targetHandle '{target_handle}'."

    # Matching rule (except 'reference'): connect handle types by equality.
    if source_handle == "reference" or target_handle == "reference":
        return None
    if source_handle != target_handle:
        return f"Handle mismatch: {source_handle} -> {target_handle}."
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

    added_node_ids: set[str] = set()
    for op in operations:
        if not isinstance(op, dict):
            continue
        if op.get("type") == "addNode" and op.get("nodeId"):
            added_node_ids.add(op["nodeId"])

    valid_node_ids = initial_node_ids | added_node_ids

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
            if node_type not in allowed_nodes:
                errors.append(f"operations[{idx}].nodeType invalid: {node_type}")
            if not node_id or not isinstance(node_id, str):
                errors.append(f"operations[{idx}].nodeId is required for subsequent ops (missing).")

        if op_type == "removeNode":
            node_id = op.get("nodeId")
            if not node_id or node_id not in valid_node_ids:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")

        if op_type == "updateNode":
            node_id = op.get("nodeId")
            if not node_id or node_id not in valid_node_ids:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            data = op.get("data")
            if not isinstance(data, dict):
                errors.append(f"operations[{idx}].data must be an object")

        if op_type == "addEdge":
            source = op.get("source")
            target = op.get("target")
            if not source or source not in valid_node_ids:
                errors.append(f"operations[{idx}].source nodeId not found: {source}")
            if not target or target not in valid_node_ids:
                errors.append(f"operations[{idx}].target nodeId not found: {target}")

            sh = op.get("sourceHandle")
            th = op.get("targetHandle")
            handle_error = _validate_edge_handles(sh, th)
            if handle_error:
                errors.append(f"operations[{idx}] edge handle error: {handle_error}")

        if op_type == "removeEdge":
            edge_id = op.get("edgeId")
            if not edge_id or edge_id not in initial_edge_ids:
                errors.append(f"operations[{idx}].edgeId not found: {edge_id}")

        if op_type == "moveNode":
            node_id = op.get("nodeId")
            pos = op.get("position")
            if not node_id or node_id not in valid_node_ids:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            if not isinstance(pos, dict) or not isinstance(pos.get("x"), (int, float)) or not isinstance(pos.get("y"), (int, float)):
                errors.append(f"operations[{idx}].position must be an object with numeric x/y")

        if op_type == "createGroup":
            node_ids = op.get("nodeIds")
            if not isinstance(node_ids, list) or len(node_ids) == 0:
                errors.append(f"operations[{idx}].nodeIds must be a non-empty list")
            else:
                for nid in node_ids:
                    if nid not in valid_node_ids:
                        errors.append(f"operations[{idx}] nodeIds contains unknown nodeId: {nid}")
            color = op.get("color")
            if color is not None and color not in {"neutral", "blue", "green", "purple", "orange", "red"}:
                errors.append(f"operations[{idx}].color invalid: {color}")

        if op_type == "deleteGroup":
            group_id = op.get("groupId")
            if not isinstance(group_id, str) or not group_id.strip():
                errors.append(f"operations[{idx}].groupId is required")

        if op_type == "updateGroup":
            group_id = op.get("groupId")
            updates = op.get("updates")
            if not isinstance(group_id, str) or not group_id.strip():
                errors.append(f"operations[{idx}].groupId is required")
            if not isinstance(updates, dict):
                errors.append(f"operations[{idx}].updates must be an object")

        if op_type == "setNodeGroup":
            node_id = op.get("nodeId")
            group_id = op.get("groupId")
            if not node_id or node_id not in valid_node_ids:
                errors.append(f"operations[{idx}].nodeId not found: {node_id}")
            if group_id is not None and not isinstance(group_id, str):
                errors.append(f"operations[{idx}].groupId must be string or null")

    return {"ok": not errors, "errors": errors}


def _validate_toolbar_intent_plan(
    message: str,
    parsed: Dict[str, Any],
    operations: List[Dict[str, Any]],
    workflow_state: Optional[Dict[str, Any]] = None,
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Validate that common toolbar requests are expressed with the expected
    operation pattern so the UI can apply them deterministically.
    """
    errors: List[str] = []
    raw_msg = message or ""
    marker = "User request:"
    marker_idx = raw_msg.rfind(marker)
    if marker_idx != -1:
        msg = raw_msg[marker_idx + len(marker) :].strip().lower()
    else:
        msg = raw_msg.lower()

    add_nodes = [op for op in operations if isinstance(op, dict) and op.get("type") == "addNode"]
    add_edges = [op for op in operations if isinstance(op, dict) and op.get("type") == "addEdge"]
    update_nodes = [op for op in operations if isinstance(op, dict) and op.get("type") == "updateNode"]
    execute_ids = parsed.get("executeNodeIds")
    execute_ids_list = execute_ids if isinstance(execute_ids, list) else []

    asks_upscale = "upscale" in msg
    asks_grid = "split into grid" in msg or ("grid" in msg and "split" in msg)
    asks_extract_frame = "extract frame" in msg or ("frame" in msg and "video" in msg)
    # Keep this explicit to avoid false positives on generic "model" mentions.
    asks_model_tune = any(
        k in msg
        for k in [
            "change model",
            "switch model",
            "set model",
            "change provider",
            "set provider",
            "aspect ratio",
            "resolution",
            "temperature",
            "max tokens",
            "parameters",
        ]
    )
    asks_ease = any(k in msg for k in ["ease curve", "bezier", "easing", "output duration"])
    asks_switch_rules = (
        "conditional switch" in msg
        or "switch rules" in msg
        or "edit rules" in msg
    )

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
        if has_selected_tunable or has_any_tunable:
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
    destructive_ops = {"removeNode", "removeEdge", "deleteGroup"}
    for op in operations:
        if isinstance(op, dict) and str(op.get("type") or "") in destructive_ops:
            return True
    return False


def _operation_risk_tier(op: Dict[str, Any]) -> str:
    op_type = str(op.get("type") or "")
    if op_type in {"removeNode", "removeEdge", "deleteGroup"}:
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
    node_delta = 0
    edge_delta = 0
    warnings: List[str] = []
    for op in operations:
        if not isinstance(op, dict):
            continue
        t = str(op.get("type") or "")
        if t == "addNode":
            node_delta += 1
        elif t == "removeNode":
            node_delta -= 1
        elif t == "addEdge":
            edge_delta += 1
        elif t == "removeEdge":
            edge_delta -= 1
    if nodes_before + node_delta < 0:
        warnings.append("predicted_negative_node_count")
    if edges_before + edge_delta < 0:
        warnings.append("predicted_negative_edge_count")
    return PostApplyVerificationModel(
        ok=len(warnings) == 0,
        predictedNodeDelta=node_delta,
        predictedEdgeDelta=edge_delta,
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


def _build_user_prompt(
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: List[str],
    attachments: Optional[List[Dict[str, str]]] = None,
    model_catalog: Optional[Dict[str, List[Dict[str, str]]]] = None,
    canvas_state_memory: Optional[Dict[str, Any]] = None,
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

    return (
        f"Message: {message}\n\n"
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


CLOSE_CANVAS_PLAN = "Return the planned edit operations as a single JSON object."

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


def main() -> None:
    try:
        payload = _read_stdin_json()
        message = payload.get("message") or ""
        workflow_state = payload.get("workflowState") or {"nodes": [], "edges": []}
        selected_node_ids = payload.get("selectedNodeIds") or []
        attachments = _coerce_image_attachments(payload.get("attachments"))
        model_catalog = _coerce_model_catalog(payload.get("modelCatalog"))
        canvas_state_memory = _coerce_canvas_state_memory(payload.get("canvasStateMemory"))
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
        run_quality_check = bool(payload.get("runQualityCheck"))
        enforce_canvas_control = _coerce_bool(
            payload.get("enforceCanvasControl"),
            default=_coerce_bool(os.environ.get("FLOWY_ENFORCE_CANVAS_CONTROL"), default=True),
        )
        require_caution_approval = _coerce_bool(
            payload.get("requireCautionApproval"),
            default=_coerce_bool(os.environ.get("FLOWY_REQUIRE_CAUTION_APPROVAL"), default=False),
        )

        openai_key = os.environ.get("OPENAI_API_KEY")
        if not openai_key:
            sys.stdout.write(
                json.dumps(
                    {
                        "ok": False,
                        "error": "OPENAI_API_KEY missing; cannot run deep planner.",
                        "assistantText": "Deep planner unavailable (missing OPENAI_API_KEY).",
                        "operations": [],
                        "requiresApproval": False,
                        "approvalReason": "",
                        "runApprovalRequired": agent_mode == "assist",
                    }
                )
            )
            return

        planner_model_name = os.environ.get("FLOWY_PLANNER_MODEL", "gpt-4.1-mini")
        router_model_name = os.environ.get("FLOWY_ROUTER_MODEL", planner_model_name)

        planner_max_tokens: Optional[int] = None
        raw_max = os.environ.get("FLOWY_PLANNER_MAX_OUTPUT_TOKENS", "").strip()
        if raw_max:
            try:
                planner_max_tokens = int(raw_max)
            except ValueError:
                planner_max_tokens = None

        model_kwargs: Dict[str, Any] = {"api_key": openai_key, "model": planner_model_name, "temperature": 0.2}
        if planner_max_tokens is not None:
            model_kwargs["max_tokens"] = planner_max_tokens
        model = ChatOpenAI(**model_kwargs)

        router_model = ChatOpenAI(
            api_key=openai_key,
            model=router_model_name,
            temperature=0.1,
        )

        _emit_progress("init", f"mode={agent_mode}")

        if agent_mode == "plan":
            _emit_progress("advisor", "running plan advisor")
            text = _run_plan_advisor_only(
                model, message, workflow_state, selected_node_ids, attachments, model_catalog=model_catalog, canvas_state_memory=canvas_state_memory, chat_history=chat_history
            )
            sys.stdout.write(
                json.dumps(
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
                    if attachments and _looks_like_visual_assessment_request(message):
                        text = _run_plan_advisor_only(
                            model, message, workflow_state, selected_node_ids, attachments, model_catalog=model_catalog, canvas_state_memory=canvas_state_memory, chat_history=chat_history
                        )
                        sys.stdout.write(
                            json.dumps(
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
                    sys.stdout.write(
                        json.dumps(
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
        )

        ok = validated_ok
        if not parsed:
            parsed = {
                "assistantText": "Deep planner failed to produce valid JSON.",
                "operations": [],
                "requiresApproval": True,
                "approvalReason": "Planning failed.",
                "error": "invalid_json_or_empty",
                "debugLastText": last_text_debug,
            }
        elif not validated_ok:
            parsed = {
                "assistantText": parsed.get("assistantText", "Planning failed."),
                "operations": parsed.get("operations", []),
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
            "qualityCheckRequested": bool(run_quality_check),
        }
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

        if run_quality_check and ok:
            _emit_progress("quality_check", "evaluating outputs")
            qc = _check_quality(
                router_model,
                message,
                workflow_state,
                selected_node_ids,
                attachments=attachments,
                stage_instruction=current_stage_instruction,
            )
            if qc:
                out["qualityCheck"] = qc.model_dump()

        sys.stdout.write(json.dumps(out))
    except Exception as e:
        sys.stdout.write(
            json.dumps(
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

