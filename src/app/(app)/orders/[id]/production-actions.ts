"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, assertPoAccess } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { assertTransition, PO_PRODUCTION_TRANSITIONS, PRODUCTION_STAGES } from "@/domain/state-machines";
import { writeAudit } from "@/lib/audit";
import { notify, resolvePoTargets, ensureParticipant } from "@/domain/notify";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

const schema = z.object({
  orderId: z.string(),
  stage: z.string(),
  note: z.string().optional(),
  estDate: z.string().optional(),
});

/**
 * PO üretim aşamasını günceller (Master §6). Finansal PO durumundan BAĞIMSIZ.
 * Geçiş kuralları PO_PRODUCTION_TRANSITIONS ile; ilk güncelleme (stage null iken)
 * herhangi bir aşamaya işaretlenebilir. Her güncelleme POProductionUpdate + AuditLog
 * yazar (zaman çizelgesinde de görünür).
 */
export async function updateProductionStage(input: unknown): Promise<Result<{ stage: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.PO_PRODUCTION_UPDATE);
    const data = schema.parse(input);
    if (!(PRODUCTION_STAGES as readonly string[]).includes(data.stage)) {
      throw new ValidationError("Geçersiz üretim aşaması.");
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: data.orderId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, supplierId: true, productionStage: true, number: true },
    });
    if (!po) throw new NotFoundError("Sipariş bulunamadı.");
    assertPoAccess(po, user); // tedarikçi yalnız kendi PO'sunu günceller

    // Geçiş doğrulama: mevcut aşama varsa kurala uy; null ise ilk işaretleme serbest
    if (po.productionStage) {
      assertTransition(PO_PRODUCTION_TRANSITIONS, po.productionStage, data.stage, "Üretim aşaması");
    }

    const est = data.estDate ? new Date(data.estDate) : null;

    await prisma.$transaction(async (tx) => {
      await tx.pOProductionUpdate.create({
        data: {
          tenantId: user.tenantId,
          orderId: po.id,
          stage: data.stage,
          note: data.note || null,
          estDate: est,
          updatedById: user.id,
          isInternal: false, // üretim ilerlemesi tedarikçiyle paylaşılır
        },
      });
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { productionStage: data.stage } });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "PRODUCTION_UPDATE",
          entityType: "PurchaseOrder",
          entityId: po.id,
          before: { productionStage: po.productionStage },
          after: { productionStage: data.stage },
          reason: data.note || null,
        },
        tx,
      );
    });

    // Bildirim: Sevke Hazır / Gecikme (geri alma) / normal üretim güncellemesi
    const oldIdx = po.productionStage ? PRODUCTION_STAGES.indexOf(po.productionStage as (typeof PRODUCTION_STAGES)[number]) : -1;
    const newIdx = PRODUCTION_STAGES.indexOf(data.stage as (typeof PRODUCTION_STAGES)[number]);
    const titleKey =
      data.stage === "READY_FOR_SHIPMENT" ? "notif.shipmentReady.title" : oldIdx >= 0 && newIdx < oldIdx ? "notif.delay.title" : "notif.production.title";
    await ensureParticipant(user.tenantId, po.id, user.id, user.supplierId ? "SUPPLIER" : "INTERNAL");
    const targets = await resolvePoTargets(po.id, po.supplierId, user.tenantId);
    await notify({
      tenantId: user.tenantId,
      actorId: user.id,
      targetUserIds: targets,
      type: "PRODUCTION_UPDATE",
      titleKey,
      params: { actor: user.name, order: po.number },
      linkInternal: `/orders/${po.id}?tab=uretim`,
      linkPortal: `/portal/orders/${po.id}?tab=uretim`,
    });
    revalidatePath(`/orders/${po.id}`);
    return ok({ stage: data.stage });
  } catch (e) {
    return fail(e);
  }
}
