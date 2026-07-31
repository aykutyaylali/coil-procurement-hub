import type { Tx } from "@/lib/db";
import { d, gte } from "@/lib/money";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { permissionsForRoles } from "@/lib/rbac";

function lte(a: string, b: string): boolean {
  return d(a).lessThanOrEqualTo(d(b));
}

export interface ApprovalContext {
  amount?: string; // decimal-as-string
  currency?: string;
  companyId?: string | null;
  categoryId?: string | null;
  projectId?: string | null;
  urgency?: string | null;
  riskLevel?: string | null;
  operationType?: string | null;
  requesterId: string; // belge sahibini görevler ayrılığı için biliriz
  requesterManagerId?: string | null;
  departmentManagerId?: string | null;
}

interface RuleConditions {
  minAmount?: string;
  maxAmount?: string;
  currency?: string;
  companyId?: string;
  categoryId?: string;
  projectId?: string;
  urgency?: string;
  riskLevel?: string;
  operationType?: string;
}

interface ResolvedStep {
  sequence: number;
  name: string;
  approverType: string;
  approverValue: string | null;
  approverUserId: string | null; // MANAGER/USER için çözülmüş
  approverRoleKey: string | null; // ROLE için
  slaHours: number | null;
  enforceSegregation: boolean;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  actedByUserId?: string;
  actedAt?: string;
}

function matchesConditions(cond: RuleConditions, ctx: ApprovalContext): boolean {
  if (cond.currency && ctx.currency && cond.currency !== ctx.currency) return false;
  if (cond.companyId && ctx.companyId && cond.companyId !== ctx.companyId) return false;
  if (cond.categoryId && ctx.categoryId && cond.categoryId !== ctx.categoryId) return false;
  if (cond.projectId && ctx.projectId && cond.projectId !== ctx.projectId) return false;
  if (cond.urgency && ctx.urgency && cond.urgency !== ctx.urgency) return false;
  if (cond.riskLevel && ctx.riskLevel && cond.riskLevel !== ctx.riskLevel) return false;
  if (cond.operationType && ctx.operationType && cond.operationType !== ctx.operationType)
    return false;
  if (cond.minAmount && ctx.amount && !gte(ctx.amount, cond.minAmount)) return false;
  if (cond.maxAmount && ctx.amount && !lte(ctx.amount, cond.maxAmount)) return false;
  return true;
}

/**
 * Belge için onay örneği (instance) oluşturur.
 * Uygun workflow + eşleşen ilk kuralı (priority sırası) seçer, adımları çözer.
 * Eşleşen kural yoksa null döner (onay gerekmez => belge doğrudan APPROVED sayılabilir).
 */
export async function buildApprovalInstance(
  tx: Tx,
  params: { tenantId: string; documentType: string; documentId: string; context: ApprovalContext },
): Promise<{ instanceId: string; steps: ResolvedStep[] } | null> {
  const { tenantId, documentType, documentId, context } = params;

  const workflow = await tx.approvalWorkflow.findFirst({
    where: { tenantId, documentType, isActive: true },
    include: {
      rules: {
        where: { isActive: true },
        orderBy: { priority: "asc" },
        include: { steps: { orderBy: { sequence: "asc" } } },
      },
    },
  });
  if (!workflow) return null;

  let matchedRule = null as (typeof workflow.rules)[number] | null;
  for (const rule of workflow.rules) {
    let cond: RuleConditions = {};
    try {
      cond = JSON.parse(rule.conditions) as RuleConditions;
    } catch {
      cond = {};
    }
    if (matchesConditions(cond, context)) {
      matchedRule = rule;
      break;
    }
  }
  if (!matchedRule || matchedRule.steps.length === 0) return null;

  const steps: ResolvedStep[] = [];
  for (const step of matchedRule.steps) {
    let approverUserId: string | null = null;
    let approverRoleKey: string | null = null;

    switch (step.approverType) {
      case "MANAGER":
        approverUserId = context.requesterManagerId ?? null;
        break;
      case "DEPARTMENT_MANAGER":
        approverUserId = context.departmentManagerId ?? null;
        break;
      case "USER":
        approverUserId = step.approverValue ?? null;
        break;
      case "ROLE":
        approverRoleKey = step.approverValue ?? null;
        break;
    }

    steps.push({
      sequence: step.sequence,
      name: step.name,
      approverType: step.approverType,
      approverValue: step.approverValue,
      approverUserId,
      approverRoleKey,
      slaHours: step.slaHours,
      enforceSegregation: step.enforceSegregation,
      status: "PENDING",
    });
  }

  const instance = await tx.approvalInstance.create({
    data: {
      workflowId: workflow.id,
      documentType,
      documentId,
      status: "PENDING",
      currentStep: 0,
      stepsState: JSON.stringify(steps),
    },
  });

  return { instanceId: instance.id, steps };
}

export type ApprovalActionType =
  | "APPROVE"
  | "REJECT"
  | "REQUEST_CHANGE"
  | "REQUEST_INFO"
  | "FORWARD"
  | "COMMENT";

/**
 * Bir onay adımında işlem yapar. Uygunluk, görevler ayrılığı ve vekâlet kontrol edilir.
 * Döner: instance'ın yeni durumu ve belgenin nihai durum önerisi.
 */
