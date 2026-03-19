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
  projectId?: string;
  provider?: string;
  model?: string;
};

function resolvePythonExecutable(repoRoot: string): string {
  const winVenv = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
  const posixVenv = path.join(repoRoot, "backend", ".venv", "bin", "python");
  if (existsSync(winVenv)) return winVenv;
  if (existsSync(posixVenv)) return posixVenv;
  return process.platform === "win32" ? "python" : "python3";
}

function runFlowyPlanner(payload: PlanRequest): Promise<any> {
  const repoRoot = process.cwd();
  const pythonPath = resolvePythonExecutable(repoRoot);
  const deepScriptPath = path.join(repoRoot, "backend", "flowy_deepagents", "content_writer.py");

  return new Promise((resolve, reject) => {
    const scriptPath = deepScriptPath;

    const child = spawn(pythonPath, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      try {
        const parsed = JSON.parse(stdout);
        // If the python process returned a non-zero code but still printed JSON,
        // prefer the JSON payload so the UI can show a structured error.
        if (code !== 0) {
          resolve(parsed);
          return;
        }
        resolve(parsed);
      } catch (e) {
        if (code !== 0) {
          reject(new Error(`Flowy planner exited with code ${code}: ${stderr || stdout}`));
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

