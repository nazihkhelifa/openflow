import { applyEditOperations } from "@/lib/chat/editOperations";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workflowState?: {
        nodes: any[];
        edges: any[];
      };
      operations?: any[];
    };

    const workflowState = body.workflowState ?? null;
    const operations = body.operations ?? null;

    if (!workflowState || !Array.isArray(workflowState.nodes) || !Array.isArray(workflowState.edges)) {
      return NextResponse.json(
        { ok: false, error: "workflowState must include nodes[] and edges[]" },
        { status: 400 }
      );
    }

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { ok: false, error: "operations must be an array" },
        { status: 400 }
      );
    }

    const result = applyEditOperations(operations as any, {
      nodes: workflowState.nodes,
      edges: workflowState.edges,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Flowy apply] error:", err);
    return NextResponse.json({ ok: false, error: "Failed to apply operations" }, { status: 500 });
  }
}