export async function actOnApproval(
  tx: Tx,
  params: {
    instanceId: string;
    userId: string;
    userRoleKeys: string[];
    documentCreatorId: string;
    action: ApprovalActionType;
    note?: string;
    forwardToUserId?: string;
    isSystemAdmin?: boolean; // Sistem Yöneticisi her onay adımında işlem yapabilir (süper-admin)
  },
): Promise<{ instanceStatus: string; documentDecision: "APPROVED" | "REJECTED" | "PENDING" }> {
  const instance = await tx.approvalInstance.findUnique({ where: { id: params.instanceId } });
  if (!instance) throw new NotFoundError("Onay süreci bulunamadı.");
  if (instance.status !== "PENDING") {
    throw new AppError("Bu onay süreci zaten tamamlanmış.");
  }

  const steps = JSON.parse(instance.stepsState) as ResolvedStep[];
  const current = steps[instance.currentStep];
  if (!current) throw new AppError("Onay adımı bulunamadı.");

  // Vekâlet çözümü: kullanıcı, asıl onaycı adına işlem yapıyor olabilir
  let actedOnBehalfOf: string | null = null;
  let eligible = false;

  const isDesignatedUser =
    current.approverUserId != null && current.approverUserId === params.userId;
  const holdsRole =
    current.approverRoleKey != null && params.userRoleKeys.includes(current.approverRoleKey);

  if (isDesignatedUser || holdsRole || params.isSystemAdmin) {
    eligible = true;
  } else if (current.approverUserId) {
    // Vekâlet: asıl onaycıdan bu kullanıcıya aktif devir var mı?
    const now = new Date();
    const delegation = await tx.delegation.findFirst({
      where: {
        fromUserId: current.approverUserId,
        toUserId: params.userId,
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
    });
    if (delegation) {
      eligible = true;
      actedOnBehalfOf = current.approverUserId;
    }
  }

  if (!eligible) {
    throw new ForbiddenError("Bu onay adımında işlem yapma yetkiniz bulunmuyor.");
  }

  // Görevler ayrılığı: kişi kendi oluşturduğu belgeyi onaylayamaz (sysadmin hariç).
  if (
    current.enforceSegregation &&
    !params.isSystemAdmin &&
    (params.action === "APPROVE") &&
    (params.userId === params.documentCreatorId ||
      (actedOnBehalfOf && actedOnBehalfOf === params.documentCreatorId))
  ) {
    throw new ForbiddenError(
      "Görevler ayrılığı gereği kendi oluşturduğunuz belgeyi onaylayamazsınız.",
    );
  }

  // İşlem kaydı
  await tx.approvalAction.create({
    data: {
      instanceId: instance.id,
      stepSequence: current.sequence,
      userId: params.userId,
      action: params.action,
      note: params.note ?? null,
      forwardToUserId: params.forwardToUserId ?? null,
      actedOnBehalfOf,
    },
  });

  let instanceStatus = instance.status;
  let documentDecision: "APPROVED" | "REJECTED" | "PENDING" = "PENDING";
  let newCurrentStep = instance.currentStep;

  switch (params.action) {
    case "APPROVE": {
      current.status = "APPROVED";
      current.actedByUserId = params.userId;
      current.actedAt = new Date().toISOString();
      const nextIndex = instance.currentStep + 1;
      if (nextIndex >= steps.length) {
        instanceStatus = "APPROVED";
        documentDecision = "APPROVED";
      } else {
        newCurrentStep = nextIndex;
      }
      break;
    }
    case "REJECT": {
      current.status = "REJECTED";
      current.actedByUserId = params.userId;
      current.actedAt = new Date().toISOString();
      instanceStatus = "REJECTED";
      documentDecision = "REJECTED";
      break;
    }
    case "FORWARD": {
      if (!params.forwardToUserId) throw new AppError("Yönlendirilecek kullanıcı belirtilmedi.");
      current.approverUserId = params.forwardToUserId;
      current.approverRoleKey = null;
      break;
    }
    case "REQUEST_CHANGE":
    case "REQUEST_INFO":
    case "COMMENT":
      // Belge sahibine döner; instance beklemede kalır
      break;
  }

  await tx.approvalInstance.update({
    where: { id: instance.id },
    data: {
      stepsState: JSON.stringify(steps),
      currentStep: newCurrentStep,
      status: instanceStatus,
      completedAt: documentDecision !== "PENDING" ? new Date() : null,
    },
  });

  return { instanceStatus, documentDecision };
}

/** Belirli bir kullanıcının bekleyen onaylarını (documentType/documentId) listeler. */
export async function pendingApprovalsForUser(
  tx: Tx,
  userId: string,
  roleKeys: string[],
  isSystemAdmin = false,
): Promise<{ instanceId: string; documentType: string; documentId: string; stepName: string }[]> {
  const instances = await tx.approvalInstance.findMany({
    where: { status: "PENDING" },
  });
  const result = [];
  for (const inst of instances) {
    const steps = JSON.parse(inst.stepsState) as ResolvedStep[];
    const current = steps[inst.currentStep];
    if (!current) continue;
    const isUser = current.approverUserId === userId;
    const isRole = current.approverRoleKey != null && roleKeys.includes(current.approverRoleKey);
    if (isUser || isRole || isSystemAdmin) {
      result.push({
        instanceId: inst.id,
        documentType: inst.documentType,
        documentId: inst.documentId,
        stepName: current.name,
      });
    }
  }
  return result;
}

export { permissionsForRoles };
