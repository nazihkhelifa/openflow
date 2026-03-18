import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

export const runtime = "nodejs";

type PlanRequest = {
  message: string;
  workflowState?: { nodes: any[]; edges: any[] };
  selectedNodeIds?: string[];
  provider?: string;
  model?: string;
};

function runFlowyPlanner(payload: PlanRequest): Promise<any> {
  const repoRoot = process.cwd();
  const pythonPath = path.join(repoRoot, "backend", ".venv", "Scripts", "python.exe");
  const scriptPath = path.join(repoRoot, "backend", "flowy_agent_cli.py");

  return new Promise((resolve, reject) => {
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
      if (code !== 0) {
        reject(new Error(`Flowy planner exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(
          new Error(
            `Flowy planner returned non-JSON stdout. stdout=${stdout.slice(0, 500)} stderr=${stderr.slice(
              0,
              500
            )}`
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

    const result = await runFlowyPlanner(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Flowy plan] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Flowy plan failed" },
      { status: 500 }
    );
  }
}

