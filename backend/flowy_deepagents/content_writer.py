#!/usr/bin/env python3
from __future__ import annotations

import functools
import json
import os
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

from langchain_core.messages import HumanMessage, SystemMessage  # type: ignore
from langchain_openai import ChatOpenAI  # type: ignore

from canvas_context import build_canvas_context_for_llm, load_planner_schema


FLOWY_DEEPAGENTS_DIR = os.path.join(os.path.dirname(__file__), "")


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

    return {"ok": not errors, "errors": errors}


def _read_text_file(rel_path: str) -> str:
    abs_path = os.path.join(FLOWY_DEEPAGENTS_DIR, rel_path)
    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def _build_system_prompt() -> str:
    # AGENTS.md already contains the hard "JSON only" rule.
    agents_md = _read_text_file("AGENTS.md").strip()
    skill_md = _read_text_file(os.path.join("skills", "flowy-plan", "SKILL.md")).strip()
    if skill_md:
        return agents_md + "\n\nSkill:\n" + skill_md
    return agents_md


def _build_user_prompt(message: str, workflow_state: Dict[str, Any], selected_node_ids: List[str]) -> str:
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

    return (
        f"Message: {message}\n\n"
        "Current workflow (JSON). Use nodesDetailed for full context near the user's selection; "
        "nodesOutline lists other nodes by id/type only; edges are the full graph.\n"
        f"{canvas_json}\n\n"
        "Return the planned edit operations as a single JSON object."
    )


def main() -> None:
    try:
        payload = _read_stdin_json()
        message = payload.get("message") or ""
        workflow_state = payload.get("workflowState") or {"nodes": [], "edges": []}
        selected_node_ids = payload.get("selectedNodeIds") or []

        openai_key = os.environ.get("OPENAI_API_KEY")
        if not openai_key:
            sys.stdout.write(
                json.dumps(
                    {
                        "ok": False,
                        "error": "OPENAI_API_KEY missing; cannot run deep planner.",
                        "assistantText": "Deep planner unavailable (missing OPENAI_API_KEY).",
                        "operations": [],
                        "requiresApproval": True,
                        "approvalReason": "No planning possible without an LLM.",
                    }
                )
            )
            return

        model = ChatOpenAI(
            api_key=openai_key,
            model="gpt-4.1-mini",
            temperature=0.2,
        )
        system_prompt = _build_system_prompt()

        parsed: Dict[str, Any] = {}
        validated_ok = False
        last_errors: List[str] = []
        last_text_debug: str = ""

        for attempt in range(3):
            user_prompt = _build_user_prompt(message, workflow_state, selected_node_ids)
            if attempt > 0 and last_errors:
                user_prompt += (
                    "\n\nYour previous operations were invalid:\n"
                    + "\n".join(f"- {e}" for e in last_errors)
                    + "\n\nReturn ONLY corrected JSON."
                )
            # JSON mode guarantees parseable JSON output (we still validate shape below).
            resp = model.invoke(
                [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)],
                response_format={"type": "json_object"},
            )
            last_text = str(getattr(resp, "content", "") or "")
            last_text_debug = last_text[:2000] if last_text else ""

            try:
                candidate = json.loads(last_text)
                if not isinstance(candidate, dict):
                    candidate = _safe_extract_first_json_object(last_text)
            except Exception:
                candidate = _safe_extract_first_json_object(last_text)

            if not candidate:
                parsed = {}
                last_errors = ["LLM did not return valid JSON."]
                continue

            operations = candidate.get("operations", [])
            validation = _validate_edit_operations(operations, workflow_state)
            if validation.get("ok"):
                parsed = candidate
                validated_ok = True
                break

            parsed = candidate
            last_errors = validation.get("errors", ["validation_failed"])

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
            "assistantText": parsed.get("assistantText", ""),
            "operations": parsed.get("operations", []),
            "requiresApproval": True,
            "approvalReason": parsed.get("approvalReason", "Assist mode: user approval required."),
        }
        # Always include debug so the UI can show what the model returned.
        out["debugLastText"] = last_text_debug
        if parsed.get("executeNodeIds") is not None:
            out["executeNodeIds"] = parsed.get("executeNodeIds")
        if parsed.get("runApprovalRequired") is not None:
            out["runApprovalRequired"] = parsed.get("runApprovalRequired")
        if not ok:
            out["error"] = parsed.get("error", "deep_agent_planning_failed")

        sys.stdout.write(json.dumps(out))
    except Exception as e:
        sys.stdout.write(
            json.dumps(
                {
                    "ok": False,
                    "error": f"Deep planner crashed: {e}",
                    "assistantText": "Deep planner crashed. Try again.",
                    "operations": [],
                    "requiresApproval": True,
                    "approvalReason": "Planning failed.",
                    "debugLastText": (locals().get("last_text_debug") or "")[:2000],
                }
            )
        )


if __name__ == "__main__":
    main()

