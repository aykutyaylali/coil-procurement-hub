"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { nextNumber } from "@/domain/numbering";
import { actOnApproval, buildApprovalInstance, type ApprovalActionType } from "@/domain/approval";
import { reserveBudget, releaseBudget } from "@/domain/budget";
import { parseReqApprovalPolicy, requiresApproval } from "@/domain/approval-policy";
import { REQUISITION_TRANSITIONS, assertTransition } from "@/domain/state-machines";
import { writeAudit } from "@/lib/audit";
import { add, lineNet, toStr } from "@/lib/money";
import { ok, fail, type Result, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { draftSchema, meaningfulLines, validateForSubmit, type Locale } from "@/domain/requisition";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Taslak veriyi kalıcı kılar (idempotency: aynı clientRequestId tek talep üretir). */
async function persistDraft(
  tx: Tx,
  user: { tenantId: string; id: string },
  data: z.infer<typeof draftSchema>,
  clientRequestId?: string,
) {
  if (clientRequestId) {
    const existing = await tx.purchaseRequisition.findFirst({
      where: { tenantId: user.tenantId, clientRequestId },
      include: { lines: { orderBy: { lineNo: "asc" }, select: { id: true } } },
    });
    if (existing) return { req: existing, deduped: true as const, lineIds: existing.lines.map((l) => l.id) };
  }

  const lines = meaningfulLines(data.lines);
  const estimatedTotal = add(...lines.map((l) => lineNet(l.quantity || "0", l.estUnitPrice || "0")));
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
      clientRequestId: clientRequestId || null,
      lines: {
        create: lines.map((l, i) => ({
          lineNo: i + 1,
          description: l.description,
          quantity: toStr(l.quantity || "0", 4),
          uom: l.uom || null,
          estUnitPrice: toStr(l.estUnitPrice || "0", 4),
          currency: data.currency,
          categoryId: l.categoryId || null,
          neededBy: l.neededBy ? new Date(l.neededBy) : null,
        })),
      },
    },
    include: { lines: { orderBy: { lineNo: "asc" }, select: { id: true } } },
  });
  await writeAudit(
    { tenantId: user.tenantId, userId: user.id, action: "CREATE", entityType: "PurchaseRequisition", entityId: req.id, after: { number, status: "DRAFT", estimatedTotal: toStr(estimatedTotal, 2) } },
    tx,
  );
  return { req, deduped: false as const, lineIds: req.lines.map((l) => l.id) };
}

/**
 * TASLAK KAYDET — minimal doğrulama. Açıklama/kalem/fiyat/tarih eksik olabilir;
 * eksik alan hata vermez. Her zaman DRAFT olarak kaydeder ve numara üretir.
 */
export async function createRequisition(input: unknown): Promise<Result<{ id: string; lineIds: string[] }>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_CREATE);
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error);
    const clientRequestId = (input as { clientRequestId?: string })?.clientRequestId;

    const created = await prisma.$transaction((tx) => persistDraft(tx, user, parsed.data, clientRequestId));
    revalidatePath("/requisitions");
    return ok({ id: created.req.id, lineIds: created.lineIds });
  } catch (e) {
    return fail(e);
  }
}

/** Onaya gönderme çekirdeği — approval instance + gerçek bütçe rezervi + durum geçişi. */
async function doSubmit(tx: Tx, user: { tenantId: string; id: string }, reqId: string): Promise<{ status: string }> {
  const req = await tx.purchaseRequisition.findFirst({
    where: { id: reqId, tenantId: user.tenantId },
    include: { requester: { include: { manager: true } }, department: true, company: { select: { settings: true } } },
  });
  if (!req) throw new NotFoundError("Talep bulunamadı.");
  assertTransition(REQUISITION_TRANSITIONS, req.status, "PENDING_APPROVAL", "Talep");

  // Satınalmanın belirlediği onay politikası: her talep onaya gitmez.
  const policy = parseReqApprovalPolicy(req.company?.settings);
  const needApproval = requiresApproval(req.estimatedTotal, policy);

  let deptManagerId: string | null = null;
  if (needApproval && req.departmentId) {
    const dept = await tx.department.findUnique({ where: { id: req.departmentId } });
    deptManagerId = dept?.managerId ?? null;
  }

  const instance = needApproval
    ? await buildApprovalInstance(tx, {
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
      })
    : null;

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
      { tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "PurchaseRequisition", entityId: req.id, after: { budgetWarning: "AŞIM", budgetId: budgetRes.budgetId, remaining: budgetRes.remaining }, reason: "Bütçe aşımı — ek onay gerektirir" },
      tx,
    );
  }

  const newStatus = instance ? "PENDING_APPROVAL" : "APPROVED";
  await tx.purchaseRequisition.update({ where: { id: req.id }, data: { status: newStatus } });
  await writeAudit(
    { tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "PurchaseRequisition", entityId: req.id, before: { status: req.status }, after: { status: newStatus } },
    tx,
  );
  return { status: newStatus };
}

