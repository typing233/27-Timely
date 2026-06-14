import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeGoogleCode } from "@/lib/google-calendar";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard?error=missing_params", req.url));
  }

  try {
    const tokens = await exchangeGoogleCode(code);

    await prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId: state, provider: "GOOGLE" } },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isActive: true,
      },
      create: {
        userId: state,
        provider: "GOOGLE",
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    return NextResponse.redirect(new URL("/dashboard?success=google_connected", req.url));
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(new URL("/dashboard?error=oauth_failed", req.url));
  }
}
