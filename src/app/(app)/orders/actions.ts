"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { ORDER_TRANSITIONS, assertTransition } from "@/domain/state-machines";
import { buildApprovalInstance, actOnApproval } from "@/domain/approval";
import { writeAudit } from "@/lib/audit";
import { queueEmail, processQueue } from "@/lib/email/service";
import { poSentTemplate } from "@/lib/email/templates";
import { formatMoney } from "@/lib/money";
import { ok, fail, type Result, NotFoundError, AppError } from "@/lib/errors";

/**
 * Siparişi YÖNETİM ONAYINA GÖNDERMEDEN doğrudan onaylar (satınalma yetkisiyle).
 * Yönetim onayı opsiyoneldir: satınalma teklif topladıktan sonra istersE
 * `submitOrderForApproval` ile onaya gönderir; istemezse burada doğrudan onaylar
 * ve tedarikçiye gönderebilir.
 */
export async function confirmOrderDirect(id: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.ORDER_APPROVE);
    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!po) throw new NotFoundError("Sipariş bulunamadı.");
      assertTransition(ORDER_TRANSITIONS, po.status, "APPROVED", "Sipariş");
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: "APPROVED" } });
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status: "APPROVED" }, reason: "Yönetim onayı olmadan satınalma tarafından onaylandı" },
        tx,
      );
      return { status: "APPROVED" };
    });
    revalidatePath(`/orders/${id}`);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

/** Siparişi onaya gönderir (tutar eşiğine göre onay akışı). */
export async function submitOrderForApproval(id: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requireUser();
    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId: user.tenantId } });
      if (!po) throw new NotFoundError("Sipariş bulunamadı.");
      assertTransition(ORDER_TRANSITIONS, po.status, "PENDING_APPROVAL", "Sipariş");

      const instance = await buildApprovalInstance(tx, {
        tenantId: user.tenantId,
        documentType: "PURCHASE_ORDER",
        documentId: po.id,
        context: {
          amount: po.grandTotal,
          currency: po.currency,
          companyId: po.companyId,
          requesterId: po.createdById,
        },
      });
      const newStatus = instance ? "PENDING_APPROVAL" : "APPROVED";
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "PurchaseOrder", entityId: po.id, before: { status: po.status }, after: { status: newStatus } },
        tx,
      );
      return { status: newStatus };
    });
    revalidatePath(`/orders/${id}`);
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

export async function decideOrder(input: {
  id: string;
  action: "APPROVE" | "REJECT";
  note?: string;
}): Promise<Result<{ status: string }>> {
  try {
    const user = await requireUser();
    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({ where: { id: input.id, tenantId: user.tenantId } });
      if (!po) throw new NotFoundError("Sipariş bulunamadı.");
      const instance = await tx.approvalInstance.findFirst({
        where: { documentType: "PURCHASE_ORDER", documentId: po.id, status: "PENDING" },
      });
      if (!instance) throw new NotFoundError("Bekleyen onay bulunamadı.");
      const decision = await actOnApproval(tx, {
        instanceId: instance.id,
        userId: user.id,
        userRoleKeys: user.roleKeys,
        documentCreatorId: po.createdById,
        action: input.action,
        note: input.note,
      });
      let newStatus = po.status;
      if (decision.documentDecision === "APPROVED") newStatus = "APPROVED";
      else if (decision.documentDecision === "REJECTED") newStatus = "CANCELLED";
      if (newStatus !== po.status) {
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newStatus } });
      }
      await writeAudit(
        { tenantId: user.tenantId, userId: user.id, action: "APPROVE", entityType: "PurchaseOrder", entityId: po.id, after: { status: newStatus, action: input.action }, reason: input.note },
        tx,
      );
      return { status: newStatus };
    });
    revalidatePath(`/orders/${input.id}`);
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

/** Onaylı siparişi tedarikçiye e-posta ile gönderir. */
export async function sendOrderToSupplier(id: string): Promise<Result<{ sent: number }>> {
  try {
    const user = await requirePermission(PERMISSIONS.ORDER_SEND);
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { supplier: { include: { contacts: { where: { isPrimary: true }, take: 1 } } }, company: true },
    });
    if (!po) throw new NotFoundError("Sipariş bulunamadı.");
    if (po.status !== "APPROVED") throw new AppError("Yalnızca onaylı sipariş gönderilebilir.");

    const contact = po.supplier.contacts[0];
    const tmpl = poSentTemplate({
      supplierName: contact?.name ?? po.supplier.legalName,
      poNumber: po.number,
      companyName: po.company.name,
      total: formatMoney(po.grandTotal, po.currency),
      magicLinkUrl: `${env.APP_URL}/orders/${po.id}`,
    });
    await queueEmail({
      tenantId: user.tenantId,
      to: contact?.email ?? `${po.supplier.code}@tedarikci.example`,
      subject: `[${po.number}] ${tmpl.subject}`,
      html: tmpl.html,
      text: tmpl.text,
      templateKey: "po_sent",
      refType: "PURCHASE_ORDER",
      refId: po.id,
    });
    const result = await processQueue();
    assertTransition(ORDER_TRANSITIONS, po.status, "SENT", "Sipariş");
    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: "SENT" } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "PurchaseOrder", entityId: po.id, after: { status: "SENT" } });
    revalidatePath(`/orders/${id}`);
    return ok({ sent: result.sent });
  } catch (e) {
    return fail(e);
  }
}
