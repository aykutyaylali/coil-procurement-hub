"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requirePermission, assertPoAccess, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { ok, fail, type Result, NotFoundError } from "@/lib/errors";

const ENTITY = "PurchaseOrder";

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
  orderId: z.string(),
  body: z.string().min(1, "Mesaj boş olamaz."),
  isInternal: z.boolean().optional().default(false),
  parentId: z.string().optional(),
  mentionedUserIds: z.array(z.string()).optional().default([]),
});

/** PO tartışmasına yorum/yanıt ekler (thread, mention, isInternal + izolasyon). */
export async function postComment(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.PO_WORKSPACE_COMMENT);
    const data = postSchema.parse(input);

    const po = await prisma.purchaseOrder.findFirst({
      where: { id: data.orderId, tenantId: user.tenantId },
      select: { id: true, tenantId: true, supplierId: true },
    });
    if (!po) throw new NotFoundError("Sipariş bulunamadı.");
    assertPoAccess(po, user); // tedarikçi yalnız kendi PO'suna yazabilir

    // İç not YALNIZ izinliyse; aksi halde tedarikçiye açık nota düşürülür (sızma önleme)
    const isInternal = !!data.isInternal && userCan(user, PERMISSIONS.PO_INTERNAL_COMMENT);

    if (data.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: data.parentId, entityType: ENTITY, entityId: po.id },
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

    const comment = await prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          tenantId: user.tenantId,
          entityType: ENTITY,
          entityId: po.id,
          userId: user.id,
          body: data.body,
          isInternal,
          parentId: data.parentId ?? null,
        },
      });
      if (validMentions.length) {
        await tx.commentMention.createMany({ data: validMentions.map((m) => ({ commentId: c.id, mentionedUserId: m.id })) });
        const targets = validMentions.filter((m) => m.id !== user.id);
        if (targets.length) {
          await tx.notification.createMany({
            data: targets.map((m) => ({
              tenantId: user.tenantId,
              userId: m.id,
              type: "MENTION",
              title: `${user.name} sizi bir siparişte etiketledi`,
              body: data.body.slice(0, 140),
              link: `/orders/${po.id}?tab=discussion`,
            })),
          });
        }
      }
      // Yazarın kendi mesajı → thread'i okunmuş say
      const read = await tx.threadRead.findFirst({ where: { userId: user.id, entityType: ENTITY, entityId: po.id } });
      if (read) await tx.threadRead.update({ where: { id: read.id }, data: { lastReadAt: new Date() } });
      else await tx.threadRead.create({ data: { userId: user.id, entityType: ENTITY, entityId: po.id, lastReadAt: new Date() } });
      return c;
    });

    revalidatePath(`/orders/${po.id}`);
    return ok({ id: comment.id });
  } catch (e) {
    return fail(e);
  }
}

/** Tartışmayı "okundu" işaretler (son-okuma damgası). */
export async function markThreadRead(orderId: string): Promise<Result<null>> {
  try {
    const user = await requireUser();
    const read = await prisma.threadRead.findFirst({ where: { userId: user.id, entityType: ENTITY, entityId: orderId } });
    if (read) await prisma.threadRead.update({ where: { id: read.id }, data: { lastReadAt: new Date() } });
    else await prisma.threadRead.create({ data: { userId: user.id, entityType: ENTITY, entityId: orderId, lastReadAt: new Date() } });
    return ok(null);
  } catch (e) {
    return fail(e);
  }
}
