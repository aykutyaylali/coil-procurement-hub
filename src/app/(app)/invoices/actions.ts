"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { getTolerances } from "@/domain/tolerances";
import { matchInvoice, type MatchInputLine } from "@/domain/invoice/matching";
import { ORDER_TRANSITIONS, canTransition } from "@/domain/state-machines";
import { writeAudit } from "@/lib/audit";
import { add, sub, toStr, gt } from "@/lib/money";
import { ok, fail, type Result, NotFoundError, ConflictError, AppError } from "@/lib/errors";

const createSchema = z.object({
  supplierId: z.string().min(1, "Tedarikçi seçin."),
  orderId: z.string().min(1, "Sipariş seçin."),
  number: z.string().min(1, "Fatura numarası zorunlu."),
  invoiceDate: z.string().min(1, "Fatura tarihi zorunlu."),
  dueDate: z.string().optional(),
  currency: z.string().default("TRY"),
  exchangeRate: z.string().optional(),
  withholdingAmount: z.string().optional(),
  // Kısmi fatura & LME/kur modu (Sarcam bakır tel)
  receiptId: z.string().optional(),
  lmeMode: z.enum(["ORDER", "INVOICE_PERIOD"]).optional(),
  lmeRecordId: z.string().optional(),
  invoiceUsdTryRate: z.string().optional(),
  lines: z
    .array(
      z.object({
        orderLineId: z.string(),
        description: z.string(),
        quantity: z.string(),
        unitPrice: z.string(),
        taxRate: z.string().default("20"),
      }),
    )
    .min(1, "En az bir satır girin."),
});

export async function createInvoice(input: unknown): Promise<Result<{ id: string; status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.INVOICE_CREATE);
    const data = createSchema.parse(input);
    const tol = await getTolerances(user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: data.orderId, tenantId: user.tenantId },
        include: { lines: true },
      });
      if (!po) throw new NotFoundError("Sipariş bulunamadı.");

      // Mükerrer fatura kontrolü (aynı tedarikçi + numara)
      const dup = await tx.invoice.findFirst({
        where: { tenantId: user.tenantId, supplierId: data.supplierId, number: data.number },
      });
      if (dup) throw new ConflictError("Bu tedarikçi ve fatura numarasıyla zaten bir fatura mevcut (mükerrer).");

      // Daha önce faturalanan miktarlar (PO satırı bazında)
      const prevLines = await tx.invoiceLine.findMany({
        where: { orderLineId: { in: data.lines.map((l) => l.orderLineId) }, invoice: { status: { not: "CANCELLED" } } },
        select: { orderLineId: true, quantity: true },
      });
      const prevByLine: Record<string, string> = {};
      for (const pl of prevLines) {
        if (!pl.orderLineId) continue;
        prevByLine[pl.orderLineId] = toStr(add(prevByLine[pl.orderLineId] ?? "0", pl.quantity ?? "0"), 4);
      }

      const matchLines: MatchInputLine[] = data.lines.map((l) => {
        const poLine = po.lines.find((p) => p.id === l.orderLineId);
        return {
          orderLineId: l.orderLineId,
          description: l.description,
          orderedQty: poLine?.quantity ?? "0",
          orderedPrice: poLine?.unitPrice ?? "0",
          receivedQty: poLine?.receivedQty ?? "0",
          prevInvoicedQty: prevByLine[l.orderLineId] ?? "0",
          thisQty: l.quantity,
          thisPrice: l.unitPrice,
          taxRate: l.taxRate,
        };
      });

      const match = matchInvoice(matchLines, { qtyPct: tol.invoiceQtyPct, pricePct: tol.invoicePricePct, amountAbs: tol.invoiceAmountAbs });

      const withholding = data.withholdingAmount ?? "0";
      const payable = toStr(sub(match.grandTotal, withholding), 2);
      const status = match.passed ? "MATCHED" : "BLOCKED";

      const invoice = await tx.invoice.create({
        data: {
          tenantId: user.tenantId,
          supplierId: data.supplierId,
          orderId: po.id,
          number: data.number,
          invoiceDate: new Date(data.invoiceDate),
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          currency: data.currency,
          exchangeRate: data.exchangeRate || null,
          netAmount: match.netTotal,
          taxAmount: match.taxTotal,
          withholdingAmount: withholding,
          grandTotal: match.grandTotal,
          payableAmount: payable,
          status,
          blockReason: match.passed ? null : match.blockedReasons.join(" | "),
          source: "MANUAL",
          // Kısmi fatura & LME/kur modu
          receiptId: data.receiptId || null,
          lmeMode: data.lmeMode || null,
          lmeRecordId: data.lmeMode === "INVOICE_PERIOD" ? (data.lmeRecordId || null) : null,
          invoiceUsdTryRate: data.invoiceUsdTryRate ? toStr(data.invoiceUsdTryRate, 4) : null,
          invoicedQtyKg: toStr(data.lines.reduce((acc, l) => add(acc, l.quantity), add(0)), 3),
          lines: {
            create: data.lines.map((l) => ({
              orderLineId: l.orderLineId,
              description: l.description,
              quantity: toStr(l.quantity, 4),
              unitPrice: toStr(l.unitPrice, 4),
              taxRate: toStr(l.taxRate, 2),
              lineTotal: toStr(add(...match.lines.filter((m) => m.orderLineId === l.orderLineId).map((m) => m.lineNet)), 2),
            })),
          },
          matches: {
            create: { result: JSON.stringify(match), matchType: "THREE_WAY", passed: match.passed },
          },
        },
      });

      // PO satır faturalanan miktarlarını güncelle
      for (const l of data.lines) {
        const poLine = po.lines.find((p) => p.id === l.orderLineId);
        if (poLine) {
          await tx.purchaseOrderLine.update({
            where: { id: poLine.id },
            data: { invoicedQty: toStr(add(poLine.invoicedQty, l.quantity), 4) },
          });
        }
      }

      // Tüm satırlar tam faturalandıysa PO -> INVOICED
      const refreshed = await tx.purchaseOrderLine.findMany({ where: { orderId: po.id } });
      const allInvoiced = refreshed.every((p) => !gt(p.receivedQty, add(p.invoicedQty, "0").toString()) || !gt(p.quantity ?? "0", p.invoicedQty));
      if (allInvoiced && canTransition(ORDER_TRANSITIONS, po.status, "INVOICED")) {
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "INVOICED" } });
      }

      await writeAudit(
        {
          tenantId: user.tenantId, userId: user.id, action: "CREATE",
          entityType: "Invoice", entityId: invoice.id,
          after: { number: data.number, status, grandTotal: match.grandTotal, matched: match.passed },
        },
        tx,
      );

      return { id: invoice.id, status };
    });

    revalidatePath("/invoices");
    revalidatePath(`/orders/${data.orderId}`);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

