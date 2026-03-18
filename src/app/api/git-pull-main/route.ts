import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string) {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout?.toString() ?? "", stderr: stderr?.toString() ?? "" };
}

export async function POST() {
  try {
    const baseCwd = process.cwd();

    const top = await runGit(["rev-parse", "--show-toplevel"], baseCwd);
    const repoRoot = top.stdout.trim();
    if (!repoRoot) {
      return NextResponse.json(
        { success: false, error: "Not running inside a git repo." },
        { status: 500 },
      );
    }

    const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
    const branch = branchRes.stdout.trim();
    if (branch !== "main") {
      return NextResponse.json(
        {
          success: false,
          error: `You're on branch "${branch}". Switch to "main" to update.`,
        },
        { status: 400 },
      );
    }

    const statusRes = await runGit(["status", "--porcelain"], repoRoot);
    if (statusRes.stdout.trim().length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Working tree is not clean. Commit/stash your changes before updating.",
          details: statusRes.stdout,
        },
        { status: 400 },
      );
    }

    const fetchRes = await runGit(["fetch", "origin", "main"], repoRoot);
    const pullRes = await runGit(["pull", "--ff-only", "origin", "main"], repoRoot);

    return NextResponse.json({
      success: true,
      branch,
      repoRoot,
      output: [fetchRes.stdout, fetchRes.stderr, pullRes.stdout, pullRes.stderr].filter(Boolean).join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: `Update failed: ${message}` },
      { status: 500 },
    );
  }
}

