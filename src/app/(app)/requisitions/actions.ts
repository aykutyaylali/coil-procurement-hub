"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { actOnApproval, buildApprovalInstance, type ApprovalActionType } from "@/domain/approval";
import { reserveBudget, releaseBudget } from "@/domain/budget";
import { REQUISITION_TRANSITIONS, assertTransition } from "@/domain/state-machines";
import { writeAudit } from "@/lib/audit";
import { add, lineNet, toStr } from "@/lib/money";
import { ok, fail, type Result, ForbiddenError, NotFoundError } from "@/lib/errors";

const lineSchema = z.object({
  description: z.string().min(1, "Açıklama zorunlu."),
  quantity: z.string().refine((v) => Number(v) > 0, "Miktar 0'dan büyük olmalı."),
  uom: z.string().optional(),
  estUnitPrice: z.string().default("0"),
  taxRate: z.string().default("20"),
  categoryId: z.string().optional(),
  neededBy: z.string().optional(),
});

const createSchema = z.object({
  companyId: z.string().min(1, "Şirket seçin."),
  siteId: z.string().optional(),
  departmentId: z.string().optional(),
  costCenterId: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  purchaseType: z.enum(["GOODS", "SERVICE", "EXPENSE"]).default("GOODS"),
  operationType: z
    .enum(["DOMESTIC_PURCHASE", "IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"])
    .default("DOMESTIC_PURCHASE"),
  exportProjectNo: z.string().optional(),
  targetCountry: z.string().optional(),
  currency: z.string().default("TRY"),
  neededBy: z.string().optional(),
  justification: z.string().optional(),
  internalNote: z.string().optional(),
  lines: z.array(lineSchema).min(1, "En az bir kalem ekleyin."),
});

export async function createRequisition(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_CREATE);
    const data = createSchema.parse(input);

    const estimatedTotal = add(
      ...data.lines.map((l) => lineNet(l.quantity, l.estUnitPrice)),
    );

    const created = await prisma.$transaction(async (tx) => {
      const number = await nextNumber(tx, user.tenantId, "REQUISITION");
      const req = await tx.purchaseRequisition.create({
        data: {
          tenantId: user.tenantId,
          number,
          companyId: data.companyId,
          siteId: data.siteId || null,
          departmentId: data.departmentId || null,
          costCenterId: data.costCenterId || null,
          projectId: data.projectId || null,
          requesterId: user.id,
          status: "DRAFT",
          priority: data.priority,
          purchaseType: data.purchaseType,
          operationType: data.operationType,
          exportProjectNo: data.exportProjectNo || null,
          targetCountry: data.targetCountry || null,
          currency: data.currency,
          neededBy: data.neededBy ? new Date(data.neededBy) : null,
          justification: data.justification || null,
          internalNote: data.internalNote || null,
          estimatedTotal: toStr(estimatedTotal, 2),
          lines: {
            create: data.lines.map((l, i) => ({
              lineNo: i + 1,
              description: l.description,
              quantity: toStr(l.quantity, 4),
              uom: l.uom || null,
              estUnitPrice: toStr(l.estUnitPrice, 4),
              currency: data.currency,
              categoryId: l.categoryId || null,
              neededBy: l.neededBy ? new Date(l.neededBy) : null,
            })),
          },
        },
      });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "CREATE",
          entityType: "PurchaseRequisition",
          entityId: req.id,
          after: { number, status: "DRAFT", estimatedTotal: toStr(estimatedTotal, 2) },
        },
        tx,
      );
      return req;
    });

    revalidatePath("/requisitions");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

