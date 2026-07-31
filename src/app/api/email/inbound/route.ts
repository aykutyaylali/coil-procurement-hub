import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ingestInboundEmail } from "@/lib/email/service";

/**
 * Gelen e-posta webhook'u (SendGrid Inbound Parse / Mailgun / Graph subscription
 * gibi sağlayıcılardan). Reply-To token'ı veya konu satırındaki RFQ numarası ile
 * doğru RFQ'ya eşleştirir. Eşleşmezse "eşleştirme bekleyen" kuyruğuna alır.
 *
 * Güvenlik: EMAIL_WEBHOOK_SECRET ayarlıysa gövde HMAC-SHA256 imzası zorunludur
 * (x-webhook-signature başlığı, hex). Secret yoksa (dev) doğrulama atlanır.
 */

/** Gövde imzasını sabit-zamanlı karşılaştırma ile doğrular. */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return true; // dev / imzasız mod
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  // Uzunluk farkı timingSafeEqual'ı patlatmasın diye önce boyut kontrolü
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

const schema = z.object({
  tenantSlug: z.string().optional(),
  from: z.string(),
  to: z.string(),
  subject: z.string().default(""),
  text: z.string().default(""),
  replyToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Ham gövde imza doğrulaması için gerekir (JSON.parse'tan önce)
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get("x-webhook-signature"))) {
    return NextResponse.json({ error: "Geçersiz imza" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Eksik alanlar" }, { status: 422 });
  }
  const data = parsed.data;

  // Reply-To adresinden token çıkar: rfq+<token>@domain
  let replyToken = data.replyToken;
  if (!replyToken) {
    const m = data.to.match(/rfq\+([A-Za-z0-9_-]+)@/);
    if (m) replyToken = m[1];
  }

  // Tenant çözümle (slug veya tek tenant)
  const tenant = data.tenantSlug
    ? await prisma.tenant.findUnique({ where: { slug: data.tenantSlug } })
    : await prisma.tenant.findFirst();
  if (!tenant) return NextResponse.json({ error: "Tenant bulunamadı" }, { status: 404 });

  const result = await ingestInboundEmail({
    tenantId: tenant.id,
    from: data.from,
    to: data.to,
    subject: data.subject,
    bodyText: data.text,
    replyToken,
  });

  return NextResponse.json({ matched: result.matched, rfqId: result.rfqId ?? null });
}
