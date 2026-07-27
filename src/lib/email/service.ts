import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getEmailProvider } from "@/lib/email/provider";

const MAX_ATTEMPTS = 3;

export interface QueueEmailInput {
  tenantId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  templateKey?: string;
  refType?: string;
  refId?: string;
}

/**
 * E-postayı kuyruğa alır (EmailMessage kaydı). Gönderim processQueue ile yapılır.
 * Bu sayede yeniden deneme, log ve teslim takibi merkezi olur.
 */
export async function queueEmail(input: QueueEmailInput): Promise<string> {
  const msg = await prisma.emailMessage.create({
    data: {
      tenantId: input.tenantId,
      direction: "OUTBOUND",
      provider: env.EMAIL_PROVIDER,
      status: "QUEUED",
      fromAddress: env.EMAIL_FROM,
      toAddress: input.to,
      replyTo: input.replyTo ?? null,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text,
      templateKey: input.templateKey ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
    },
  });
  await prisma.emailEvent.create({
    data: { messageId: msg.id, type: "QUEUED" },
  });
  return msg.id;
}

/** Kuyruktaki bekleyen e-postaları gönderir (yeniden deneme + dead-letter). */
export async function processQueue(limit = 25): Promise<{ sent: number; failed: number }> {
  const pending = await prisma.emailMessage.findMany({
    where: {
      direction: "OUTBOUND",
      status: { in: ["QUEUED", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      scheduledAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const provider = getEmailProvider();
  let sent = 0;
  let failed = 0;

  for (const msg of pending) {
    await prisma.emailMessage.update({
      where: { id: msg.id },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    try {
      const result = await provider.send({
        to: msg.toAddress,
        from: msg.fromAddress,
        fromName: env.EMAIL_FROM_NAME,
        replyTo: msg.replyTo ?? undefined,
        subject: msg.subject,
        html: msg.bodyHtml ?? "",
        text: msg.bodyText ?? "",
      });
      await prisma.emailMessage.update({
        where: { id: msg.id },
        data: { status: "SENT", sentAt: new Date(), messageId: result.messageId, errorText: null },
      });
      await prisma.emailEvent.create({ data: { messageId: msg.id, type: "SENT" } });
      sent++;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Bilinmeyen hata";
      const willRetry = msg.attempts + 1 < MAX_ATTEMPTS;
      await prisma.emailMessage.update({
        where: { id: msg.id },
        data: { status: willRetry ? "FAILED" : "BOUNCED", errorText: error },
      });
      await prisma.emailEvent.create({
        data: { messageId: msg.id, type: "FAILED", detail: error },
      });
      failed++;
    }
  }
  return { sent, failed };
}

/**
 * Gelen e-postayı doğru RFQ ile eşleştirir.
 * 1) replyToken (benzersiz Reply-To token) ile
 * 2) konu satırındaki RFQ numarası ile
 * Eşleşmezse "UNMATCHED" olarak kuyruğa alınır.
 */
export async function ingestInboundEmail(input: {
  tenantId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  replyToken?: string;
}): Promise<{ matched: boolean; rfqId?: string }> {
  let rfqSupplier = null;

  if (input.replyToken) {
    rfqSupplier = await prisma.rFQSupplier.findUnique({
      where: { replyToken: input.replyToken },
      include: { rfq: true },
    });
  }

  // Konudan RFQ numarası çıkar (RFQ-YYYY-NNNNNN)
  let rfqByNumber = null;
  if (!rfqSupplier) {
    const match = input.subject.match(/RFQ-\d{4}-\d{6}/);
    if (match) {
      rfqByNumber = await prisma.rFQ.findFirst({
        where: { tenantId: input.tenantId, number: match[0] },
      });
    }
  }

  const rfqId = rfqSupplier?.rfqId ?? rfqByNumber?.id;

  const emailMsg = await prisma.emailMessage.create({
    data: {
      tenantId: input.tenantId,
      direction: "INBOUND",
      provider: env.EMAIL_PROVIDER,
      status: rfqId ? "RECEIVED" : "UNMATCHED",
      fromAddress: input.from,
      toAddress: input.to,
      subject: input.subject,
      bodyText: input.bodyText,
      refType: rfqId ? "RFQ" : null,
      refId: rfqId ?? null,
    },
  });

  if (rfqId) {
    await prisma.rFQMessage.create({
      data: {
        rfqId,
        supplierId: rfqSupplier?.supplierId ?? null,
        direction: "INBOUND",
        fromAddress: input.from,
        subject: input.subject,
        body: input.bodyText,
        emailMessageId: emailMsg.id,
      },
    });
    return { matched: true, rfqId };
  }

  return { matched: false };
}
