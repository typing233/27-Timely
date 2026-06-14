import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { z } from "zod";

const updateEventTypeSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  duration: z.number().min(5).max(480).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventType = await prisma.eventType.findFirst({
    where: { id: params.id, userId: payload.userId },
  });

  if (!eventType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(eventType);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = updateEventTypeSchema.parse(body);

    const existing = await prisma.eventType.findFirst({
      where: { id: params.id, userId: payload.userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await prisma.eventType.findUnique({
        where: { userId_slug: { userId: payload.userId, slug: data.slug } },
      });
      if (slugExists) {
        return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
      }
    }

    const eventType = await prisma.eventType.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(eventType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.eventType.findFirst({
    where: { id: params.id, userId: payload.userId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.eventType.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true });
}
