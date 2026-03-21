import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";
import { loadWorkflowFromFileProject, isFileProjectId } from "@/lib/projectFileIO";

export const runtime = "nodejs";

type PlanRequest = {
  message: string;
  workflowState?: { nodes: any[]; edges: any[]; groups?: Record<string, unknown> };
  selectedNodeIds?: string[];
  /** Prior turns only (current user message is in `message`). Capped client-side. */
  chatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
  attachments?: Array<{
    id: string;
    name?: string;
    mimeType?: string;
    /** data:image/... or http(s) image URL */
    dataUrl: string;
  }>;
  modelCatalog?: Record<string, Array<{ provider: string; modelId: string; displayName: string }>>;
  canvasStateMemory?: { previous?: unknown; current?: unknown; updatedAt?: number };
  /** `plan` = advisory only (no canvas ops). `assist` = canvas planner. */
  agentMode?: "plan" | "assist";
  projectId?: string;
  provider?: string;
  model?: string;
  /** Multi-stage decomposition: current stage index (0-based). */
  stageIndex?: number;
  /** Carried decomposition stages from a prior response. */
  decompositionStages?: Array<Record<string, unknown>>;
  /** When true, run the quality checker after planning. */
  runQualityCheck?: boolean;
  enforceCanvasControl?: boolean;
  requireCautionApproval?: boolean;
};

const FLOWY_VENV_HINT =
  "Run `npm run flowy:venv` (requires uv: https://docs.astral.sh/uv/) to create backend/.venv, " +
  "or set FLOWY_PYTHON to the full path of python.exe.";

type FlowySpawn = {
  command: string;
  args: string[];
  cwd?: string;
};

const FLOWY_PLANNER_TIMEOUT_MS = Number(process.env.FLOWY_PLANNER_TIMEOUT_MS || 120000);

/**
 * Prefer, in order: FLOWY_PYTHON, backend/.venv Python, then `uv run` (no bare `python` on PATH —
 * avoids Windows Store stub / exit 9009 when Python isn't installed globally).
 */
function resolveFlowyPlannerSpawn(repoRoot: string): FlowySpawn {
  const scriptAbs = path.join(repoRoot, "backend", "flowy_deepagents", "content_writer.py");
  const scriptFromBackend = path.join("flowy_deepagents", "content_writer.py");

  const flowyPython = process.env.FLOWY_PYTHON?.trim();
  if (flowyPython && existsSync(flowyPython)) {
    return { command: flowyPython, args: [scriptAbs] };
  }

  const winVenv = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(repoRoot, "backend", ".venv", "bin", "python");
  if (existsSync(winVenv)) {
    return { command: winVenv, args: [scriptAbs] };
  }
  if (existsSync(posixVenv)) {
    return { command: posixVenv, args: [scriptAbs] };
  }

  return {
    command: "uv",
    args: ["run", "--directory", "backend", "python", scriptFromBackend],
    cwd: repoRoot,
  };
}

function runFlowyPlanner(payload: PlanRequest): Promise<any> {
  const repoRoot = process.cwd();
  const { command, args, cwd } = resolveFlowyPlannerSpawn(repoRoot);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      cwd: cwd ?? repoRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {}
      reject(
        new Error(
          `Flowy planner timed out after ${Math.round(FLOWY_PLANNER_TIMEOUT_MS / 1000)}s. ` +
            "Try a simpler request or increase FLOWY_PLANNER_TIMEOUT_MS."
        )
      );
    }, FLOWY_PLANNER_TIMEOUT_MS);

    const progressEvents: Array<{ progress: string; detail: string }> = [];

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        if (line.startsWith("FLOWY_PROGRESS:")) {
          try {
            const event = JSON.parse(line.slice("FLOWY_PROGRESS:".length));
            progressEvents.push(event);
          } catch { /* ignore malformed progress lines */ }
        }
      }
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const extra =
        command === "uv"
          ? ` ${FLOWY_VENV_HINT} If uv is not installed, install it or use FLOWY_PYTHON.`
          : ` ${FLOWY_VENV_HINT}`;
      reject(err instanceof Error ? new Error(`${err.message}${extra}`) : err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(stdout);
        if (progressEvents.length > 0) {
          parsed.progressEvents = progressEvents;
        }
        if (code !== 0) {
          resolve(parsed);
          return;
        }
        resolve(parsed);
      } catch (e) {
        if (code !== 0) {
          const hint =
            code === 9009 || /introuvable|not recognized|ENOENT/i.test(stderr + stdout)
              ? ` ${FLOWY_VENV_HINT}`
              : "";
          reject(new Error(`Flowy planner exited with code ${code}: ${stderr || stdout}${hint}`));
          return;
        }
        reject(
          new Error(
            `Flowy planner returned non-JSON stdout. stdout=${stdout.slice(0, 500)} stderr=${stderr.slice(0, 500)}`
          )
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanRequest;

    if (!body || typeof body.message !== "string") {
      return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
    }

    let workflowState = body.workflowState;
    if (!workflowState && body.projectId) {
      if (!isFileProjectId(body.projectId)) {
        return NextResponse.json(
          { ok: false, error: "Server-side planning only supported for file projectIds (path-like ids)." },
          { status: 400 }
        );
      }
      const loaded = await loadWorkflowFromFileProject(body.projectId);
      workflowState = {
        nodes: loaded.workflow?.nodes ?? [],
        edges: loaded.workflow?.edges ?? [],
        groups: loaded.workflow?.groups ?? {},
      };
    }

    if (!workflowState) {
      return NextResponse.json(
        { ok: false, error: "workflowState is required unless projectId is provided." },
        { status: 400 }
      );
    }

    const result = await runFlowyPlanner({
      ...body,
      workflowState,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[Flowy plan] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Flowy plan failed" },
      { status: 500 }
    );
  }
}

