import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { existsSync } from "fs";
import { applyEditOperations, type EditOperation } from "@/lib/chat/editOperations";
import { isFileProjectId, loadWorkflowFromFileProject, saveWorkflowToFileProject } from "@/lib/projectFileIO";
import { computeWorkflowHash } from "@/lib/flowy/workflowHash";

export const runtime = "nodejs";

type WorkflowState = { nodes: any[]; edges: any[]; groups?: Record<string, unknown> };
type PlanRequest = {
  message: string;
  workflowState?: WorkflowState;
  selectedNodeIds?: string[];
  chatHistory?: Array<{ role: "user" | "assistant"; text: string }>;
  attachments?: Array<{ id: string; name?: string; mimeType?: string; dataUrl: string }>;
  modelCatalog?: Record<string, Array<{ provider: string; modelId: string; displayName: string }>>;
  canvasStateMemory?: { previous?: unknown; current?: unknown; updatedAt?: number };
  agentMode?: "plan" | "assist";
  projectId?: string;
  stageIndex?: number;
  decompositionStages?: Array<Record<string, unknown>>;
  runQualityCheck?: boolean;
  enforceCanvasControl?: boolean;
  requireCautionApproval?: boolean;
  expectedWorkflowHash?: string;
  idempotencyKey?: string;
};

const FLOWY_PLANNER_TIMEOUT_MS = Number(process.env.FLOWY_PLANNER_TIMEOUT_MS || 120000);
const ORCH_IDEMPOTENCY_CACHE_TTL_MS = 5 * 60 * 1000;
const orchestrationIdempotencyCache = new Map<string, { at: number; payload: any }>();

function cleanupOrchIdempotencyCache() {
  const now = Date.now();
  for (const [k, v] of orchestrationIdempotencyCache.entries()) {
    if (now - v.at > ORCH_IDEMPOTENCY_CACHE_TTL_MS) orchestrationIdempotencyCache.delete(k);
  }
}

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

