import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import { validateWorkflowPath } from "@/utils/pathValidation";

/**
 * GET /api/projects/list?path=...
 * Lists workflow projects in the given directory.
 * Scans subdirectories for .json workflow files.
 */
export async function GET(request: NextRequest) {
  const directoryPath = request.nextUrl.searchParams.get("path");

  if (!directoryPath) {
    return NextResponse.json(
      { success: false, error: "Path parameter required" },
      { status: 400 }
    );
  }

  const pathValidation = validateWorkflowPath(directoryPath);
  if (!pathValidation.valid) {
    return NextResponse.json(
      { success: false, error: pathValidation.error },
      { status: 400 }
    );
  }

  try {
    const entries = await fs.readdir(pathValidation.resolved, {
      withFileTypes: true,
    });

    const projects: { id: string; path: string; name: string; updatedAt: string; thumbnail?: string }[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subDirPath = path.join(pathValidation.resolved, entry.name);
      let workflowFile: string | null = null;
      let workflowName = entry.name;
      let mtime: Date | null = null;
      let thumbnail: string | undefined;

      try {
        const files = await fs.readdir(subDirPath);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const filePath = path.join(subDirPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              workflowFile = filePath;
              mtime = stats.mtime;
              try {
                const content = await fs.readFile(filePath, "utf-8");
                const parsed = JSON.parse(content);
                if (parsed.name) workflowName = parsed.name;
                if (parsed.thumbnail) thumbnail = parsed.thumbnail;
              } catch {
                /* use folder name if parse fails */
              }
              break;
            }
          }
        }
      } catch {
        continue;
      }

      if (workflowFile && mtime) {
        projects.push({
          id: encodeURIComponent(subDirPath),
          path: subDirPath,
          name: workflowName,
          updatedAt: mtime.toISOString(),
          thumbnail: thumbnail || "/thumbnail.jpeg",
        });
      }
    }

    projects.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return NextResponse.json({
        success: true,
        projects: [],
      });
    }
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list projects",
      },
      { status: 500 }
    );
  }
}
