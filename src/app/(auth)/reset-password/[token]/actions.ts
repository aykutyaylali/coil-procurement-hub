"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/ids";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";

/**
 * Token ile parola belirler/sıfırlar. İki tür bağlantıyı destekler:
 *  1) PasswordResetToken — parola sıfırlama (tek-kullanımlık, süreli).
 *  2) SupplierContact.portalInviteToken — KALICI tedarikçi portal daveti; admin
 *     pasife alana (revoke) kadar geçerli, tekrar kullanılabilir (tek-kullanımlık değil).
 * Başarıda kullanıcı aktifleştirilir. Oturum GEREKTİRMEZ (token-gated).
 */
export async function setPasswordWithToken(token: string, password: string): Promise<Result<null>> {
  try {
    const pw = z.string().min(8, "Parola en az 8 karakter olmalı.").parse(password);

    // 1) Klasik parola-sıfırlama token'ı (hash'li, tek-kullanımlık, süreli)
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (row && !row.usedAt && row.expiresAt.getTime() >= Date.now()) {
      const hash = await hashPassword(pw);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: row.userId },
          data: { passwordHash: hash, isActive: true, failedLoginCount: 0, lockedUntil: null },
        });
        await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      });
      const u = await prisma.user.findUnique({ where: { id: row.userId }, select: { tenantId: true } });
      if (u) await writeAudit({ tenantId: u.tenantId, userId: row.userId, action: "UPDATE", entityType: "User", entityId: row.userId, after: { passwordSet: true } });
      return ok(null);
    }

    // 2) Kalıcı portal davet token'ı (ham; revoke edilmediyse geçerli)
    const contact = await prisma.supplierContact.findUnique({ where: { portalInviteToken: token } });
    if (contact?.userId && !contact.portalInviteRevokedAt) {
      const hash = await hashPassword(pw);
      await prisma.user.update({
        where: { id: contact.userId },
        data: { passwordHash: hash, isActive: true, failedLoginCount: 0, lockedUntil: null },
      });
      const u = await prisma.user.findUnique({ where: { id: contact.userId }, select: { tenantId: true } });
      if (u) await writeAudit({ tenantId: u.tenantId, userId: contact.userId, action: "UPDATE", entityType: "User", entityId: contact.userId, after: { passwordSet: true, via: "portalInvite" } });
      return ok(null);
    }

    return fail(new Error("Geçersiz veya süresi dolmuş bağlantı."));
  } catch (e) {
    return fail(e);
  }
}
