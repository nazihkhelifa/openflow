import { NextResponse } from "next/server";

const COMMUNITY_WORKFLOWS_API_URL =
  "https://nodebananapro.com/api/public/community-workflows";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET: Get a presigned download URL for a community workflow
 *
 * Returns { success: true, downloadUrl: "..." } so the client can
 * download the workflow directly from R2 (avoids proxying 80-275MB files
 * through a serverless function).
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const urlResponse = await fetch(
      `${COMMUNITY_WORKFLOWS_API_URL}/${encodeURIComponent(id)}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      }
    );

    if (!urlResponse.ok) {
      if (urlResponse.status === 404) {
        return NextResponse.json(
          { success: false, error: `Workflow not found: ${id}` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Failed to load workflow" },
        { status: urlResponse.status }
      );
    }

    const urlData = await urlResponse.json();

    if (!urlData.success || !urlData.downloadUrl) {
      return NextResponse.json(
        { success: false, error: urlData.error || "Failed to get download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      downloadUrl: urlData.downloadUrl,
    });
  } catch (error) {
    console.error("Error getting community workflow URL:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load workflow" },
      { status: 500 }
    );
  }
}
