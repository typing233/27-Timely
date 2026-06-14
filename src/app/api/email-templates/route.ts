import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { z } from "zod";
import { defaultTemplates } from "@/lib/email";

const templateSchema = z.object({
  type: z.enum([
    "BOOKING_CONFIRMATION_HOST",
    "BOOKING_CONFIRMATION_GUEST",
    "BOOKING_CANCELLATION_HOST",
    "BOOKING_CANCELLATION_GUEST",
    "BOOKING_REMINDER",
  ]),
  subject: z.string().min(1),
  body: z.string().min(1),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.emailTemplate.findMany({
    where: { userId: payload.userId },
  });

  const allTemplates = Object.entries(defaultTemplates).map(([type, defaults]) => {
    const custom = templates.find((t) => t.type === type);
    return {
      type,
      subject: custom?.subject || defaults.subject,
      body: custom?.body || defaults.body,
      isActive: custom?.isActive ?? true,
      isCustom: !!custom,
    };
  });

  return NextResponse.json(allTemplates);
}

export async function PUT(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = templateSchema.parse(body);

    const template = await prisma.emailTemplate.upsert({
      where: { userId_type: { userId: payload.userId, type: data.type } },
      update: { subject: data.subject, body: data.body, isActive: data.isActive },
      create: { userId: payload.userId, ...data },
    });

    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