export async function submitRequisition(id: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requireUser();
    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.purchaseRequisition.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { requester: { include: { manager: true } }, department: true },
      });
      if (!req) throw new NotFoundError("Talep bulunamadı.");
      if (req.requesterId !== user.id && !user.isSystemAdmin) {
        throw new ForbiddenError("Yalnızca talep sahibi gönderebilir.");
      }
      assertTransition(REQUISITION_TRANSITIONS, req.status, "PENDING_APPROVAL", "Talep");

      // Departman amiri
      let deptManagerId: string | null = null;
      if (req.departmentId) {
        const dept = await tx.department.findUnique({ where: { id: req.departmentId } });
        deptManagerId = dept?.managerId ?? null;
      }

      const instance = await buildApprovalInstance(tx, {
        tenantId: user.tenantId,
        documentType: "REQUISITION",
        documentId: req.id,
        context: {
          amount: req.estimatedTotal,
          currency: req.currency,
          companyId: req.companyId,
          projectId: req.projectId,
          urgency: req.priority,
          operationType: req.operationType,
          requesterId: req.requesterId,
          requesterManagerId: req.requester.managerId,
          departmentManagerId: deptManagerId,
        },
      });

      // Gerçek bütçe kontrolü + rezervasyonu (uygun bütçe varsa)
      const budgetRes = await reserveBudget(tx, {
        tenantId: user.tenantId,
        companyId: req.companyId,
        costCenterId: req.costCenterId,
        projectId: req.projectId,
        amount: req.estimatedTotal,
        refType: "REQUISITION",
        refId: req.id,
        note: `${req.number} talep rezervi`,
      });
      if (budgetRes?.wouldExceed) {
        await writeAudit(
          {
            tenantId: user.tenantId, userId: user.id, action: "UPDATE",
            entityType: "PurchaseRequisition", entityId: req.id,
            after: { budgetWarning: "AŞIM", budgetId: budgetRes.budgetId, remaining: budgetRes.remaining },
            reason: "Bütçe aşımı — ek onay gerektirir",
          },
          tx,
        );
      }

      // Onay kuralı yoksa doğrudan onaylı sayılır
      const newStatus = instance ? "PENDING_APPROVAL" : "APPROVED";
      await tx.purchaseRequisition.update({
        where: { id: req.id },
        data: { status: newStatus },
      });
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "STATUS_CHANGE",
          entityType: "PurchaseRequisition",
          entityId: req.id,
          before: { status: req.status },
          after: { status: newStatus },
        },
        tx,
      );
      return { status: newStatus };
    });

    revalidatePath(`/requisitions/${id}`);
    revalidatePath("/requisitions");
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

const decideSchema = z.object({
  id: z.string(),
  action: z.enum(["APPROVE", "REJECT", "REQUEST_CHANGE", "REQUEST_INFO", "FORWARD"]),
  note: z.string().optional(),
  forwardToUserId: z.string().optional(),
});

export async function decideRequisition(input: unknown): Promise<Result<{ status: string }>> {
  try {
    const user = await requireUser();
    const data = decideSchema.parse(input);

    const result = await prisma.$transaction(async (tx) => {
      const req = await tx.purchaseRequisition.findFirst({
        where: { id: data.id, tenantId: user.tenantId },
      });
      if (!req) throw new NotFoundError("Talep bulunamadı.");

      const instance = await tx.approvalInstance.findFirst({
        where: { documentType: "REQUISITION", documentId: req.id, status: "PENDING" },
      });
      if (!instance) throw new NotFoundError("Bekleyen onay süreci bulunamadı.");

      const decision = await actOnApproval(tx, {
        instanceId: instance.id,
        userId: user.id,
        userRoleKeys: user.roleKeys,
        documentCreatorId: req.requesterId,
        action: data.action as ApprovalActionType,
        note: data.note,
        forwardToUserId: data.forwardToUserId,
      });

      let newStatus = req.status;
      if (decision.documentDecision === "APPROVED") newStatus = "APPROVED";
      else if (decision.documentDecision === "REJECTED") newStatus = "REJECTED";
      else if (data.action === "REQUEST_CHANGE") newStatus = "DRAFT";

      if (newStatus !== req.status) {
        await tx.purchaseRequisition.update({
          where: { id: req.id },
          data: { status: newStatus },
        });
        // Ret veya düzeltme talebinde bütçe rezervini serbest bırak
        if (newStatus === "REJECTED" || newStatus === "DRAFT") {
          await releaseBudget(tx, "REQUISITION", req.id);
        }
      }
      await writeAudit(
        {
          tenantId: user.tenantId,
          userId: user.id,
          action: "APPROVE",
          entityType: "PurchaseRequisition",
          entityId: req.id,
          before: { status: req.status },
          after: { status: newStatus, action: data.action },
          reason: data.note,
        },
        tx,
      );
      return { status: newStatus };
    });

    revalidatePath(`/requisitions/${data.id}`);
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
