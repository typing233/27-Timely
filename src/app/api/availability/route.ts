import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/auth";
import { z } from "zod";

const ruleSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isActive: z.boolean().default(true),
});

const settingsSchema = z.object({
  minAdvanceHours: z.number().min(0).optional(),
  maxAdvanceDays: z.number().min(1).optional(),
  bufferMinutes: z.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rules = await prisma.availabilityRule.findMany({
    where: { userId: payload.userId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });

  const settings = await prisma.availabilitySettings.findUnique({
    where: { userId: payload.userId },
  });

  return NextResponse.json({ rules, settings });
}

export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = ruleSchema.parse(body);

    const rule = await prisma.availabilityRule.create({
      data: { ...data, userId: payload.userId },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    if (body.rules) {
      const rules = z.array(ruleSchema).parse(body.rules);

      await prisma.availabilityRule.deleteMany({ where: { userId: payload.userId } });
      await prisma.availabilityRule.createMany({
        data: rules.map((r) => ({ ...r, userId: payload.userId })),
      });
    }

    if (body.settings) {
      const settings = settingsSchema.parse(body.settings);
      await prisma.availabilitySettings.upsert({
        where: { userId: payload.userId },
        update: settings,
        create: { userId: payload.userId, ...settings },
      });
    }

    const updatedRules = await prisma.availabilityRule.findMany({
      where: { userId: payload.userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    const updatedSettings = await prisma.availabilitySettings.findUnique({
      where: { userId: payload.userId },
    });

    return NextResponse.json({ rules: updatedRules, settings: updatedSettings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