async function runFlowyPlanner(payload: PlanRequest): Promise<any> {
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
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error(`Flowy planner timed out after ${Math.round(FLOWY_PLANNER_TIMEOUT_MS / 1000)}s.`));
    }, FLOWY_PLANNER_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch {
        reject(new Error(code !== 0 ? `Planner exited ${code}: ${stderr || stdout}` : "Planner returned non-JSON output"));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export function optimizeOpsForApply(ops: EditOperation[], workflow: WorkflowState): EditOperation[] {
  if (!Array.isArray(ops) || ops.length === 0) return ops;
  const out: EditOperation[] = [];
  const seenEdgeKeys = new Set<string>();
  const latestUpdateByNode = new Map<string, Extract<EditOperation, { type: "updateNode" }>>();
  const existingById = new Map<string, any>((workflow.nodes || []).map((n: any) => [String(n.id), n]));

  const flushUpdates = () => {
    for (const upd of latestUpdateByNode.values()) out.push(upd);
    latestUpdateByNode.clear();
  };

  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    if (op.type === "updateNode") {
      const prev = latestUpdateByNode.get(op.nodeId);
      latestUpdateByNode.set(
        op.nodeId,
        prev
          ? { ...prev, data: { ...(prev.data || {}), ...(op.data || {}) } }
          : op
      );
      continue;
    }

    flushUpdates();

    if (op.type === "addEdge") {
      const key = `${op.source}|${op.target}|${op.sourceHandle ?? ""}|${op.targetHandle ?? ""}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);
      out.push(op);
      continue;
    }

    out.push(op);
  }

  flushUpdates();

  // Remove no-op updates after merge.
  return out.filter((op) => {
    if (op.type !== "updateNode") return true;
    const existing = existingById.get(op.nodeId);
    const data = (op as any).data || {};
    if (!existing || typeof existing !== "object" || typeof existing.data !== "object") return true;
    for (const [k, v] of Object.entries(data)) {
      if ((existing.data as any)[k] !== v) return true;
    }
    return false;
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanRequest & {
      maxIterations?: number;
      autoApply?: boolean;
      continuePrompt?: string;
    };

    if (!body || typeof body.message !== "string") {
      return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
    }

    let loadedWorkflow: any | null = null;
    let filePath: string | null = null;
    let workflowState = body.workflowState;
    if (!workflowState && body.projectId) {
      if (!isFileProjectId(body.projectId)) {
        return NextResponse.json({ ok: false, error: "Server-side orchestration only supports file projectIds." }, { status: 400 });
      }
      const loaded = await loadWorkflowFromFileProject(body.projectId);
      loadedWorkflow = loaded.workflow;
      filePath = loaded.filePath;
      workflowState = {
        nodes: loaded.workflow?.nodes ?? [],
        edges: loaded.workflow?.edges ?? [],
        groups: loaded.workflow?.groups ?? {},
      };
    }
    if (!workflowState) {
      return NextResponse.json({ ok: false, error: "workflowState is required unless projectId is provided." }, { status: 400 });
    }

    cleanupOrchIdempotencyCache();
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const orchestrationScope = body.projectId || "inline-workflow";
    const orchestrationCacheKey = idempotencyKey ? `${orchestrationScope}:${idempotencyKey}` : "";
    if (orchestrationCacheKey && orchestrationIdempotencyCache.has(orchestrationCacheKey)) {
      const cached = orchestrationIdempotencyCache.get(orchestrationCacheKey)!;
      return NextResponse.json({ ...cached.payload, idempotentReplay: true });
    }

    const initialHash = computeWorkflowHash(workflowState as any);
    if (body.expectedWorkflowHash && body.expectedWorkflowHash !== initialHash) {
      return NextResponse.json(
        {
          ok: false,
          error: "workflow_version_conflict",
          expectedWorkflowHash: body.expectedWorkflowHash,
          currentWorkflowHash: initialHash,
        },
        { status: 409 }
      );
    }

    const maxIterations = Math.max(1, Math.min(8, Number(body.maxIterations ?? 3)));
    const autoApply = body.autoApply !== false;
    const steps: Array<{
      iteration: number;
      assistantText: string;
      operations: EditOperation[];
      applied?: number;
      skipped?: string[];
      ok?: boolean;
      error?: string;
    }> = [];

    let message = body.message;
    let current = workflowState;

    for (let i = 0; i < maxIterations; i++) {
      const plan = await runFlowyPlanner({
        ...body,
        message,
        workflowState: current,
      });
      const rawOps = Array.isArray(plan?.operations) ? (plan.operations as EditOperation[]) : [];
      const ops = optimizeOpsForApply(rawOps, current);
      const step: any = {
        iteration: i + 1,
        assistantText: String(plan?.assistantText || ""),
        operations: ops,
        ok: Boolean(plan?.ok),
      };

      if (!autoApply || ops.length === 0) {
        steps.push(step);
        break;
      }

      const applied = applyEditOperations(ops, {
        nodes: current.nodes as any[],
        edges: current.edges as any[],
        groups: (current.groups ?? {}) as Record<string, any>,
      });
      step.applied = applied.applied;
      step.skipped = applied.skipped;
      steps.push(step);
      current = { nodes: applied.nodes as any[], edges: applied.edges as any[], groups: applied.groups as any };

      message =
        body.continuePrompt ||
        "Continue from updated workflow state. If complete, return empty operations.";
    }

    if (filePath && loadedWorkflow && autoApply) {
      loadedWorkflow.nodes = current.nodes;
      loadedWorkflow.edges = current.edges;
      loadedWorkflow.groups = current.groups ?? {};
      await saveWorkflowToFileProject(filePath, loadedWorkflow);
    }

    const responsePayload = {
      ok: true,
      steps,
      finalWorkflowState: current,
      iterations: steps.length,
      previousWorkflowHash: initialHash,
      workflowHash: computeWorkflowHash(current as any),
    };

    if (orchestrationCacheKey) {
      orchestrationIdempotencyCache.set(orchestrationCacheKey, {
        at: Date.now(),
        payload: responsePayload,
      });
    }

    return NextResponse.json(responsePayload);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Flowy orchestration failed" },
      { status: 500 }
    );
  }
}

