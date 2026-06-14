import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { z } from "zod";

const appleSchema = z.object({
  username: z.string(),
  appSpecificPassword: z.string(),
  calendarUrl: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = appleSchema.parse(body);

    await prisma.calendarIntegration.upsert({
      where: { userId_provider: { userId: payload.userId, provider: "APPLE" } },
      update: {
        accessToken: data.appSpecificPassword,
        calendarId: data.username,
        isActive: true,
      },
      create: {
        userId: payload.userId,
        provider: "APPLE",
        accessToken: data.appSpecificPassword,
        calendarId: data.username,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
