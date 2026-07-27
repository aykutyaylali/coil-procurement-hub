"use server";
import { prisma } from "@/lib/db";
import { hashToken, secureToken } from "@/lib/ids";
import { addHours } from "@/lib/dates";
import { env } from "@/lib/env";
import { queueEmail, processQueue } from "@/lib/email/service";
import { genericNotifyTemplate } from "@/lib/email/templates";

/**
 * Parola sıfırlama talebi. Kullanıcı numaralandırmasını önlemek için
 * her durumda başarılı yanıt döner. Token hash'lenerek saklanır.
 */
export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  if (!email) return;

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user || !user.isActive) return;

  const token = secureToken(32);
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: addHours(new Date(), 2) },
  });

  const url = `${env.APP_URL}/reset-password/${token}`;
  const tmpl = genericNotifyTemplate({
    title: "Parola Sıfırlama",
    message: "Parolanızı sıfırlamak için aşağıdaki bağlantıya tıklayın. Bağlantı 2 saat geçerlidir.",
    linkUrl: url,
    linkLabel: "Parolamı Sıfırla",
  });
  await queueEmail({
    tenantId: user.tenantId,
    to: user.email,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text,
    templateKey: "password_reset",
  });
  await processQueue();
}
