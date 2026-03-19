#!/usr/bin/env python3
"""
Deprecated entrypoint: the Flowy planner used by Next.js lives in
`flowy_deepagents/content_writer.py`. This CLI delegates there so any old
scripts or docs that invoke `flowy_deep_agent_cli.py` still work.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path


def _run_content_writer() -> None:
    root = Path(__file__).resolve().parent
    script = root / "flowy_deepagents" / "content_writer.py"
    spec = importlib.util.spec_from_file_location("flowy_content_writer", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()


if __name__ == "__main__":
    _run_content_writer()
