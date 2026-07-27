"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { ORDER_TRANSITIONS, canTransition } from "@/domain/state-machines";
import { dispositionToSchema } from "@/domain/labels";
import { getTolerances } from "@/domain/tolerances";
import { writeAudit } from "@/lib/audit";
import { add, sub, d, gt, toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError, ValidationError, AppError } from "@/lib/errors";

const lineSchema = z.object({
  orderLineId: z.string(),
  acceptedQty: z.string().default("0"),
  rejectedQty: z.string().default("0"),
  disposition: z.string().default("ACCEPTED"),
  lotNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  binLocation: z.string().optional(),
  note: z.string().optional(),
});

const createSchema = z.object({
  orderId: z.string(),
  warehouseId: z.string().optional(),
  waybillNo: z.string().optional(),
  note: z.string().optional(),
  qualityRequired: z.boolean().default(false),
  lines: z.array(lineSchema).min(1, "En az bir satÄ±r girin."),
});

/**
 * Mal kabul oluÅŸturur. KÄ±smi/Ã§oklu kabul destekler. Kabul+ret miktarÄ±nÄ±n
 * sipariÅŸin aÃ§Ä±k miktarÄ±nÄ± (fazla teslimat toleransÄ± dÄ±ÅŸÄ±nda) geÃ§mesini
 * BACKEND'de engeller. Kalite gerekiyorsa kalite kuyruÄŸuna dÃ¼ÅŸer.
 */
export async function createGoodsReceipt(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RECEIPT_CREATE);
    const data = createSchema.parse(input);
    const tol = await getTolerances(user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: data.orderId, tenantId: user.tenantId },
        include: { lines: true },
      });
      if (!po) throw new NotFoundError("SipariÅŸ bulunamadÄ±.");
      if (["DRAFT", "PENDING_APPROVAL", "CANCELLED"].includes(po.status)) {
        throw new AppError("Bu sipariÅŸ durumunda mal kabul yapÄ±lamaz.");
      }

      const activeLines = data.lines.filter(
        (l) => gt(l.acceptedQty || "0", "0") || gt(l.rejectedQty || "0", "0"),
      );
      if (activeLines.length === 0) throw new ValidationError("En az bir satÄ±rda miktar girin.");

      // Backend miktar doÄŸrulamasÄ±
      for (const l of activeLines) {
        const poLine = po.lines.find((pl) => pl.id === l.orderLineId);
        if (!poLine) throw new ValidationError("GeÃ§ersiz sipariÅŸ satÄ±rÄ±.");
        const alreadyHandled = add(poLine.receivedQty, poLine.rejectedQty);
        const openQty = sub(poLine.quantity, alreadyHandled);
        const thisQty = add(l.acceptedQty || "0", l.rejectedQty || "0");
        const allowed = d(openQty).plus(d(poLine.quantity).times(d(tol.overReceiptPct).dividedBy(100)));
        if (gt(thisQty.toString(), allowed.toString())) {
          throw new ValidationError(
            `SatÄ±r kabul miktarÄ± aÃ§Ä±k miktarÄ± aÅŸÄ±yor. AÃ§Ä±k: ${toStr(openQty, 2)}, izin verilen (tolerans dahil): ${allowed.toFixed(2)}.`,
          );
        }
      }

      const number = await nextNumber(tx, user.tenantId, "GOODS_RECEIPT");
      const receipt = await tx.goodsReceipt.create({
        data: {
          orderId: po.id,
          warehouseId: data.warehouseId || null,
          number,
          receivedById: user.id,
          waybillNo: data.waybillNo || null,
          status: "POSTED",
          note: data.note || null,
          lines: {
            create: activeLines.map((l) => ({
              orderLineId: l.orderLineId,
              acceptedQty: toStr(l.acceptedQty || "0", 4),
              rejectedQty: toStr(l.rejectedQty || "0", 4),
              disposition: dispositionToSchema(l.disposition),
              lotNumber: l.lotNumber || null,
              serialNumber: l.serialNumber || null,
              binLocation: l.binLocation || null,
              note: l.note || null,
            })),
          },
        },
      });

      // PO satÄ±r miktarlarÄ±nÄ± gÃ¼ncelle
      for (const l of activeLines) {
        const poLine = po.lines.find((pl) => pl.id === l.orderLineId)!;
        await tx.purchaseOrderLine.update({
          where: { id: poLine.id },
          data: {
            receivedQty: toStr(add(poLine.receivedQty, l.acceptedQty || "0"), 4),
            rejectedQty: toStr(add(poLine.rejectedQty, l.rejectedQty || "0"), 4),
          },
        });
      }

      // PO durumunu yeniden hesapla
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { orderId: po.id } });
      const allDone = refreshed.every((pl) => !gt(pl.quantity, add(pl.receivedQty, pl.rejectedQty).toString()));
      const anyReceived = refreshed.some((pl) => gt(add(pl.receivedQty, pl.rejectedQty).toString(), "0"));
      let newStatus = po.status;
      if (allDone && canTransition(ORDER_TRANSITIONS, po.status, "RECEIVED")) newStatus = "RECEIVED";
      else if (anyReceived && canTransition(ORDER_TRANSITIONS, po.status, "PARTIALLY_RECEIVED"))
        newStatus = "PARTIALLY_RECEIVED";
      if (newStatus !== po.status) {
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });
      }

      // Kalite kuyruÄŸu
      if (data.qualityRequired) {
        await tx.qualityInspection.create({
          data: { receiptId: receipt.id, status: "PENDING" },
        });
      }

      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "CREATE",
          entityType: "GoodsReceipt",
          entityId: receipt.id,
          after: { number, orderId: po.id, poStatus: newStatus, qualityRequired: data.qualityRequired },
        },
        tx,
      );

      return { id: receipt.id };
    });

    revalidatePath("/receipts");
    revalidatePath(`/orders/${data.orderId}`);
    if (createSchema.parse(input).qualityRequired) revalidatePath("/quality");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
