import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { EmailTemplateType } from "@prisma/client";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailData {
  hostName: string;
  guestName: string;
  guestEmail: string;
  eventName: string;
  startTime: string;
  endTime: string;
  date: string;
  timezone: string;
  cancelUrl?: string;
  notes?: string;
}

const defaultTemplates: Record<EmailTemplateType, { subject: string; body: string }> = {
  BOOKING_CONFIRMATION_HOST: {
    subject: "New booking: {{eventName}} with {{guestName}}",
    body: `Hi {{hostName}},\n\nYou have a new booking!\n\nEvent: {{eventName}}\nGuest: {{guestName}} ({{guestEmail}})\nDate: {{date}}\nTime: {{startTime}} - {{endTime}} ({{timezone}})\n{{#notes}}Notes: {{notes}}{{/notes}}\n\nBest,\nTimely`,
  },
  BOOKING_CONFIRMATION_GUEST: {
    subject: "Booking confirmed: {{eventName}} with {{hostName}}",
    body: `Hi {{guestName}},\n\nYour booking is confirmed!\n\nEvent: {{eventName}}\nHost: {{hostName}}\nDate: {{date}}\nTime: {{startTime}} - {{endTime}} ({{timezone}})\n\nTo cancel, click: {{cancelUrl}}\n\nBest,\nTimely`,
  },
  BOOKING_CANCELLATION_HOST: {
    subject: "Booking cancelled: {{eventName}} with {{guestName}}",
    body: `Hi {{hostName}},\n\nA booking has been cancelled.\n\nEvent: {{eventName}}\nGuest: {{guestName}}\nDate: {{date}}\nTime: {{startTime}} - {{endTime}} ({{timezone}})\n\nBest,\nTimely`,
  },
  BOOKING_CANCELLATION_GUEST: {
    subject: "Booking cancelled: {{eventName}} with {{hostName}}",
    body: `Hi {{guestName}},\n\nYour booking has been cancelled.\n\nEvent: {{eventName}}\nHost: {{hostName}}\nDate: {{date}}\nTime: {{startTime}} - {{endTime}} ({{timezone}})\n\nBest,\nTimely`,
  },
  BOOKING_REMINDER: {
    subject: "Reminder: {{eventName}} tomorrow",
    body: `Hi {{guestName}},\n\nReminder: you have a booking tomorrow.\n\nEvent: {{eventName}}\nHost: {{hostName}}\nDate: {{date}}\nTime: {{startTime}} - {{endTime}} ({{timezone}})\n\nBest,\nTimely`,
  },
};

function renderTemplate(template: string, data: EmailData): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
  }
  result = result.replace(new RegExp("{{#notes}}([\\s\\S]*?){{/notes}}", "g"), data.notes ? data.notes : "");
  return result;
}

export async function sendEmail(
  to: string,
  templateType: EmailTemplateType,
  userId: string,
  data: EmailData
): Promise<void> {
  let template = defaultTemplates[templateType];

  const customTemplate = await prisma.emailTemplate.findUnique({
    where: { userId_type: { userId, type: templateType } },
  });

  if (customTemplate && customTemplate.isActive) {
    template = { subject: customTemplate.subject, body: customTemplate.body };
  }

  const subject = renderTemplate(template.subject, data);
  const text = renderTemplate(template.body, data);

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "noreply@timely.app",
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export { defaultTemplates };