/** Tolerans dışı (BLOCKED) faturayı istisna onayıyla serbest bırakır. */
export async function approveInvoiceException(input: { id: string; note: string }): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.INVOICE_APPROVE);
    if (!input.note?.trim()) throw new AppError("İstisna onayı için gerekçe zorunludur.");
    const inv = await prisma.invoice.findFirst({ where: { id: input.id, tenantId: user.tenantId } });
    if (!inv) throw new NotFoundError("Fatura bulunamadı.");
    if (inv.status !== "BLOCKED") throw new AppError("Yalnızca bloke fatura istisna onayı gerektirir.");

    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "APPROVED" } });
    await writeAudit({
      tenantId: user.tenantId, userId: user.id, action: "APPROVE",
      entityType: "Invoice", entityId: inv.id,
      before: { status: "BLOCKED" }, after: { status: "APPROVED" }, reason: input.note,
    });
    revalidatePath(`/invoices/${inv.id}`);
    return ok({ status: "APPROVED" });
  } catch (e) {
    return fail(e);
  }
}

/** Matched faturayı onayla / ödendi işaretle. */
export async function updateInvoiceStatus(input: { id: string; action: "APPROVE" | "PAY" }): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.INVOICE_APPROVE);
    const inv = await prisma.invoice.findFirst({ where: { id: input.id, tenantId: user.tenantId } });
    if (!inv) throw new NotFoundError("Fatura bulunamadı.");
    const newStatus = input.action === "APPROVE" ? "APPROVED" : "PAID";
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { status: newStatus, paymentStatus: input.action === "PAY" ? "PAID" : inv.paymentStatus },
    });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "Invoice", entityId: inv.id, after: { status: newStatus } });
    revalidatePath(`/invoices/${inv.id}`);
    return ok({ status: newStatus });
  } catch (e) {
    return fail(e);
  }
}
