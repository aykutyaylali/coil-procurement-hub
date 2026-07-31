"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { d, parseTrNumber, gt } from "@/lib/money";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

const upsertSchema = z.object({
  id: z.string().optional(),
  priceDate: z.string().min(1, "Tarih zorunludur."),
  usdPerTon: z.string().min(1, "LME değeri (USD/ton) zorunludur."),
  source: z.string().optional(),
  note: z.string().optional(),
});

/** LME kaydı oluştur/güncelle. LME değeri Türkçe format da olsa doğru parse edilir. */
export async function saveLmeRecord(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.LME_MANAGE);
    const data = upsertSchema.parse(input);

    const usdPerTon = parseTrNumber(data.usdPerTon);
    if (!gt(usdPerTon, 0)) throw new ValidationError("LME değeri 0'dan büyük olmalıdır (USD/ton).");
    const priceDate = new Date(data.priceDate);
    if (isNaN(priceDate.getTime())) throw new ValidationError("Geçersiz tarih.");

    if (data.id) {
      const existing = await prisma.lmeRecord.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundError("LME kaydı bulunamadı.");
      if (existing.status === "ARCHIVED") throw new ValidationError("Arşivlenmiş kayıt düzenlenemez.");
      await prisma.lmeRecord.update({
        where: { id: existing.id },
        data: { priceDate, usdPerTon, source: data.source || null, note: data.note || null },
      });
      await writeAudit({
        tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "LmeRecord", entityId: existing.id,
        before: { usdPerTon: existing.usdPerTon }, after: { usdPerTon }, reason: data.source || null,
      });
      revalidatePath("/lme");
      return ok({ id: existing.id });
    }

    const created = await prisma.lmeRecord.create({
      data: {
        tenantId: user.tenantId, priceDate, usdPerTon, source: data.source || null, note: data.note || null,
        status: "DRAFT", createdById: user.id,
      },
    });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "LmeRecord", entityId: created.id,
      after: { usdPerTon, priceDate: priceDate.toISOString(), status: "DRAFT" },
    });
    revalidatePath("/lme");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

/** Durum değiştir: DRAFT→APPROVED (onayla) veya →ARCHIVED (arşivle). */
export async function setLmeStatus(id: string, status: "APPROVED" | "ARCHIVED"): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.LME_MANAGE);
    const rec = await prisma.lmeRecord.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rec) throw new NotFoundError("LME kaydı bulunamadı.");
    await prisma.lmeRecord.update({
      where: { id: rec.id },
      data: {
        status,
        approvedById: status === "APPROVED" ? user.id : rec.approvedById,
        approvedAt: status === "APPROVED" ? new Date() : rec.approvedAt,
      },
    });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "LmeRecord", entityId: rec.id,
      before: { status: rec.status }, after: { status },
    });
    revalidatePath("/lme");
    return ok({ status });
  } catch (e) {
    return fail(e);
  }
}

// d import'u zod dışı doğrulama için gerekli değil; ileride tekrar kullanılabilir.
void d;
