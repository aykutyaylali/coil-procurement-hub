"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { d, parseTrNumber, gt } from "@/lib/money";
import { fetchLmePrice } from "@/lib/lme/service";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

/** Dış servisten LME (USD/ton) otomatik çeker. Formu doldurur; kayıt oluşturmaz. */
export async function fetchLmeAuto(input: { kind: "DAILY_SPOT" | "WEEKLY_AVG"; priceDate: string; periodStart?: string; periodEnd?: string }): Promise<Result<{ usdPerTon: string; source: string; fetchedAt: string }>> {
  try {
    await requirePermission(PERMISSIONS.LME_MANAGE);
    const priceDate = new Date(input.priceDate);
    if (isNaN(priceDate.getTime())) throw new ValidationError("Geçersiz tarih.");
    const res = await fetchLmePrice({
      kind: input.kind, priceDate,
      periodStart: input.periodStart ? new Date(input.periodStart) : null,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
    });
    return ok({ usdPerTon: res.usdPerTon, source: res.source, fetchedAt: res.fetchedAt.toISOString() });
  } catch (e) {
    return fail(e);
  }
}

const upsertSchema = z.object({
  id: z.string().optional(),
  priceDate: z.string().min(1, "Tarih zorunludur."),
  usdPerTon: z.string().min(1, "LME değeri (USD/ton) zorunludur."),
  kind: z.enum(["DAILY_SPOT", "WEEKLY_AVG"]).default("DAILY_SPOT"),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  source: z.string().optional(),
  note: z.string().optional(),
  // Faz 5: otomatik çekme izlenebilirliği
  isAutoFetched: z.boolean().default(false),
  fetchedAt: z.string().optional(),
  autoFetchedValue: z.string().optional(), // orijinal çekilen değer (override tespiti için)
});

function periodFields(data: { kind: string; periodStart?: string; periodEnd?: string }) {
  const weekly = data.kind === "WEEKLY_AVG";
  return {
    kind: data.kind,
    periodStart: weekly && data.periodStart ? new Date(data.periodStart) : null,
    periodEnd: weekly && data.periodEnd ? new Date(data.periodEnd) : null,
  };
}

/** LME kaydı oluştur/güncelle. LME değeri Türkçe format da olsa doğru parse edilir. */
export async function saveLmeRecord(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.LME_MANAGE);
    const data = upsertSchema.parse(input);

    const usdPerTon = parseTrNumber(data.usdPerTon);
    if (!gt(usdPerTon, 0)) throw new ValidationError("LME değeri 0'dan büyük olmalıdır (USD/ton).");
    const priceDate = new Date(data.priceDate);
    if (isNaN(priceDate.getTime())) throw new ValidationError("Geçersiz tarih.");

    // Otomatik çekilen değer manuel ezildi mi? (API verisi override)
    const isOverride = data.isAutoFetched && !!data.autoFetchedValue && parseTrNumber(data.autoFetchedValue) !== usdPerTon;
    const autoData = { isAutoFetched: data.isAutoFetched, fetchedAt: data.fetchedAt ? new Date(data.fetchedAt) : null };

    if (data.id) {
      const existing = await prisma.lmeRecord.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
      if (!existing) throw new NotFoundError("LME kaydı bulunamadı.");
      if (existing.status === "ARCHIVED") throw new ValidationError("Arşivlenmiş kayıt düzenlenemez.");
      await prisma.lmeRecord.update({
        where: { id: existing.id },
        data: { priceDate, usdPerTon, source: data.source || null, note: data.note || null, ...periodFields(data), ...autoData },
      });
      await writeAudit({
        tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "LmeRecord", entityId: existing.id,
        before: { usdPerTon: existing.usdPerTon }, after: { usdPerTon }, reason: data.source || null,
      });
      if (isOverride) await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "LmeRecord", entityId: existing.id, reason: `API verisi manuel ezildi (${data.autoFetchedValue} → ${usdPerTon})` });
      revalidatePath("/lme");
      return ok({ id: existing.id });
    }

    const created = await prisma.lmeRecord.create({
      data: {
        tenantId: user.tenantId, priceDate, usdPerTon, source: data.source || null, note: data.note || null,
        status: "DRAFT", createdById: user.id, ...periodFields(data), ...autoData,
      },
    });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "LmeRecord", entityId: created.id,
      after: { usdPerTon, priceDate: priceDate.toISOString(), status: "DRAFT", auto: data.isAutoFetched },
    });
    if (isOverride) await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "LmeRecord", entityId: created.id, reason: `API verisi manuel ezildi (${data.autoFetchedValue} → ${usdPerTon})` });
    revalidatePath("/lme");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

/** Hatalı LME kaydını kalıcı siler. Snapshot değerler tekliflerde/siparişlerde
 *  kopyalandığı için silme geçmiş fiyatları etkilemez (FK yok). */
export async function deleteLmeRecord(id: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.LME_MANAGE);
    const rec = await prisma.lmeRecord.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!rec) throw new NotFoundError("LME kaydı bulunamadı.");
    await prisma.lmeRecord.delete({ where: { id: rec.id } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "LmeRecord", entityId: rec.id, before: { usdPerTon: rec.usdPerTon, status: rec.status } });
    revalidatePath("/lme");
    return ok(null);
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
