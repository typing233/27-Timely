import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { testAppleConnection } from "@/lib/apple-calendar";
import { z } from "zod";

const appleSchema = z.object({
  username: z.string().min(1),
  appSpecificPassword: z.string().min(1),
  calendarUrl: z.string().url().optional(),
});

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.calendarIntegration.findUnique({
    where: { userId_provider: { userId: payload.userId, provider: "APPLE" } },
  });

  if (!integration) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    isActive: integration.isActive,
    username: integration.refreshToken,
    calendarUrl: integration.calendarId,
  });
}

export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = appleSchema.parse(body);

    // Test the credentials before saving
    const testResult = await testAppleConnection({
      username: data.username,
      password: data.appSpecificPassword,
      calendarUrl: data.calendarUrl,
    });

    if (!testResult.success) {
      return NextResponse.json(
        { error: `Connection failed: ${testResult.error}` },
        { status: 400 }
      );
    }

    // Store: refreshToken=username, accessToken=password, calendarId=resolved calendar URL
    await prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId: payload.userId, provider: "APPLE" } },
      update: {
        accessToken: data.appSpecificPassword,
        refreshToken: data.username,
        calendarId: testResult.calendarUrl,
        isActive: true,
      },
      create: {
        userId: payload.userId,
        provider: "APPLE",
        accessToken: data.appSpecificPassword,
        refreshToken: data.username,
        calendarId: testResult.calendarUrl,
      },
    });

    return NextResponse.json({
      success: true,
      calendarUrl: testResult.calendarUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.calendarIntegration.deleteMany({
    where: { userId: payload.userId, provider: "APPLE" },
  });

  return NextResponse.json({ success: true });
}
