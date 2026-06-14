import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authUrl = getGoogleAuthUrl(payload.userId);
  return NextResponse.json({ url: authUrl });
}
