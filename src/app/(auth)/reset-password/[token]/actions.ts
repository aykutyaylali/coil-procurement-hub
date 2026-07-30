"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/ids";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";

/**
 * Token ile parola belirler/sıfırlar (hem tedarikçi portal daveti hem parola
 * sıfırlama akışı bu aksiyonu kullanır). Başarıda kullanıcı aktifleştirilir ve
 * token tek-kullanımlık olarak işaretlenir. Oturum GEREKTİRMEZ (token-gated).
 */
export async function setPasswordWithToken(token: string, password: string): Promise<Result<null>> {
  try {
    const pw = z.string().min(8, "Parola en az 8 karakter olmalı.").parse(password);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      return fail(new Error("Geçersiz veya süresi dolmuş bağlantı."));
    }
    const hash = await hashPassword(pw);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash: hash, isActive: true, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    });
    const u = await prisma.user.findUnique({ where: { id: row.userId }, select: { tenantId: true } });
    if (u) {
      await writeAudit({ tenantId: u.tenantId, userId: row.userId, action: "UPDATE", entityType: "User", entityId: row.userId, after: { passwordSet: true } });
    }
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
