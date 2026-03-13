import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { validateWorkflowPath } from "@/utils/pathValidation";

/**
 * GET /api/projects/load?path=...
 * Loads workflow JSON from a project directory.
 * Finds the first .json file in the directory.
 */
export async function GET(request: NextRequest) {
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
    const stats = await fs.stat(pathValidation.resolved);
    if (!stats.isDirectory()) {
      return NextResponse.json(
        { success: false, error: "Path is not a directory" },
        { status: 400 }
      );
    }

    const files = await fs.readdir(pathValidation.resolved);
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(pathValidation.resolved, file);
        const content = await fs.readFile(filePath, "utf-8");
        const workflow = JSON.parse(content);

        if (workflow && typeof workflow === "object" && Array.isArray(workflow.nodes)) {
          return NextResponse.json({
            success: true,
            workflow: {
              ...workflow,
              id: pathValidation.resolved,
              directoryPath: pathValidation.resolved,
            },
          });
        }
      }
    }

    return NextResponse.json(
      { success: false, error: "No workflow file found in directory" },
      { status: 404 }
    );
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
        error: err instanceof Error ? err.message : "Failed to load project",
      },
      { status: 500 }
    );
  }
}
