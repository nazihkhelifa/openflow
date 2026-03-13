/**
 * Image Serving API Endpoint
 *
 * Serves temporarily stored images via URL for external providers.
 * Images are stored in memory and should be cleaned up by callers after use.
 *
 * GET /api/images/[id] - Retrieve stored image by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getImage } from "@/lib/images/store";

/**
 * GET handler - serve stored image
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  const image = getImage(id);

  if (!image) {
    return NextResponse.json(
      { error: "Image not found" },
      { status: 404 }
    );
  }

  // Convert Buffer to Uint8Array for NextResponse compatibility
  const uint8Array = new Uint8Array(image.data);

  return new NextResponse(uint8Array, {
    status: 200,
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