/**
 * KAYDET VE ONAYA GÖNDER — TAM doğrulama önce çalışır. Eksik zorunlu alan varsa
 * hiçbir kayıt oluşturulmaz, durum değişmez, bütçe/onay instance'ı oluşmaz; alan
 * bazlı iki dilli hatalar döner. Doğrulama geçerse taslak oluşturulur ve tek
 * transaction içinde onaya gönderilir (idempotency korumalı).
 */
export async function createAndSubmitRequisition(input: unknown): Promise<Result<{ id: string; status: string; lineIds: string[] }>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_CREATE);
    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error);
    const clientRequestId = (input as { clientRequestId?: string })?.clientRequestId;

    // Tam iş doğrulaması (kullanıcının diline göre)
    const v = validateForSubmit({ companyId: parsed.data.companyId, lines: parsed.data.lines }, user.locale as Locale);
    if (!v.ok) {
      const err = new ValidationError("Talebi onaya göndermek için eksik alanları tamamlayın.", v.fields);
      return fail(err);
    }

    const result = await prisma.$transaction(async (tx) => {
      const { req, deduped, lineIds } = await persistDraft(tx, user, parsed.data, clientRequestId);
      // Idempotency: bu istek zaten işlenmiş ve gönderilmişse tekrar gönderme
      if (deduped && req.status !== "DRAFT") {
        return { id: req.id, status: req.status, lineIds };
      }
      const { status } = await doSubmit(tx, user, req.id);
      return { id: req.id, status, lineIds };
    });

    revalidatePath("/requisitions");
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Kayıtlı bir taslağı onaya gönderir (talep detay ekranından). Kalıcı kaydı TAM
 * doğrular; eksik zorunlu alan varsa gönderilmez ve alan bazlı hata döner.
 */
export async function submitRequisition(id: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requireUser();
    const pre = await prisma.purchaseRequisition.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { lines: true },
    });
    if (!pre) throw new NotFoundError("Talep bulunamadı.");
    if (pre.requesterId !== user.id && !user.isSystemAdmin) {
      throw new ForbiddenError("Yalnızca talep sahibi gönderebilir.");
    }
    const v = validateForSubmit({ companyId: pre.companyId, lines: pre.lines }, user.locale as Locale);
    if (!v.ok) {
      return fail(new ValidationError("Talebi onaya göndermek için eksik alanları tamamlayın.", v.fields));
    }

    const result = await prisma.$transaction((tx) => doSubmit(tx, user, id));

    revalidatePath(`/requisitions/${id}`);
    revalidatePath("/requisitions");
    revalidatePath("/approvals");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

const EDITABLE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ASSIGNED", "REJECTED"];

/**
 * Talebi DÜZELTİR (yönetici/satınalma veya talep sahibi). Genel bilgiler ve
 * kalemler güncellenir. Teklife/siparişe geçmiş (IN_RFQ/ORDERED/CLOSED) talepler
 * düzeltilemez (veri bütünlüğü). Kalemler tümüyle yenilenir.
 */
