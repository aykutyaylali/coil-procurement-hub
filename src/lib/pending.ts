import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/context";
import { pendingApprovalsForUser } from "@/domain/approval";

/**
 * Aktif kullanıcının bekleyen onaylarını döndürür. React `cache` ile istek
 * başına TEK sorgu — layout ve sayfa (ör. dashboard) aynı istekte çağırsa bile
 * tek kez çalışır (önceki durumda navigation başına 2× çalışıyordu).
 */
export const getMyPendingApprovals = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  return pendingApprovalsForUser(prisma, user.id, user.roleKeys, user.isSystemAdmin);
});
