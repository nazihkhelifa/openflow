import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";
import { loadWorkflowFromFileProject, isFileProjectId } from "@/lib/projectFileIO";

export const runtime = "nodejs";

type PlanRequest = {
  message: string;
  workflowState?: { nodes: any[]; edges: any[]; groups?: Record<string, unknown> };
  selectedNodeIds?: string[];
  chatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
  attachments?: Array<{ id: string; name?: string; mimeType?: string; dataUrl: string }>;
  agentMode?: "plan" | "assist";
  projectId?: string;
  provider?: string;
  model?: string;
  stageIndex?: number;
  decompositionStages?: Array<Record<string, unknown>>;
  enforceCanvasControl?: boolean;
  requireCautionApproval?: boolean;
  openflowUiSnapshot?: string;
};

const FLOWY_VENV_HINT =
  "Run `npm run flowy:venv` (requires uv) to create backend/.venv, or set FLOWY_PYTHON.";
const FLOWY_PLANNER_TIMEOUT_MS = Number(process.env.FLOWY_PLANNER_TIMEOUT_MS || 120000);

function resolveFlowyPlannerSpawn(repoRoot: string) {
  const scriptAbs = path.join(repoRoot, "backend", "flowy_deepagents", "content_writer.py");
  const scriptFromBackend = path.join("flowy_deepagents", "content_writer.py");
  const flowyPython = process.env.FLOWY_PYTHON?.trim();
  if (flowyPython && existsSync(flowyPython)) return { command: flowyPython, args: [scriptAbs], cwd: repoRoot };
  const winVenv = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(repoRoot, "backend", ".venv", "bin", "python");
  if (existsSync(winVenv)) return { command: winVenv, args: [scriptAbs], cwd: repoRoot };
  if (existsSync(posixVenv)) return { command: posixVenv, args: [scriptAbs], cwd: repoRoot };
  return { command: "uv", args: ["run", "--directory", "backend", "python", scriptFromBackend], cwd: repoRoot };
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  let body: PlanRequest;
  try {
    body = (await request.json()) as PlanRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body || typeof body.message !== "string") {
    return new Response("message is required", { status: 400 });
  }

  let workflowState = body.workflowState;
  if (!workflowState && body.projectId) {
    if (!isFileProjectId(body.projectId)) {
      return new Response("Server-side planning only supported for file projectIds.", { status: 400 });
    }
    const loaded = await loadWorkflowFromFileProject(body.projectId);
    workflowState = {
      nodes: loaded.workflow?.nodes ?? [],
      edges: loaded.workflow?.edges ?? [],
      groups: loaded.workflow?.groups ?? {},
    };
  }
  if (!workflowState) {
    return new Response("workflowState is required unless projectId is provided.", { status: 400 });
  }

  const payload: PlanRequest = { ...body, workflowState };
  const repoRoot = process.cwd();
  const { command, args, cwd } = resolveFlowyPlannerSpawn(repoRoot);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        cwd: cwd ?? repoRoot,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      let closed = false;
      const sendEvent = (event: string, payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, payload)));
        } catch {
          closed = true;
        }
      };
      const closeStream = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const timeout = setTimeout(() => {
        if (closed) return;
        try {
          child.kill();
        } catch {}
        sendEvent("error", {
          ok: false,
          error: `Flowy planner timed out after ${Math.round(FLOWY_PLANNER_TIMEOUT_MS / 1000)}s.`,
        });
        closeStream();
      }, FLOWY_PLANNER_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        for (const line of text.split("\n")) {
          if (!line.startsWith("FLOWY_PROGRESS:")) continue;
          try {
            const event = JSON.parse(line.slice("FLOWY_PROGRESS:".length));
            sendEvent("progress", event);
          } catch {}
        }
      });

      child.on("error", (err) => {
        if (closed) return;
        clearTimeout(timeout);
        const extra =
          command === "uv"
            ? ` ${FLOWY_VENV_HINT} If uv is not installed, install it or use FLOWY_PYTHON.`
            : ` ${FLOWY_VENV_HINT}`;
        sendEvent("error", {
          ok: false,
          error: err instanceof Error ? `${err.message}${extra}` : "Planner spawn failed",
        });
        closeStream();
      });

      child.on("close", (code) => {
        if (closed) return;
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(stdout);
          if (code !== 0) {
            sendEvent("error", parsed);
          } else {
            sendEvent("result", parsed);
            sendEvent("done", { ok: true });
          }
        } catch {
          sendEvent("error", {
            ok: false,
            error: code !== 0 ? `Planner exited with code ${code}: ${stderr || stdout}` : "Planner returned non-JSON output",
          });
        }
        closeStream();
      });

      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

