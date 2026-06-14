import { prisma } from "./prisma";

interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function triggerWebhooks(
  userId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      isActive: true,
      events: { has: event },
    },
  });

  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };

  await Promise.allSettled(
    webhooks.map(async (webhook) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (webhook.secret) {
        const crypto = await import("crypto");
        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(JSON.stringify(payload))
          .digest("hex");
        headers["X-Webhook-Signature"] = signature;
      }

      try {
        await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } catch (error) {
        console.error(`Webhook delivery failed for ${webhook.url}:`, error);
      }
    })
  );
}
