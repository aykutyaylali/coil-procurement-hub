"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, assertPoAccess } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { REVIEW_TYPES, REVIEW_ACTIONS, REVIEW_RISKS, STATUS_BY_ACTION } from "@/domain/technical-review-constants";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

const createSchema = z.object({
  orderId: z.string(),
  reviewType: z.string(),
  currentValue: z.string().optional(),
  proposedValue: z.string().optional(),
  reason: z.string().optional(),
  technicalExplanation: z.string().optional(),
  impact: z.string().optional(),
  risk: z.string().optional(),
  priority: z.string().optional().default("NORMAL"),
  deadline: z.string().optional(),
});

/** Teknik inceleme oluşturur (Master §7). Tedarikçi veya iç teknik ekip açabilir. */
export async function createTechnicalReview(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.TECH_REVIEW_CREATE);
    const data = createSchema.parse(input);
    if (!(REVIEW_TYPES as readonly string[]).includes(data.reviewType)) throw new ValidationError("Geçersiz inceleme türü.");
    if (data.risk && !(REVIEW_RISKS as readonly string[]).includes(data.risk)) throw new ValidationError("Geçersiz risk.");

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: data.orderId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, supplierId: true },
    });
    if (!po) throw new NotFoundError("Sipariş bulunamadı.");
    assertPoAccess(po, user);

    const tr = await prisma.technicalReview.create({
      data: {
        tenantId: user.tenantId,
        orderId: po.id,
        supplierId: po.supplierId,
        createdById: user.id,
        reviewType: data.reviewType,
        currentValue: data.currentValue || null,
        proposedValue: data.proposedValue || null,
        reason: data.reason || null,
        technicalExplanation: data.technicalExplanation || null,
        impact: data.impact || null,
        risk: data.risk || null,
        priority: data.priority || "NORMAL",
        deadline: data.deadline ? new Date(data.deadline) : null,
        status: "OPEN",
      },
    });
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "TECH_REVIEW_CREATED",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { reviewType: data.reviewType },
      reason: data.reason || null,
    });
    revalidatePath(`/orders/${po.id}`);
    return ok({ id: tr.id });
  } catch (e) {
    return fail(e);
  }
}

const decideSchema = z.object({
  reviewId: z.string(),
  action: z.string(),
  note: z.string().optional(),
});

/** Teknik incelemeye karar verir (Coil): Approve/Reject/Info/Alternative/Forward/Internal. */
export async function decideTechnicalReview(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.TECH_REVIEW_DECIDE);
    const data = decideSchema.parse(input);
    if (!(REVIEW_ACTIONS as readonly string[]).includes(data.action)) throw new ValidationError("Geçersiz aksiyon.");

    const tr = await prisma.technicalReview.findFirst({
      where: { id: data.reviewId, tenantId: user.tenantId },
      select: { id: true, orderId: true, status: true },
    });
    if (!tr) throw new NotFoundError("Teknik inceleme bulunamadı.");
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: tr.orderId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, supplierId: true },
    });
    if (!po) throw new NotFoundError("Sipariş bulunamadı.");
    assertPoAccess(po, user);

    const newStatus = STATUS_BY_ACTION[data.action] ?? tr.status; // INTERNAL_NOTE → değişmez

    await prisma.$transaction(async (tx) => {
      await tx.technicalReviewAction.create({
        data: { reviewId: tr.id, action: data.action, byUserId: user.id, note: data.note || null },
      });
      if (newStatus !== tr.status) {
        await tx.technicalReview.update({ where: { id: tr.id }, data: { status: newStatus } });
      }
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "TECH_REVIEW_DECISION",
          entityType: "PurchaseOrder",
          entityId: po.id,
          after: { decision: data.action, status: newStatus },
          reason: data.note || null,
        },
        tx,
      );
    });

    revalidatePath(`/orders/${po.id}`);
    return ok({ status: newStatus });
  } catch (e) {
    return fail(e);
  }
}
