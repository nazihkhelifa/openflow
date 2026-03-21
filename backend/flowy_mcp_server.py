"""
Flowy MCP server (Python).

MVP goal:
- Expose MCP tools that Flowly can call to read/apply canvas edits.
- For now, tools validate input shape and return a structured result.

Next step:
- Replace the stub implementations with real calls into the Next.js app
  (e.g., via an HTTP bridge endpoint).
"""

from __future__ import annotations

import os
import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("flowy-canvas-server")

def _get_site_base_url() -> str:
    # Used for HTTP bridge tools that call your Next.js API routes.
    # Default matches typical Next.js dev server port.
    return os.environ.get("FLOWY_SITE_BASE_URL", "http://localhost:3000").rstrip("/")


def _post_json(url: str, payload: Dict[str, Any], timeout_s: int = 90) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code} calling {url}: {body[:500]}") from e
    except URLError as e:
        raise RuntimeError(f"Network error calling {url}: {e}") from e


@mcp.tool()
def ping() -> str:
    """Healthcheck for the Flowly MCP server."""

    return "pong"


@mcp.tool()
def get_canvas_state() -> Dict[str, Any]:
    """
    Return the current canvas state.

    MVP stub:
    - Next.js should provide a bridge endpoint later.
    - For now, return an empty state so the model can proceed to planning.
    """

    return {
        "nodes": [],
        "edges": [],
        "groups": [],
        "selectedNodeIds": [],
        "version": 1,
    }


@mcp.tool()
def get_canvas_state_project(project_id: str) -> Dict[str, Any]:
    """
    Fetch canvas state for a file-backed project from the website API.

    This allows the agent to plan using real nodes/edges without the UI
    needing to send workflowState.
    """
    base_url = _get_site_base_url()
    # Note: use GET for the state endpoint.
    url = f"{base_url}/api/flowy/canvas-state?projectId={project_id}"
    try:
        req = Request(url, method="GET")
        with urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            payload = json.loads(raw)
            if not isinstance(payload, dict) or not payload.get("ok"):
                return {"nodes": [], "edges": [], "groups": [], "selectedNodeIds": [], "version": 1, "error": payload.get("error")}
            ws = payload.get("workflowState") or {}
            return {
                "nodes": ws.get("nodes") or [],
                "edges": ws.get("edges") or [],
                "groups": ws.get("groups") or [],
                "selectedNodeIds": [],
                "version": payload.get("version") or 1,
                "directoryPath": payload.get("directoryPath"),
            }
    except Exception as e:
        return {
            "nodes": [],
            "edges": [],
            "groups": [],
            "selectedNodeIds": [],
            "version": 1,
            "error": str(e),
        }


