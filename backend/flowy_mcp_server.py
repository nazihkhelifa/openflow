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

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("flowy-canvas-server")


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


def _heuristic_plan_edits(
    message: str,
    workflow_state: Optional[Dict[str, Any]] = None,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    MVP planner (heuristic):
    - If canvas is empty, build a small workflow chain based on message keywords.
    - If canvas is not empty, update any existing `prompt` nodes with the message.
    - Always returns operations compatible with `src/lib/chat/editOperations.ts`.
    """

    message_l = (message or "").lower()
    nodes = (workflow_state or {}).get("nodes") or []

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

    clear_intents = ["clear", "reset", "delete all", "remove all", "wipe", "start over"]
    if any(k in message_l for k in clear_intents):
        operations = [{"type": "removeNode", "nodeId": n["id"]} for n in nodes if "id" in n]
        explanation = "Clearing the canvas."
        return explanation, operations

    # If non-empty and we already have a prompt node, just update it.
    if not is_empty and "prompt" in {n.get("type") for n in nodes}:
        prompt_nodes = [n for n in nodes if n.get("type") == "prompt" and n.get("id")]
        operations: List[Dict[str, Any]] = []
        for pn in prompt_nodes:
            operations.append(
                {
                    "type": "updateNode",
                    "nodeId": pn["id"],
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
        return "Updating existing prompt node(s) with your request.", operations

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
            img_id = "flowy-imageInput-1"
            prompt_id = "flowy-prompt-1"
            vid_id = "flowy-generateVideo-1"

            add_node("imageInput", img_id, x0, y0, {"customTitle": "Source Image"})
            add_node("prompt", prompt_id, x0 + 260, y0, {"customTitle": "Prompt", "prompt": message})
            add_node("generateVideo", vid_id, x0 + 520, y0, {"customTitle": "Generate Video"})

            # imageInput.image -> prompt.image
            add_edge(img_id, prompt_id, "image", "image")
            # prompt.text -> generateVideo.text
            add_edge(prompt_id, vid_id, "text", "text")
            # imageInput.image -> generateVideo.image
            add_edge(img_id, vid_id, "image", "image")
            return "Building an image-to-video workflow.", operations

        # Default: image workflow
        img_id = "flowy-imageInput-1"
        prompt_id = "flowy-prompt-1"
        gen_id = "flowy-generateImage-1"

        add_node("imageInput", img_id, x0, y0, {"customTitle": "Source Image"})
        add_node("prompt", prompt_id, x0 + 260, y0, {"customTitle": "Prompt", "prompt": message})
        add_node("generateImage", gen_id, x0 + 520, y0, {"customTitle": "Generate Image"})

        # imageInput.image -> prompt.image
        add_edge(img_id, prompt_id, "image", "image")
        # prompt.text -> generateImage.text
        add_edge(prompt_id, gen_id, "text", "text")
        # imageInput.image -> generateImage.image
        add_edge(img_id, gen_id, "image", "image")
        return "Building an image-to-image workflow.", operations

    # Non-empty + no prompt node: add prompt only and update it.
    add_node("prompt", "flowy-prompt-1", x0, y0, {"customTitle": "Prompt", "prompt": message})
    return "Adding a new prompt node.", operations


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
        if op_type not in {"addNode", "removeNode", "updateNode", "addEdge", "removeEdge"}:
            return {
                "ok": False,
                "error": f"operations[{idx}].type must be one of addNode/removeNode/updateNode/addEdge/removeEdge",
                "applied": 0,
            }

    # Stub: pretend it's applied
    return {"ok": True, "applied": len(operations), "skipped": []}


@mcp.tool()
def plan_edits(
    message: str,
    workflow_state: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Plan edit operations for the canvas.

    MVP behavior:
    - Builds a minimal chain when the canvas is empty.
    - Updates existing prompt nodes when possible.
    - Returns `requiresApproval: true` so callers can gate apply actions.
    """

    explanation, operations = _heuristic_plan_edits(message=message, workflow_state=workflow_state)
    return {
        "assistantText": explanation,
        "operations": operations,
        "requiresApproval": True,
        "approvalReason": "Assist mode: user approval required before applying edits.",
    }


if __name__ == "__main__":
    # IMPORTANT: MCP stdio transport expects the server process to own stdout.
    # FastMCP handles the JSON-RPC plumbing.
    mcp.run()

