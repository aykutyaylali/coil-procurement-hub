import "server-only";
import { prisma } from "@/lib/db";

export interface TimelineEntry {
  id: string;
  at: Date;
  action: string; // CREATE | UPDATE | STATUS_CHANGE | APPROVE | DELETE ...
  entityType: string;
  userName: string;
  reason: string | null;
  after: Record<string, unknown> | null;
}

/**
 * PO Zaman Çizelgesi: AuditLog kayıtlarını (append-only, değişmez) kronolojik
 * akışa çevirir. Kullanıcı adları tek sorguda çözülür.
 *
 * forSupplier=true → tedarikçiye kapalı olay türleri (ör. DELETE) dışlanır.
 * ERİŞİM izolasyonu çağıran katmanda assertPoAccess ile sağlanır.
 *
 * Faz 2: PurchaseOrder auditleri. Sonraki fazlar TechnicalReview / POProductionUpdate
 * auditlerini de bu akışa ekleyecek (aynı entityId/ilişki üzerinden).
 */
export async function loadPOTimeline(
  orderId: string,
  tenantId: string,
  opts: { forSupplier?: boolean } = {},
): Promise<TimelineEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId, entityType: "PurchaseOrder", entityId: orderId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const userIds = [...new Set(logs.map((l) => l.userId).filter((x): x is string => !!x))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const parse = (s: string | null): Record<string, unknown> | null => {
    if (!s) return null;
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return logs
    .filter((l) => !(opts.forSupplier && l.action === "DELETE"))
    .map((l) => ({
      id: l.id,
      at: l.createdAt,
      action: l.action,
      entityType: l.entityType,
      userName: l.userId ? nameById.get(l.userId) ?? "—" : "Sistem",
      reason: l.reason,
      after: parse(l.after),
    }));
}