def _heuristic_plan_edits(
    message: str,
    workflow_state: Optional[Dict[str, Any]] = None,
    selected_node_ids: Optional[List[str]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    MVP planner (heuristic):
    - If canvas is empty, build a small workflow chain based on message keywords.
    - If canvas is not empty, update any existing `prompt` nodes with the message.
    - Always returns operations compatible with `src/lib/chat/editOperations.ts`.
    """

    message_l = (message or "").lower()
    nodes = (workflow_state or {}).get("nodes") or []
    edges = (workflow_state or {}).get("edges") or []
    selected_node_ids = selected_node_ids or []

    # Basic geometry defaults
    max_x = 0
    if nodes:
        for n in nodes:
            p = n.get("position") or {}
            try:
                max_x = max(max_x, float(p.get("x", 0)) or 0)
            except Exception:
                pass

    is_empty = len(nodes) == 0

    nodes_by_id: Dict[str, Any] = {n.get("id"): n for n in nodes if n.get("id")}

    selected_set = set(selected_node_ids)

    def edge_exists(
        source: str,
        target: str,
        source_handle: Optional[str],
        target_handle: Optional[str],
    ) -> bool:
        for e in edges:
            try:
                if (
                    e.get("source") == source
                    and e.get("target") == target
                    and (source_handle is None or e.get("sourceHandle") == source_handle)
                    and (target_handle is None or e.get("targetHandle") == target_handle)
                ):
                    return True
            except Exception:
                continue
        return False

    def is_image_source_type(node_type: Optional[str]) -> bool:
        # Nodes that can output an "image" handle in our current canvas model
        return node_type in {
            "mediaInput",
            "generateImage",
            "generate3d",
            "glbViewer",
            "imageCompare",
            "videoFrameGrab",
        }

    # Intent detection: when user asks to connect/add "genre image" (or similar),
    # we should add a mediaInput source and wire it to the prompt's image input.
    wants_new_image_source = (
        "genre" in message_l
        or "reference image" in message_l
        or ("reference" in message_l and "image" in message_l)
        or "style image" in message_l
        or (
            ("connect" in message_l or "add image" in message_l or "another image" in message_l)
            and "image" in message_l
        )
    )

    def _update_prompt_nodes(prompt_ids: List[str]) -> Tuple[str, List[Dict[str, Any]]]:
        prompt_ids = [pid for pid in prompt_ids if pid in nodes_by_id]
        if not prompt_ids:
            return ("No matching prompt nodes to update.", [])
        operations: List[Dict[str, Any]] = []
        for pid in prompt_ids:
            operations.append(
                {
                    "type": "updateNode",
                    "nodeId": pid,
                    "data": {
                        "prompt": message,
                        "customTitle": (
                            "Prompt: "
                            + message.replace("\n", " ").strip()[:24]
                            + ("..." if len(message.replace("\n", " ").strip()) > 24 else "")
                        ),
                    },
                }
            )
        return ("Updating selected prompt node(s).", operations)

    # If the user selected nodes, prefer updating the prompt nodes that connect to them.
    if selected_set:
        # Compute prompts that receive image from the selected nodes.
        image_to_prompt_prompt_ids: List[str] = []
        for e in edges:
            try:
                if (
                    e.get("source") in selected_set
                    and e.get("targetHandle") == "image"
                    and nodes_by_id.get(e.get("target"), {}).get("type") == "prompt"
                ):
                    image_to_prompt_prompt_ids.append(e.get("target"))
            except Exception:
                continue

        if wants_new_image_source:
            # Determine which prompt should receive the new "genre/reference" image.
            # Sources:
            # 1) prompts selected directly
            # 2) prompts that receive image directly from selected nodes
            # 3) prompts that drive selected generation nodes via prompt.text -> generate.text
            selected_prompt_ids = [
                nid
                for nid in selected_node_ids
                if nodes_by_id.get(nid, {}).get("type") == "prompt" and nodes_by_id.get(nid, {}).get("id")
            ]

            prompt_driving_selected_generates: List[str] = []
            for e in edges:
                try:
                    if (
                        e.get("target") in selected_set
                        and e.get("targetHandle") == "text"
                        and nodes_by_id.get(e.get("source"), {}).get("type") == "prompt"
                    ):
                        prompt_driving_selected_generates.append(e.get("source"))
                except Exception:
                    continue

            prompt_target_candidates = list(
                dict.fromkeys([*selected_prompt_ids, *image_to_prompt_prompt_ids, *prompt_driving_selected_generates])
            )
            prompt_target_id = prompt_target_candidates[0] if prompt_target_candidates else None

            prompt_id = prompt_target_id or "flowy-prompt-1"
            genre_image_id = "flowy-genre-mediaInput-1"

            operations: List[Dict[str, Any]] = []

            x0 = max_x + 260
            y0 = 0

            def add_node(op_node_type: str, node_id: str, x: float, y: float, data: Optional[Dict[str, Any]] = None):
                op: Dict[str, Any] = {
                    "type": "addNode",
                    "nodeType": op_node_type,
                    "nodeId": node_id,
                    "position": {"x": x, "y": y},
                }
                if data:
                    op["data"] = data
                operations.append(op)

            def add_edge_local(source: str, target: str, source_handle: str, target_handle: str):
                if edge_exists(source, target, source_handle, target_handle):
                    return
                operations.append(
                    {
                        "type": "addEdge",
                        "source": source,
                        "target": target,
                        "sourceHandle": source_handle,
                        "targetHandle": target_handle,
                    }
                )

            # If no prompt is connected to the selected images, create it.
            if prompt_target_id is None:
                add_node(
                    "prompt",
                    prompt_id,
                    x0,
                    y0,
                    {"customTitle": "Prompt", "prompt": message},
                )

                # Wire selected image sources into the prompt
                for sid in selected_node_ids:
                    if not is_image_source_type(nodes_by_id.get(sid, {}).get("type")):
                        continue
                    add_edge_local(sid, prompt_id, "image", "image")
            else:
                operations.append(
                    {
                        "type": "updateNode",
                        "nodeId": prompt_target_id,
                        "data": {
                            "prompt": message,
                            "customTitle": (
                                "Prompt: "
                                + message.replace("\n", " ").strip()[:24]
                                + ("..." if len(message.replace("\n", " ").strip()) > 24 else "")
                            ),
                        },
                    }
                )

            # Add the genre image input and connect it to prompt.image
            add_node(
                "mediaInput",
                genre_image_id,
                x0 + 260,
                y0,
                {"customTitle": "Genre Image", "mode": "image"},
            )
            add_edge_local(genre_image_id, prompt_id, "image", "image")

            # Connect prompt.text -> a generation node.
            # Prefer generation nodes the user selected.
            generate_image_types = {"generateImage", "generateVideo", "generate3d"}
            selected_gen_nodes = [
                nid
                for nid in selected_node_ids
                if nodes_by_id.get(nid, {}).get("type")
                in {"generateImage", "generateVideo", "generate3d", "generateAudio"}
            ]

            if selected_gen_nodes:
                gen_id = selected_gen_nodes[0]
                gen_type = nodes_by_id.get(gen_id, {}).get("type")
            else:
                generate_text_nodes = [
                    nid
                    for nid, n in nodes_by_id.items()
                    if n.get("type") in ({"generateImage", "generateVideo", "generate3d", "generateAudio"})
                ]
                gen_id = generate_text_nodes[0] if generate_text_nodes else None
                gen_type = nodes_by_id.get(gen_id, {}).get("type") if gen_id else None

            if gen_id and gen_type:

                add_edge_local(prompt_id, gen_id, "text", "text")
                if gen_type in generate_image_types:
                    # Feed images into the generation node
                    for sid in selected_node_ids:
                        if not is_image_source_type(nodes_by_id.get(sid, {}).get("type")):
                            continue
                        add_edge_local(sid, gen_id, "image", "image")
                    add_edge_local(genre_image_id, gen_id, "image", "image")

            return ("Adding and connecting a genre image node.", operations)

        selected_prompt_ids = [
            nid
            for nid in selected_node_ids
            if nodes_by_id.get(nid, {}).get("type") == "prompt" and nodes_by_id.get(nid, {}).get("id")
        ]
        if selected_prompt_ids:
            return _update_prompt_nodes(selected_prompt_ids)

        # If selected includes generate nodes, update their connected prompt(s) (prompt.text -> generate.*.text)
        target_prompt_ids: List[str] = []
        for e in edges:
            try:
                if (
                    e.get("target") in selected_set
                    and e.get("targetHandle") == "text"
                    and nodes_by_id.get(e.get("source"), {}).get("type") == "prompt"
                ):
                    target_prompt_ids.append(e.get("source"))
            except Exception:
                continue
        if target_prompt_ids:
            return _update_prompt_nodes(list(dict.fromkeys(target_prompt_ids)))

        # If selected includes image input nodes, update prompts receiving image (image -> prompt.image).
        image_to_prompt_prompt_ids: List[str] = []
        for e in edges:
            try:
                if (
                    e.get("source") in selected_set
                    and e.get("targetHandle") == "image"
                    and nodes_by_id.get(e.get("target"), {}).get("type") == "prompt"
                ):
                    image_to_prompt_prompt_ids.append(e.get("target"))
            except Exception:
                continue
        if image_to_prompt_prompt_ids:
            return _update_prompt_nodes(list(dict.fromkeys(image_to_prompt_prompt_ids)))

    clear_intents = ["clear", "reset", "delete all", "remove all", "wipe", "start over"]
    if any(k in message_l for k in clear_intents):
        operations = [{"type": "removeNode", "nodeId": n["id"]} for n in nodes if "id" in n]
        explanation = "Clearing the canvas."
        return explanation, operations

    # If non-empty and we already have a prompt node, just update it.
    if not is_empty and "prompt" in {n.get("type") for n in nodes}:
        prompt_nodes = [n for n in nodes if n.get("type") == "prompt" and n.get("id")]
        return _update_prompt_nodes([pn["id"] for pn in prompt_nodes])

    # Otherwise build a new chain near the right side.
    x0 = max_x + 260
    y0 = 0

    operations: List[Dict[str, Any]] = []

    def add_node(
        node_type: str,
        node_id: str,
        x: float,
        y: float,
        data: Optional[Dict[str, Any]] = None,
    ):
        op: Dict[str, Any] = {
            "type": "addNode",
            "nodeType": node_type,
            "nodeId": node_id,
            "position": {"x": x, "y": y},
        }
        if data:
            op["data"] = data
        operations.append(op)

    def add_edge(source: str, target: str, source_handle: str, target_handle: str):
        operations.append(
            {
                "type": "addEdge",
                "source": source,
                "target": target,
                "sourceHandle": source_handle,
                "targetHandle": target_handle,
            }
        )

    if is_empty:
        if "video" in message_l or "movie" in message_l:
            img_id = "flowy-mediaInput-1"
            prompt_id = "flowy-prompt-1"
            vid_id = "flowy-generateVideo-1"

            add_node("mediaInput", img_id, x0, y0, {"customTitle": "Source Image", "mode": "image"})
            add_node("prompt", prompt_id, x0 + 260, y0, {"customTitle": "Prompt", "prompt": message})
            add_node("generateVideo", vid_id, x0 + 520, y0, {"customTitle": "Generate Video"})

            # mediaInput.image -> prompt.image
            add_edge(img_id, prompt_id, "image", "image")
            # prompt.text -> generateVideo.text
            add_edge(prompt_id, vid_id, "text", "text")
            # mediaInput.image -> generateVideo.image
            add_edge(img_id, vid_id, "image", "image")
            return "Building an image-to-video workflow.", operations

        # Default: image workflow
        img_id = "flowy-mediaInput-1"
        prompt_id = "flowy-prompt-1"
        gen_id = "flowy-generateImage-1"

        add_node("mediaInput", img_id, x0, y0, {"customTitle": "Source Image", "mode": "image"})
        add_node("prompt", prompt_id, x0 + 260, y0, {"customTitle": "Prompt", "prompt": message})
        add_node("generateImage", gen_id, x0 + 520, y0, {"customTitle": "Generate Image"})

        # mediaInput.image -> prompt.image
        add_edge(img_id, prompt_id, "image", "image")
        # prompt.text -> generateImage.text
        add_edge(prompt_id, gen_id, "text", "text")
        # mediaInput.image -> generateImage.image
        add_edge(img_id, gen_id, "image", "image")
        return "Building an image-to-image workflow.", operations

    # Non-empty + no prompt node:
    # Create a prompt and wire selected image inputs into prompt.image.
    # Also try to attach prompt.text to the first existing generate node so it becomes usable.
    prompt_id = "flowy-prompt-1"
    add_node("prompt", prompt_id, x0, y0, {"customTitle": "Prompt", "prompt": message})

    image_source_ids = [
        sid
        for sid in selected_node_ids
        if is_image_source_type(nodes_by_id.get(sid, {}).get("type"))
    ]

    for sid in image_source_ids:
        if not edge_exists(sid, prompt_id, "image", "image"):
            add_edge(sid, prompt_id, "image", "image")

    generate_targets = [
        nid
        for nid, n in nodes_by_id.items()
        if n.get("type") in {"generateImage", "generateVideo", "generate3d", "generateAudio"}
    ]

    if generate_targets:
        gen_id = generate_targets[0]
        gen_type = nodes_by_id.get(gen_id, {}).get("type")
        if not edge_exists(prompt_id, gen_id, "text", "text"):
            add_edge(prompt_id, gen_id, "text", "text")

        if gen_type in {"generateImage", "generateVideo", "generate3d"}:
            for sid in image_source_ids:
                if not edge_exists(sid, gen_id, "image", "image"):
                    add_edge(sid, gen_id, "image", "image")

    return "Added a new prompt node and wired it into your selected pipeline.", operations


@mcp.tool()
def apply_edit_operations(operations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Apply edit operations to the canvas.

    MVP stub:
    - Validates basic shape
    - Does not mutate the canvas yet
    """

    if not isinstance(operations, list):
        return {"ok": False, "error": "operations must be a list", "applied": 0}

    for idx, op in enumerate(operations):
        if not isinstance(op, dict):
            return {
                "ok": False,
                "error": f"operations[{idx}] must be an object",
                "applied": 0,
            }

        op_type = op.get("type")
        if op_type not in {
            "addNode",
            "removeNode",
            "updateNode",
            "addEdge",
            "removeEdge",
            "moveNode",
            "createGroup",
            "deleteGroup",
            "updateGroup",
            "setNodeGroup",
            "clearCanvas",
        }:
            return {
                "ok": False,
                "error": f"operations[{idx}].type is not a supported EditOperation type",
                "applied": 0,
            }

    # Stub: pretend it's applied
    return {"ok": True, "applied": len(operations), "skipped": []}


@mcp.tool()
def plan_edits(
    message: str,
    workflow_state: Optional[Dict[str, Any]] = None,
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Plan edit operations for the canvas.

    MVP behavior:
    - Builds a minimal chain when the canvas is empty.
    - Updates existing prompt nodes when possible.
    - Returns `requiresApproval: true` so callers can gate apply actions.
    """

    explanation, operations = _heuristic_plan_edits(
        message=message,
        workflow_state=workflow_state,
        selected_node_ids=selected_node_ids,
    )
    return {
        "assistantText": explanation,
        "operations": operations,
        "requiresApproval": True,
        "approvalReason": "Assist mode: user approval required before applying edits.",
    }


@mcp.tool()
def plan_edits_web(
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Plan edit operations by calling the website planner endpoint.

    This tool expects the caller to provide the current canvas state
    (nodes + edges) because the canvas state is not persisted server-side.
    """
    selected_node_ids = selected_node_ids or []
    base_url = _get_site_base_url()
    result = _post_json(
        f"{base_url}/api/flowy/plan",
        {
            "message": message,
            "workflowState": workflow_state,
            "selectedNodeIds": selected_node_ids,
        },
    )
    return result


@mcp.tool()
def plan_and_apply_edits_web(
    message: str,
    workflow_state: Dict[str, Any],
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Plan + apply edits by calling the website planner and apply endpoints.

    Returns the updated workflow state computed by /api/flowy/apply.
    Note: the website apply route is pure (takes workflowState as input),
    so callers must provide the current workflow_state.
    """
    selected_node_ids = selected_node_ids or []
    base_url = _get_site_base_url()

    plan = _post_json(
        f"{base_url}/api/flowy/plan",
        {
            "message": message,
            "workflowState": workflow_state,
            "selectedNodeIds": selected_node_ids,
        },
    )

    if not isinstance(plan, dict) or not plan.get("ok"):
        return plan

    operations = plan.get("operations") or []
    applied = _post_json(
        f"{base_url}/api/flowy/apply",
        {
            "workflowState": workflow_state,
            "operations": operations,
        },
    )
    # Combine plan metadata + apply result so clients can render cursor/timeline too.
    return {
        "ok": applied.get("ok", False),
        "assistantText": plan.get("assistantText", ""),
        "operations": operations,
        "requiresApproval": False,
        "applied": applied.get("applied"),
        "skipped": applied.get("skipped"),
        "nodes": applied.get("nodes"),
        "edges": applied.get("edges"),
    }


@mcp.tool()
def plan_edits_project(
    message: str,
    project_id: str,
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Plan edit operations for a file-backed project stored on disk.

    This uses the website route `/api/flowy/plan` with `projectId`,
    so the server loads canvas state from the project directory.
    """
    selected_node_ids = selected_node_ids or []
    base_url = _get_site_base_url()
    return _post_json(
        f"{base_url}/api/flowy/plan",
        {
            "message": message,
            "projectId": project_id,
            "selectedNodeIds": selected_node_ids,
        },
    )


@mcp.tool()
def plan_and_apply_edits_project(
    message: str,
    project_id: str,
    selected_node_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Plan + apply edit operations for a file-backed project stored on disk.

    Flow:
    - POST /api/flowy/plan with `projectId`
    - POST /api/flowy/apply with `projectId` and `operations`
    """
    selected_node_ids = selected_node_ids or []
    base_url = _get_site_base_url()

    plan = _post_json(
        f"{base_url}/api/flowy/plan",
        {
            "message": message,
            "projectId": project_id,
            "selectedNodeIds": selected_node_ids,
        },
    )

    if not isinstance(plan, dict) or not plan.get("ok"):
        return plan

    operations = plan.get("operations") or []
    applied = _post_json(
        f"{base_url}/api/flowy/apply",
        {
            "projectId": project_id,
            "operations": operations,
        },
    )

    return {
        "ok": applied.get("ok", False),
        "assistantText": plan.get("assistantText", ""),
        "operations": operations,
        "requiresApproval": False,
        "applied": applied.get("applied"),
        "skipped": applied.get("skipped"),
        "nodes": applied.get("nodes"),
        "edges": applied.get("edges"),
    }


if __name__ == "__main__":
    # IMPORTANT: MCP stdio transport expects the server process to own stdout.
    # FastMCP handles the JSON-RPC plumbing.
    mcp.run()

