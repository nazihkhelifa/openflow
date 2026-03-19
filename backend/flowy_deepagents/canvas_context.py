"""
Build a token-bounded JSON-serializable view of the workflow for the LLM planner.

Strips base64 and long strings; prioritizes selected nodes + N-hop graph neighborhood.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Set


def _truncate_str(s: str, max_len: int) -> str:
    t = s.replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 3] + "..."


def _sanitize_value(key: str, val: Any, depth: int = 0) -> Any:
    if depth > 6:
        return "[nested omitted]"
    if val is None or isinstance(val, (bool, int, float)):
        return val
    if isinstance(val, str):
        if val.startswith("data:") or val.startswith("blob:"):
            return f"[binary url, {len(val)} chars]"
        return _truncate_str(val, 420)
    if isinstance(val, list):
        if not val:
            return []
        if all(isinstance(x, str) for x in val):
            if any(
                isinstance(x, str) and (x.startswith("data:") or len(x) > 200)
                for x in val
            ):
                return f"[{len(val)} strings, binary/long omitted]"
        out: List[Any] = []
        max_items = 12
        for i, item in enumerate(val[:max_items]):
            out.append(_sanitize_value(f"{key}[{i}]", item, depth + 1))
        if len(val) > max_items:
            out.append(f"... +{len(val) - max_items} more")
        return out
    if isinstance(val, dict):
        out_d: Dict[str, Any] = {}
        skip_keys = {
            "imageHistory",
            "videoHistory",
            "selectedHistoryIndex",
            "selectedVideoHistoryIndex",
        }
        binary_keys = {
            "image",
            "outputImage",
            "sourceImage",
            "audioFile",
            "videoFile",
            "glbUrl",
            "capturedImage",
            "outputAudio",
            "outputVideo",
        }
        ref_keys = {"imageRef", "outputImageRef", "sourceImageRef", "inputImageRefs", "outputVideoRef"}
        for k, v in val.items():
            if k in skip_keys:
                continue
            if k in binary_keys or k in ref_keys:
                if v is None:
                    out_d[k] = None
                elif isinstance(v, str) and v.startswith("data:"):
                    out_d[k] = f"[binary, {len(v)} chars]"
                elif isinstance(v, list):
                    out_d[k] = f"[{len(v)} items omitted]"
                else:
                    out_d[k] = "[omitted]"
                continue
            out_d[k] = _sanitize_value(k, v, depth + 1)
        return out_d
    return str(val)[:120]


def _neighbors(edges: List[Dict[str, Any]]) -> Dict[str, Set[str]]:
    adj: Dict[str, Set[str]] = {}
    for e in edges:
        if not isinstance(e, dict):
            continue
        s, t = e.get("source"), e.get("target")
        if not s or not t:
            continue
        adj.setdefault(str(s), set()).add(str(t))
        adj.setdefault(str(t), set()).add(str(s))
    return adj


def _expand_focus(
    seed: Set[str], adj: Dict[str, Set[str]], hops: int, all_ids: Set[str]
) -> Set[str]:
    """
    Nodes within `hops` graph hops of any seed id (undirected).
    If seed is empty, returns all_ids.
    """
    if not seed:
        return set(all_ids)
    visited: Set[str] = set()
    current = (seed & all_ids) or set(all_ids)
    for hop in range(hops + 1):
        visited |= current
        if hop == hops:
            break
        nxt: Set[str] = set()
        for nid in current:
            nxt |= adj.get(nid, set()) & all_ids
        current = nxt - visited
    return visited


def build_canvas_context_for_llm(
    workflow_state: Dict[str, Any],
    selected_node_ids: Optional[List[str]] = None,
    neighbor_hops: int = 2,
    focus_max_nodes: int = 72,
    max_total_chars: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Returns a dict safe to embed in the user prompt (JSON-serializable).
    """
    if max_total_chars is None:
        try:
            max_total_chars = int(os.environ.get("FLOWY_MAX_CANVAS_CONTEXT_CHARS", "32000"))
        except ValueError:
            max_total_chars = 32000

    nodes_raw = workflow_state.get("nodes") or []
    edges_raw = workflow_state.get("edges") or []
    groups_raw = workflow_state.get("groups") or {}

    if not isinstance(nodes_raw, list):
        nodes_raw = []
    if not isinstance(edges_raw, list):
        edges_raw = []
    if not isinstance(groups_raw, dict):
        groups_raw = {}

    nodes_by_id: Dict[str, Dict[str, Any]] = {}
    for n in nodes_raw:
        if not isinstance(n, dict):
            continue
        nid = n.get("id")
        if not nid:
            continue
        nodes_by_id[str(nid)] = n

    all_ids = set(nodes_by_id.keys())
    seed = set(str(x) for x in (selected_node_ids or []) if x)
    adj = _neighbors([e for e in edges_raw if isinstance(e, dict)])

    focus_ids = _expand_focus(seed, adj, neighbor_hops, all_ids)

    # Cap focus size: keep seeds first, then BFS order
    if len(focus_ids) > focus_max_nodes:
        ordered: List[str] = []
        seen: Set[str] = set()
        for sid in seed:
            if sid in focus_ids and sid not in seen:
                ordered.append(sid)
                seen.add(sid)
        q = list(ordered)
        while q and len(ordered) < focus_max_nodes:
            cur = q.pop(0)
            for nb in sorted(adj.get(cur, ())):
                if nb in focus_ids and nb not in seen:
                    seen.add(nb)
                    ordered.append(nb)
                    q.append(nb)
        for nid in sorted(focus_ids):
            if len(ordered) >= focus_max_nodes:
                break
            if nid not in seen:
                ordered.append(nid)
        focus_ids = set(ordered[:focus_max_nodes])

    detailed: List[Dict[str, Any]] = []
    for nid in sorted(focus_ids):
        n = nodes_by_id.get(nid)
        if not n:
            continue
        pos = n.get("position") or {}
        entry: Dict[str, Any] = {
            "id": nid,
            "type": n.get("type"),
            "position": {
                "x": pos.get("x") if isinstance(pos, dict) else None,
                "y": pos.get("y") if isinstance(pos, dict) else None,
            },
        }
        if n.get("groupId"):
            entry["groupId"] = n.get("groupId")
        data = n.get("data")
        if isinstance(data, dict) and data:
            entry["data"] = _sanitize_value("data", data)
        detailed.append(entry)

    outline: List[Dict[str, Any]] = []
    for nid in sorted(all_ids - focus_ids):
        n = nodes_by_id[nid]
        o: Dict[str, Any] = {"id": nid, "type": n.get("type")}
        if n.get("groupId"):
            o["groupId"] = n.get("groupId")
        outline.append(o)

    edges_out: List[Dict[str, Any]] = []
    for e in edges_raw:
        if not isinstance(e, dict):
            continue
        edges_out.append(
            {
                "id": e.get("id"),
                "source": e.get("source"),
                "target": e.get("target"),
                "sourceHandle": e.get("sourceHandle"),
                "targetHandle": e.get("targetHandle"),
            }
        )

    groups_summary: List[Dict[str, Any]] = []
    for gid, g in groups_raw.items():
        if not isinstance(g, dict):
            continue
        member_count = sum(
            1 for n in nodes_by_id.values() if str(n.get("groupId") or "") == str(gid)
        )
        groups_summary.append(
            {
                "id": str(gid),
                "name": g.get("name"),
                "color": g.get("color"),
                "locked": g.get("locked"),
                "memberNodeCount": member_count,
            }
        )

    ctx: Dict[str, Any] = {
        "summary": {
            "nodeCount": len(all_ids),
            "edgeCount": len(edges_out),
            "groupCount": len(groups_summary),
            "selectedNodeIds": list(seed),
            "focusNodeIds": sorted(focus_ids),
            "focusNeighborHops": neighbor_hops,
            "outlineNodeCount": len(outline),
        },
        "nodesDetailed": detailed,
        "nodesOutline": outline,
        "edges": edges_out,
        "groups": groups_summary,
    }

    # Shrink if still too large: drop outline data fields, shorten strings in detailed
    def measure() -> int:
        return len(json.dumps(ctx, ensure_ascii=False))

    while measure() > max_total_chars and ctx["nodesOutline"]:
        ctx["nodesOutline"] = ctx["nodesOutline"][: max(0, len(ctx["nodesOutline"]) // 2)]
        ctx["summary"]["outlineTruncated"] = True

    shrink_pass = 0
    while measure() > max_total_chars and shrink_pass < 5:
        shrink_pass += 1
        for n in ctx["nodesDetailed"]:
            d = n.get("data")
            if isinstance(d, dict) and "prompt" in d and isinstance(d["prompt"], str):
                d["prompt"] = _truncate_str(d["prompt"], 180)
        if measure() > max_total_chars:
            ctx["nodesDetailed"] = ctx["nodesDetailed"][: max(1, len(ctx["nodesDetailed"]) // 2)]
            ctx["summary"]["nodesDetailedTruncated"] = True

    focus_for_edges = set(ctx["summary"].get("focusNodeIds") or [])
    edge_pass = 0
    while measure() > max_total_chars and len(ctx["edges"]) > 32 and edge_pass < 6:
        edge_pass += 1

        def _edge_pri(e: Dict[str, Any]) -> int:
            s, t = e.get("source"), e.get("target")
            if s in focus_for_edges or t in focus_for_edges:
                return 0
            return 1

        ctx["edges"] = sorted(ctx["edges"], key=_edge_pri)
        keep = max(32, len(ctx["edges"]) * 3 // 4)
        ctx["edges"] = ctx["edges"][:keep]
        ctx["summary"]["edgesTruncated"] = True

    ctx["summary"]["approxJsonChars"] = measure()
    return ctx


def load_planner_schema(script_dir: str) -> Dict[str, Any]:
    """Load planner_schema.json from repo src/lib/flowy/."""
    repo_root = os.path.abspath(os.path.join(script_dir, "..", ".."))
    path = os.path.join(repo_root, "src", "lib", "flowy", "planner_schema.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