export async function updateRequisition(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requireUser();
    const data = draftSchema.extend({ id: z.string() }).parse(input);
    const existing = await prisma.purchaseRequisition.findFirst({ where: { id: data.id, tenantId: user.tenantId } });
    if (!existing) throw new NotFoundError("Talep bulunamadı.");

    const canEdit = existing.requesterId === user.id || user.isSystemAdmin || userCan(user, PERMISSIONS.REQUISITION_EDIT);
    if (!canEdit) throw new ForbiddenError("Bu talebi düzenleme yetkiniz yok.");
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new ValidationError(`Bu durumdaki talep düzeltilemez (${existing.status}). Teklif/sipariş aşamasına geçmiş talepler değiştirilemez.`);
    }

    const lines = meaningfulLines(data.lines);
    const estimatedTotal = add(...lines.map((l) => lineNet(l.quantity || "0", l.estUnitPrice || "0")));

    await prisma.$transaction(async (tx) => {
      // RFQ'ya bağlı kalem yoksa güvenle tüm kalemleri yenile
      await tx.requisitionLine.deleteMany({ where: { requisitionId: existing.id } });
      await tx.purchaseRequisition.update({
        where: { id: existing.id },
        data: {
          companyId: data.companyId,
          departmentId: data.departmentId || null,
          costCenterId: data.costCenterId || null,
          projectId: data.projectId || null,
          priority: data.priority,
          purchaseType: data.purchaseType,
          operationType: data.operationType,
          exportProjectNo: data.exportProjectNo || null,
          targetCountry: data.targetCountry || null,
          neededBy: data.neededBy ? new Date(data.neededBy) : null,
          justification: data.justification || null,
          internalNote: data.internalNote || null,
          estimatedTotal: toStr(estimatedTotal, 2),
          lines: {
            create: lines.map((l, i) => ({
              lineNo: i + 1,
              description: l.description,
              quantity: toStr(l.quantity || "0", 4),
              uom: l.uom || null,
              estUnitPrice: toStr(l.estUnitPrice || "0", 4),
              currency: existing.currency,
              categoryId: l.categoryId || null,
            })),
          },
        },
      });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "PurchaseRequisition", entityId: existing.id, before: { estimatedTotal: existing.estimatedTotal }, after: { estimatedTotal: toStr(estimatedTotal, 2), lineCount: lines.length }, reason: "Talep düzeltildi" }, tx);
    });
    revalidatePath(`/requisitions/${existing.id}`);
    revalidatePath("/requisitions");
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Talebi SİLER (yönetici/satınalma yetkisi). Teklif talebine bağlı (RFQ'da olan)
 * talepler silinemez; önce ilgili RFQ iptal edilmelidir.
 */
export async function deleteRequisition(id: string): Promise<Result<null>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_EDIT);
    const req = await prisma.purchaseRequisition.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!req) throw new NotFoundError("Talep bulunamadı.");

    const rfqRefs = await prisma.rFQLine.count({ where: { requisitionId: req.id } });
    if (rfqRefs > 0) {
      throw new ValidationError("Bu talebe bağlı teklif talebi (RFQ) var. Önce ilgili RFQ'yu iptal edin, sonra silin.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.requisitionLine.deleteMany({ where: { requisitionId: req.id } });
      await tx.purchaseRequisition.delete({ where: { id: req.id } });
      await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "DELETE", entityType: "PurchaseRequisition", entityId: req.id, before: { number: req.number, status: req.status }, reason: "Talep silindi" }, tx);
    });
    revalidatePath("/requisitions");
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Satınalma bir onaylı talebi "İŞLEME ALIR": durum APPROVED → ASSIGNED, alıcı
 * atanır. Böylece satınalma hangi talepleri gördüğünü/işleyeceğini ayırt eder.
 */
export async function takeRequisitionIntoProcess(id: string): Promise<Result<{ status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.REQUISITION_ASSIGN);
    const req = await prisma.purchaseRequisition.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!req) throw new NotFoundError("Talep bulunamadı.");
    assertTransition(REQUISITION_TRANSITIONS, req.status, "ASSIGNED", "Talep");
    await prisma.purchaseRequisition.update({ where: { id: req.id }, data: { status: "ASSIGNED", assignedBuyerId: user.id } });
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "STATUS_CHANGE", entityType: "PurchaseRequisition", entityId: req.id, before: { status: req.status }, after: { status: "ASSIGNED", assignedBuyer: user.id }, reason: "Satınalma işleme aldı" });
    revalidatePath(`/requisitions/${id}`);
    revalidatePath("/requisitions");
    return ok({ status: "ASSIGNED" });
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
