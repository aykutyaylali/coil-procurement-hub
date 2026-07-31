import "server-only";
import { prisma } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export interface DiscAttachment {
  id: string;
  name: string;
  isImage: boolean;
  url: string | null; // görseller için data-URL; diğerlerinde null
}

export interface DiscComment {
  id: string;
  body: string;
  isInternal: boolean;
  parentId: string | null;
  authorId: string;
  authorName: string;
  createdAt: string;
  mentions: { userId: string; name: string }[];
  attachments: DiscAttachment[];
  replies: DiscComment[];
}

/**
 * PO (veya başka bir varlık) tartışmasını thread ağacı olarak yükler.
 * forSupplier=true ise yalnız isInternal=false yorumlar döner (iç tartışma sızmaz).
 * ERİŞİM izolasyonu çağıran katmanda assertPoAccess ile sağlanır.
 */
export async function loadDiscussion(
  entityType: string,
  entityId: string,
  tenantId: string,
  opts: { forSupplier?: boolean } = {},
): Promise<DiscComment[]> {
  const rows = await prisma.comment.findMany({
    where: { entityType, entityId, ...(opts.forSupplier ? { isInternal: false } : {}) },
    orderBy: { createdAt: "asc" },
    include: { mentions: true },
  });
  if (rows.length === 0) return [];

  const commentIds = rows.map((c) => c.id);
  const userIds = [
    ...new Set([...rows.map((c) => c.userId), ...rows.flatMap((c) => c.mentions.map((m) => m.mentionedUserId))]),
  ];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const atts = await prisma.attachment.findMany({
    where: { tenantId, entityType: "Comment", entityId: { in: commentIds }, scanStatus: { not: "INFECTED" } },
    orderBy: { createdAt: "asc" },
  });
  const storage = getStorage();
  const attByComment = new Map<string, DiscAttachment[]>();
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
    const list = attByComment.get(a.entityId) ?? [];
    list.push({ id: a.id, name: a.fileName, isImage, url });
    attByComment.set(a.entityId, list);
  }

  const toDisc = (c: (typeof rows)[number]): DiscComment => ({
    id: c.id,
    body: c.body,
    isInternal: c.isInternal,
    parentId: c.parentId,
    authorId: c.userId,
    authorName: nameById.get(c.userId) ?? "—",
    createdAt: c.createdAt.toISOString(),
    mentions: c.mentions.map((m) => ({ userId: m.mentionedUserId, name: nameById.get(m.mentionedUserId) ?? "—" })),
    attachments: attByComment.get(c.id) ?? [],
    replies: [],
  });

  const byId = new Map<string, DiscComment>();
  const roots: DiscComment[] = [];
  for (const c of rows) byId.set(c.id, toDisc(c));
  for (const c of rows) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Kullanıcının bu varlıkta okunmamış (kendisi dışındaki) yorum sayısı — sekme rozeti. */
export async function unreadCommentCount(
  entityType: string,
  entityId: string,
  userId: string,
  opts: { forSupplier?: boolean } = {},
): Promise<number> {
  const read = await prisma.threadRead.findFirst({ where: { userId, entityType, entityId } });
  return prisma.comment.count({
    where: {
      entityType,
      entityId,
      userId: { not: userId },
      ...(opts.forSupplier ? { isInternal: false } : {}),
      ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
    },
  });
}
