"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

/** Kalite kontrolünü tamamlar (uygun / şartlı uygun / ret). */
export async function completeInspection(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.QUALITY_INSPECT);
    const data = z
      .object({
        inspectionId: z.string(),
        result: z.enum(["PASS", "CONDITIONAL", "FAIL"]),
        sampleSize: z.string().optional(),
        sampleResult: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(input);

    const inspection = await prisma.qualityInspection.findFirst({
      where: { id: data.inspectionId, receipt: { order: { tenantId: user.tenantId } } },
    });
    if (!inspection) throw new NotFoundError("Kalite kaydı bulunamadı.");

    await prisma.qualityInspection.update({
      where: { id: inspection.id },
      data: {
        status: data.result,
        sampleSize: data.sampleSize || null,
        sampleResult: data.sampleResult || null,
        inspectedBy: user.id,
        inspectedAt: new Date(),
        note: data.note || null,
      },
    });
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "STATUS_CHANGE",
      entityType: "QualityInspection",
      entityId: inspection.id,
      after: { result: data.result },
    });
    revalidatePath(`/quality/${inspection.id}`);
    revalidatePath("/quality");
    return ok({ status: data.result });
  } catch (e) {
    return fail(e);
  }
}

/** Uygunsuzluk (NCR) oluşturur. Tedarikçiye bağlanabilir; performans puanına etki eder. */
export async function createNonConformance(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.QUALITY_INSPECT);
    const data = z
      .object({
        inspectionId: z.string(),
        supplierId: z.string().optional(),
        title: z.string().min(1, "Başlık zorunlu."),
        type: z.enum(["QUALITY", "SUPPLIER_COMPLAINT", "PROCESS"]).default("QUALITY"),
        severity: z.enum(["MINOR", "MAJOR", "CRITICAL"]).default("MINOR"),
        description: z.string().optional(),
        disposition: z.string().optional(),
        cost: z.string().optional(),
        responsibleUserId: z.string().optional(),
        dueDate: z.string().optional(),
      })
      .parse(input);

    const inspection = await prisma.qualityInspection.findFirst({
      where: { id: data.inspectionId, receipt: { order: { tenantId: user.tenantId } } },
      include: { receipt: { include: { order: true } } },
    });
    if (!inspection) throw new NotFoundError("Kalite kaydı bulunamadı.");
    const supplierId = data.supplierId || inspection.receipt.order.supplierId;

    const created = await prisma.$transaction(async (tx) => {
      const code = await nextNumber(tx, user.tenantId, "NONCONFORMANCE").catch(() => `UYG-${Date.now()}`);
      const ncr = await tx.nonConformance.create({
        data: {
          inspectionId: inspection.id,
          supplierId,
          code,
          title: data.title,
          type: data.type,
          severity: data.severity,
          status: "OPEN",
          description: data.description || null,
          disposition: data.disposition || null,
          cost: data.cost ? toStr(data.cost, 2) : null,
          responsibleUserId: data.responsibleUserId || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });

      // Tedarikçi performans puanına etki: açık NCR şiddetine göre kalite puanı düşüşü (bilgilendirici kayıt)
      if (supplierId) {
        const penalty = data.severity === "CRITICAL" ? "10" : data.severity === "MAJOR" ? "5" : "2";
        await tx.supplierRisk.create({
          data: {
            supplierId,
            category: "OPERATIONAL",
            level: data.severity === "CRITICAL" ? "HIGH" : data.severity === "MAJOR" ? "MEDIUM" : "LOW",
            note: `Kalite uygunsuzluğu (${code}): kalite puanına -${penalty} etki`,
          },
        });
      }

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "CREATE",
          entityType: "NonConformance",
          entityId: ncr.id,
          after: { code, severity: data.severity, supplierId },
        },
        tx,
      );
      return ncr;
    });

    revalidatePath(`/quality/${inspection.id}`);
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

