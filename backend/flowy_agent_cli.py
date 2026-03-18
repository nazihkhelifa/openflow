from __future__ import annotations

import json
import sys
from typing import Any, Dict, Optional


def _read_stdin_json() -> Dict[str, Any]:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON on stdin: {e}") from e


def main() -> None:
    payload = _read_stdin_json()
    message = payload.get("message") or ""
    workflow_state = payload.get("workflowState") or payload.get("workflow_state")

    # Import planner from our MCP server module (keeps heuristics in one place).
    # This is safe: the FastMCP server only runs under __main__.
    from flowy_mcp_server import _heuristic_plan_edits

    explanation, operations = _heuristic_plan_edits(message=message, workflow_state=workflow_state)

    response = {
        "assistantText": explanation,
        "operations": operations,
        "requiresApproval": True,
        "approvalReason": "Assist mode: user approval required before applying edits.",
    }

    # IMPORTANT: print JSON only (frontend parses stdout)
    sys.stdout.write(json.dumps(response))


if __name__ == "__main__":
    main()

