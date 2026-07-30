import "server-only";
import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { t, type TranslationKey, type Locale } from "@/lib/i18n";

export interface NotifyInput {
  tenantId: string;
  /** İşlemi yapan; hedeflerden çıkarılır (kendine bildirim gitmez). */
  actorId?: string;
  targetUserIds: string[];
  type: string;
  titleKey: TranslationKey;
  params?: Record<string, string | number>;
  /** İç kullanıcı linki (/orders/[id]?tab=...). */
  linkInternal: string;
  /** Tedarikçi kullanıcı linki (/portal/orders/[id]?tab=...); yoksa linkInternal. */
  linkPortal?: string;
  /** Opsiyonel serbest gövde (ör. yorum önizleme). */
  bodyText?: string;
  /** true ise tedarikçi kullanıcıları hedeflerden çıkarılır (iç olaylar için). */
  excludeSuppliers?: boolean;
}

/**
 * Merkezi bildirim üreticisi (Master §11). Her alıcı için başlık ONUN DİLİNDE
 * üretilir ve link alıcının türüne göre (iç ↔ tedarikçi portalı) yönlendirilir.
 */
export async function notify(input: NotifyInput, tx?: Tx): Promise<void> {
  const db = tx ?? prisma;
  const targets = [...new Set(input.targetUserIds)].filter((id) => id && id !== input.actorId);
  if (targets.length === 0) return;

  const allUsers = await db.user.findMany({
    where: { id: { in: targets }, isActive: true },
    select: { id: true, locale: true, supplierUser: { select: { id: true } } },
  });
  const users = input.excludeSuppliers ? allUsers.filter((u) => !u.supplierUser) : allUsers;
  if (users.length === 0) return;

  await db.notification.createMany({
    data: users.map((u) => {
      const locale = (u.locale as Locale) ?? "tr";
      const isSupplier = !!u.supplierUser;
      return {
        tenantId: input.tenantId,
        userId: u.id,
        type: input.type,
        title: t(input.titleKey, locale, input.params),
        body: input.bodyText ?? null,
        link: isSupplier ? input.linkPortal ?? input.linkInternal : input.linkInternal,
      };
    }),
  });
}

/**
 * Bir PO'nun bildirim hedefleri: çalışma alanı katılımcıları (POParticipant) +
 * o tedarikçinin portal kullanıcıları (SupplierContact.userId).
 */
export async function resolvePoTargets(orderId: string, supplierId: string, tenantId: string, tx?: Tx): Promise<string[]> {
  const db = tx ?? prisma;
  const [participants, contacts] = await Promise.all([
    db.pOParticipant.findMany({ where: { orderId, tenantId }, select: { userId: true } }),
    db.supplierContact.findMany({ where: { supplierId, userId: { not: null } }, select: { userId: true } }),
  ]);
  const ids = new Set<string>();
  participants.forEach((p) => ids.add(p.userId));
  contacts.forEach((c) => c.userId && ids.add(c.userId));
  return [...ids];
}

/** Yalnız İÇ katılımcılar (tedarikçi kullanıcıları hariç) — iç belgeler gibi olaylar için. */
export async function resolveInternalParticipants(orderId: string, tenantId: string, tx?: Tx): Promise<string[]> {
  const db = tx ?? prisma;
  const participants = await db.pOParticipant.findMany({ where: { orderId, tenantId }, select: { userId: true } });
  const ids = participants.map((p) => p.userId);
  if (ids.length === 0) return [];
  const supplierUsers = await db.supplierContact.findMany({ where: { userId: { in: ids } }, select: { userId: true } });
  const supplierSet = new Set(supplierUsers.map((s) => s.userId));
  return ids.filter((id) => !supplierSet.has(id));
}

/** Kullanıcıyı PO çalışma alanına katılımcı yapar (upsert; bildirim yönlendirmesi için). */
export async function ensureParticipant(tenantId: string, orderId: string, userId: string, role: string, tx?: Tx): Promise<void> {
  const db = tx ?? prisma;
  await db.pOParticipant.upsert({
    where: { orderId_userId: { orderId, userId } },
    create: { tenantId, orderId, userId, role },
    update: {},
  });
}