/** NCR güncelle: kök neden, düzeltici/önleyici faaliyet, doğrulama, kapanış. */
export async function updateNonConformance(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.QUALITY_INSPECT);
    const data = z
      .object({
        id: z.string(),
        rootCause: z.string().optional(),
        correctiveAction: z.string().optional(),
        preventiveAction: z.string().optional(),
        disposition: z.string().optional(),
        status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]).optional(),
        verify: z.boolean().optional(),
      })
      .parse(input);

    const ncr = await prisma.nonConformance.findFirst({
      where: { id: data.id, inspection: { receipt: { order: { tenantId: user.tenantId } } } },
    });
    if (!ncr) throw new NotFoundError("Uygunsuzluk bulunamadı.");

    const closing = data.status === "DONE";
    await prisma.nonConformance.update({
      where: { id: ncr.id },
      data: {
        rootCause: data.rootCause ?? ncr.rootCause,
        correctiveAction: data.correctiveAction ?? ncr.correctiveAction,
        preventiveAction: data.preventiveAction ?? ncr.preventiveAction,
        disposition: data.disposition ?? ncr.disposition,
        status: data.status ?? ncr.status,
        verifiedBy: data.verify ? user.id : ncr.verifiedBy,
        verifiedAt: data.verify ? new Date() : ncr.verifiedAt,
        closedAt: closing ? new Date() : ncr.closedAt,
      },
    });
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "UPDATE",
      entityType: "NonConformance",
      entityId: ncr.id,
      after: { status: data.status ?? ncr.status, verified: !!data.verify },
    });
    revalidatePath(`/quality/ncr/${ncr.id}`);
    return ok({ status: data.status ?? ncr.status });
  } catch (e) {
    return fail(e);
  }
}

/** CAPA (düzeltici/önleyici faaliyet / 8D) oluşturur. */
export async function createCAPA(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.QUALITY_INSPECT);
    const data = z
      .object({
        ncrId: z.string(),
        title: z.string().min(1, "Başlık zorunlu."),
        type: z.enum(["CORRECTIVE", "PREVENTIVE", "8D"]).default("CORRECTIVE"),
        rootCause: z.string().optional(),
        action: z.string().optional(),
        responsibleUserId: z.string().optional(),
        dueDate: z.string().optional(),
      })
      .parse(input);

    const ncr = await prisma.nonConformance.findFirst({
      where: { id: data.ncrId, inspection: { receipt: { order: { tenantId: user.tenantId } } } },
    });
    if (!ncr || !ncr.supplierId) throw new NotFoundError("Uygunsuzluk veya tedarikçi bulunamadı.");

    const created = await prisma.$transaction(async (tx) => {
      const code = await nextNumber(tx, user.tenantId, "CAPA").catch(() => `CAPA-${Date.now()}`);
      const capa = await tx.cAPA.create({
        data: {
          supplierId: ncr.supplierId!,
          ncrId: ncr.id,
          code,
          title: data.title,
          type: data.type,
          status: "OPEN",
          rootCause: data.rootCause || null,
          action: data.action || null,
          responsibleUserId: data.responsibleUserId || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
        },
      });
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "CAPA", entityId: capa.id, after: { code, type: data.type } },
        tx,
      );
      return capa;
    });
    revalidatePath(`/quality/ncr/${ncr.id}`);
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

/** CAPA durum/kapanış güncellemesi. */
export async function updateCAPA(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.QUALITY_INSPECT);
    const data = z
      .object({ id: z.string(), status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]), verify: z.boolean().optional() })
      .parse(input);
    const capa = await prisma.cAPA.findFirst({ where: { id: data.id, supplier: { tenantId: user.tenantId } } });
    if (!capa) throw new NotFoundError("CAPA bulunamadı.");
    await prisma.cAPA.update({
      where: { id: capa.id },
      data: {
        status: data.status,
        verifiedBy: data.verify ? user.id : capa.verifiedBy,
        verifiedAt: data.verify ? new Date() : capa.verifiedAt,
        closedAt: data.status === "DONE" ? new Date() : capa.closedAt,
      },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "CAPA", entityId: capa.id, after: { status: data.status } });
    if (capa.ncrId) revalidatePath(`/quality/ncr/${capa.ncrId}`);
    return ok({ status: data.status });
  } catch (e) {
    return fail(e);
  }
}
