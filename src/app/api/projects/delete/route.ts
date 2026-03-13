import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import { validateWorkflowPath } from "@/utils/pathValidation";

/**
 * DELETE /api/projects/delete?path=...
 * Deletes a project directory and its contents.
 */
export async function DELETE(request: NextRequest) {
  const projectPath = request.nextUrl.searchParams.get("path");

  if (!projectPath) {
    return NextResponse.json(
      { success: false, error: "Path parameter required" },
      { status: 400 }
    );
  }

  const decodedPath = decodeURIComponent(projectPath);
  const pathValidation = validateWorkflowPath(decodedPath);
  if (!pathValidation.valid) {
    return NextResponse.json(
      { success: false, error: pathValidation.error },
      { status: 400 }
    );
  }

  try {
    await fs.rm(pathValidation.resolved, { recursive: true });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to delete project",
      },
      { status: 500 }
    );
  }
}
