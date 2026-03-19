# Flowy planner (Python)

The canvas agent calls `flowy_deepagents/content_writer.py` via Next.js `POST /api/flowy/plan`.

## Setup with [uv](https://docs.astral.sh/uv/)

From the **repository root**:

```bash
npm run flowy:venv
```

Or manually:

```bash
uv sync --directory backend
```

This creates `backend/.venv` with `langchain-openai` and `langchain-core`.

Requirements:

- **Python 3.11+** (uv can install one: `uv python install 3.12`)
- **`OPENAI_API_KEY`** in `.env.local` (same as the rest of the app) so the planner can call OpenAI.

## Optional overrides

| Variable | Purpose |
|----------|---------|
| `FLOWY_PYTHON` | Absolute path to `python` / `python.exe` (skips venv / `uv run` detection) |

## MCP server (optional)

`flowy_mcp_server.py` uses FastMCP; install extras if you run it locally (see Astral FastMCP docs).
