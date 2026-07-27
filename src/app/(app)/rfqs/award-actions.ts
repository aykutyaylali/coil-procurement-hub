"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { add, lineNet, lineTax, toStr } from "@/lib/money";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

const awardSchema = z.object({
  rfqId: z.string(),
  justification: z.string().min(3, "Seçim gerekçesi zorunludur."),
  lowestNotChosenReason: z.string().optional(),
  awards: z
    .array(
      z.object({
        rfqLineId: z.string(),
        bidId: z.string(),
        supplierId: z.string(),
        quantity: z.string(),
      }),
    )
    .min(1, "En az bir satır için tedarikçi seçin."),
});

/**
 * RFQ kararını verir ve satır bazlı seçimden (split award destekli)
 * tedarikçi başına birer satınalma siparişi oluşturur.
 */
export async function awardRfqAndCreateOrders(
  input: unknown,
): Promise<Result<{ orderIds: string[] }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_AWARD);
    const data = awardSchema.parse(input);

    const result = await prisma.$transaction(async (tx) => {
      const rfq = await tx.rFQ.findFirst({
        where: { id: data.rfqId, tenantId: user.tenantId },
        include: { lines: true },
      });
      if (!rfq) throw new NotFoundError("RFQ bulunamadı.");
      if (!["EVALUATION", "NEGOTIATION", "OPEN"].includes(rfq.status)) {
        throw new ValidationError("RFQ değerlendirme aşamasında olmalı.");
      }

      // Gerekli bid satırlarını topla
      const bidIds = Array.from(new Set(data.awards.map((a) => a.bidId)));
      const bidLines = await tx.bidLine.findMany({
        where: { bidId: { in: bidIds } },
        include: { bid: true },
      });

      // Karar kaydı
      await tx.awardDecision.create({
        data: {
          rfqId: rfq.id,
          awards: JSON.stringify(data.awards),
          justification: data.justification,
          lowestNotChosenReason: data.lowestNotChosenReason ?? null,
          decidedBy: user.id,
          status: "APPROVED",
        },
      });

      // Kazanan teklifleri işaretle
      await tx.bid.updateMany({ where: { id: { in: bidIds } }, data: { status: "AWARDED" } });

      // Tedarikçiye göre grupla
      const bySupplier = new Map<string, typeof data.awards>();
      for (const a of data.awards) {
        const arr = bySupplier.get(a.supplierId) ?? [];
        arr.push(a);
        bySupplier.set(a.supplierId, arr);
      }

      const orderIds: string[] = [];
      for (const [supplierId, awards] of bySupplier) {
        const poNumber = await nextNumber(tx, user.tenantId, "PURCHASE_ORDER");
        let subtotal = add(0);
        let taxTotal = add(0);
        const lineData = [];
        let lineNo = 1;

        for (const a of awards) {
          const rfqLine = rfq.lines.find((l) => l.id === a.rfqLineId);
          const bidLine = bidLines.find((b) => b.bidId === a.bidId && b.rfqLineId === a.rfqLineId);
          if (!rfqLine || !bidLine) continue;

          const net = lineNet(a.quantity, bidLine.unitPrice, bidLine.discountPct);
          const tax = lineTax(net, bidLine.taxRate);
          subtotal = add(subtotal, net);
          taxTotal = add(taxTotal, tax);

          lineData.push({
            lineNo: lineNo++,
            itemId: rfqLine.itemId,
            description: rfqLine.description,
            quantity: toStr(a.quantity, 4),
            uom: rfqLine.uom,
            unitPrice: toStr(bidLine.unitPrice, 4),
            discountPct: toStr(bidLine.discountPct, 4),
            taxRate: toStr(bidLine.taxRate, 4),
            lineTotal: toStr(net, 2),
            neededBy: rfqLine.neededBy,
          });
        }

        const grandTotal = add(subtotal, taxTotal);
        const firstBid = bidLines.find((b) => b.bid.supplierId === supplierId)?.bid;
        const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });

        const po = await tx.purchaseOrder.create({
          data: {
            tenantId: user.tenantId,
            number: poNumber,
            companyId: rfq.companyId,
            supplierId,
            rfqId: rfq.id,
            status: "DRAFT",
            operationType: rfq.operationType,
            language: supplier?.preferredLanguage ?? "tr",
            supplierCountry: supplier?.country ?? null,
            currency: firstBid?.currency ?? "TRY",
            paymentTerms: firstBid?.paymentTermDays ? `${firstBid.paymentTermDays} gün` : null,
            incoterm: firstBid?.incoterm ?? supplier?.defaultIncoterm ?? null,
            subtotal: toStr(subtotal, 2),
            taxTotal: toStr(taxTotal, 2),
            grandTotal: toStr(grandTotal, 2),
            createdById: user.id,
            lines: { create: lineData },
          },
        });
        orderIds.push(po.id);

        await writeAudit(
          {
            tenantId: user.tenantId,
            userId: user.id,
            action: "CREATE",
            entityType: "PurchaseOrder",
            entityId: po.id,
            after: { number: poNumber, fromRfq: rfq.number, grandTotal: toStr(grandTotal, 2) },
          },
          tx,
        );
      }

      await tx.rFQ.update({ where: { id: rfq.id }, data: { status: "AWARDED" } });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "STATUS_CHANGE",
          entityType: "RFQ",
          entityId: rfq.id,
          after: { status: "AWARDED" },
          reason: data.justification,
        },
        tx,
      );

      return { orderIds };
    });

    revalidatePath(`/rfqs/${data.rfqId}`);
    revalidatePath("/orders");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
