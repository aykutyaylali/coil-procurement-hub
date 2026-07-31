"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission, assertPoAccess, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { notify, resolvePoTargets, ensureParticipant } from "@/domain/notify";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

/** @mention için tenant içi aktif kullanıcı araması. */
export async function searchMentionUsers(query: string): Promise<Result<{ id: string; name: string; email: string }[]>> {
  try {
    const user = await requireUser();
    const q = query.trim();
    const users = await prisma.user.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 8,
    });
    return ok(users);
  } catch (e) {
    return fail(e);
  }
}

const postSchema = z.object({
  entityType: z.enum(["PurchaseOrder", "TechnicalReview"]).default("PurchaseOrder"),
  entityId: z.string(),
  body: z.string().min(1, "Mesaj boş olamaz."),
  isInternal: z.boolean().optional().default(false),
  parentId: z.string().optional(),
  mentionedUserIds: z.array(z.string()).optional().default([]),
});

/**
 * Bir varlığın (PO veya TechnicalReview) tartışmasına yorum/yanıt ekler.
 * Erişim daima bağlı PO üzerinden assertPoAccess ile doğrulanır.
 */
export async function postComment(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.PO_WORKSPACE_COMMENT);
    const data = postSchema.parse(input);

    // Erişim çıpası: her iki durumda da bağlı satınalma siparişi
    let po: { id: string; tenantId: string; supplierId: string; number: string } | null = null;
    if (data.entityType === "PurchaseOrder") {
      po = await prisma.purchaseOrder.findFirst({ where: { id: data.entityId, tenantId: user.tenantId }, select: { id: true, tenantId: true, supplierId: true, number: true } });
    } else {
      const tr = await prisma.technicalReview.findFirst({ where: { id: data.entityId, tenantId: user.tenantId }, select: { orderId: true } });
      if (tr) po = await prisma.purchaseOrder.findFirst({ where: { id: tr.orderId, tenantId: user.tenantId }, select: { id: true, tenantId: true, supplierId: true, number: true } });
    }
    if (!po) throw new NotFoundError("Kayıt bulunamadı.");
    assertPoAccess(po, user); // tedarikçi yalnız kendi PO'suna yazabilir
    const linkTab = data.entityType === "TechnicalReview" ? "teknik-incelemeler" : "discussion";

    // İç not YALNIZ izinliyse; aksi halde tedarikçiye açık nota düşürülür (sızma önleme)
    const isInternal = !!data.isInternal && userCan(user, PERMISSIONS.PO_INTERNAL_COMMENT);

    if (data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: data.parentId, entityType: data.entityType, entityId: data.entityId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundError("Yanıtlanan mesaj bulunamadı.");
    }

    const validMentions = data.mentionedUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: data.mentionedUserIds }, tenantId: user.tenantId, isActive: true },
          select: { id: true },
        })
      : [];

    const poId = po.id;
    const poNumber = po.number;
    const poSupplierId = po.supplierId;
    const mentionedIds = validMentions.map((m) => m.id);
    const link = { linkInternal: `/orders/${poId}?tab=${linkTab}`, linkPortal: `/portal/orders/${poId}?tab=${linkTab}` };

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          tenantId: user.tenantId,
          entityType: data.entityType,
          entityId: data.entityId,
          userId: user.id,
          body: data.body,
          isInternal,
          parentId: data.parentId ?? null,
        },
      });
      if (validMentions.length) {
        await tx.commentMention.createMany({ data: validMentions.map((m) => ({ commentId: c.id, mentionedUserId: m.id })) });
      }
      // Yazar çalışma alanı katılımcısı olur (bildirim yönlendirmesi için)
      await ensureParticipant(user.tenantId, poId, user.id, user.supplierId ? "SUPPLIER" : "INTERNAL", tx);
      // Yazarın kendi mesajı → thread'i okunmuş say
      const read = await tx.threadRead.findFirst({ where: { userId: user.id, entityType: data.entityType, entityId: data.entityId } });
      if (read) await tx.threadRead.update({ where: { id: read.id }, data: { lastReadAt: new Date() } });
      else await tx.threadRead.create({ data: { userId: user.id, entityType: data.entityType, entityId: data.entityId, lastReadAt: new Date() } });

      // Bildirimler: (1) mention'lananlar (2) diğer katılımcılar. İç notta tedarikçiler hariç.
      const bodyPreview = c.body.slice(0, 140);
      await notify({ tenantId: user.tenantId, actorId: user.id, targetUserIds: mentionedIds, type: "MENTION", titleKey: "notif.mention.title", params: { actor: user.name, order: poNumber }, bodyText: bodyPreview, excludeSuppliers: isInternal, ...link }, tx);
      const allTargets = await resolvePoTargets(poId, poSupplierId, user.tenantId, tx);
      const others = allTargets.filter((id) => !mentionedIds.includes(id));
      await notify({ tenantId: user.tenantId, actorId: user.id, targetUserIds: others, type: "PO_COMMENT", titleKey: "notif.comment.title", params: { actor: user.name, order: poNumber }, bodyText: bodyPreview, excludeSuppliers: isInternal, ...link }, tx);
      return c;
    });

    revalidatePath(`/orders/${poId}`);
    return ok({ id: comment.id });
  } catch (e) {
    return fail(e);
  }
}

/** Tartışmayı "okundu" işaretler (son-okuma damgası). */
export async function markThreadRead(entityType: string, entityId: string): Promise<Result<null>> {
  try {
    const user = await requireUser();
    const read = await prisma.threadRead.findFirst({ where: { userId: user.id, entityType, entityId } });
    if (read) await prisma.threadRead.update({ where: { id: read.id }, data: { lastReadAt: new Date() } });
    else await prisma.threadRead.create({ data: { userId: user.id, entityType, entityId, lastReadAt: new Date() } });
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
