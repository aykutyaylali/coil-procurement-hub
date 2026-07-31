import "server-only";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export { REVIEW_TYPES, REVIEW_ACTIONS, REVIEW_RISKS, REVIEW_PRIORITIES, STATUS_BY_ACTION } from "./technical-review-constants";

export interface TRAction {
  id: string;
  action: string;
  byName: string;
  note: string | null;
  createdAt: string;
}
export interface TRAttachment {
  id: string;
  name: string;
  isImage: boolean;
  url: string | null;
}
export interface TechReview {
  id: string;
  reviewType: string;
  currentValue: string | null;
  proposedValue: string | null;
  reason: string | null;
  technicalExplanation: string | null;
  impact: string | null;
  risk: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  actions: TRAction[];
  attachments: TRAttachment[];
}

/**
 * Bir PO'nun teknik incelemelerini (Master §7) yükler: yaratıcı/aksiyon adları,
 * karar geçmişi ve ekler dahil. forSupplier=true ise INTERNAL_NOTE aksiyonları ve
 * iç ekler gizlenir. ERİŞİM izolasyonu çağıran katmanda assertPoAccess ile.
 */
export async function loadTechnicalReviews(
  orderId: string,
  tenantId: string,
  opts: { forSupplier?: boolean } = {},
): Promise<TechReview[]> {
  const rows = await prisma.technicalReview.findMany({
    where: { orderId, tenantId },
    orderBy: { createdAt: "desc" },
    include: { actions: { orderBy: { createdAt: "asc" } } },
  });
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const userIds = [...new Set([...rows.map((r) => r.createdById), ...rows.flatMap((r) => r.actions.map((a) => a.byUserId))])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const atts = await prisma.attachment.findMany({
    where: {
      tenantId,
      entityType: "TechnicalReview",
      entityId: { in: ids },
      scanStatus: { not: "INFECTED" },
      ...(opts.forSupplier ? { isInternal: false } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  const storage = getStorage();
  const attByReview = new Map<string, TRAttachment[]>();
  for (const a of atts) {
    const isImage = a.mimeType.startsWith("image/");
    let url: string | null = null;
    if (isImage) {
      try {
        const buf = await storage.get(a.storageKey);
        url = `data:${a.mimeType};base64,${buf.toString("base64")}`;
      } catch {
        url = null;
      }
    }
    const list = attByReview.get(a.entityId) ?? [];
    list.push({ id: a.id, name: a.fileName, isImage, url });
    attByReview.set(a.entityId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    reviewType: r.reviewType,
    currentValue: r.currentValue,
    proposedValue: r.proposedValue,
    reason: r.reason,
    technicalExplanation: r.technicalExplanation,
    impact: r.impact,
    risk: r.risk,
    priority: r.priority,
    deadline: r.deadline ? r.deadline.toISOString() : null,
    status: r.status,
    createdById: r.createdById,
    createdByName: nameById.get(r.createdById) ?? "—",
    createdAt: r.createdAt.toISOString(),
    actions: r.actions
      .filter((a) => !(opts.forSupplier && a.action === "INTERNAL_NOTE")) // iç not tedarikçiye gizli
      .map((a) => ({
        id: a.id,
        action: a.action,
        byName: nameById.get(a.byUserId) ?? "—",
        note: a.note,
        createdAt: a.createdAt.toISOString(),
      })),
    attachments: attByReview.get(r.id) ?? [],
  }));
}
