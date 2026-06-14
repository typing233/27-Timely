import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { z } from "zod";

const createEventTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  duration: z.number().min(5).max(480),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: payload.userId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(eventTypes);
}

export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = createEventTypeSchema.parse(body);

    const existing = await prisma.eventType.findUnique({
      where: { userId_slug: { userId: payload.userId, slug: data.slug } },
    });
    if (existing) {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }

    const eventType = await prisma.eventType.create({
      data: { ...data, userId: payload.userId },
    });

    return NextResponse.json(eventType, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
