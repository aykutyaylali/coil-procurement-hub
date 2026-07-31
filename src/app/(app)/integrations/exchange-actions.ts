"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";
import { refreshExchangeRates } from "@/lib/exchange/service";

/** TCMB'den güncel döviz kurlarını çeker ve kaydeder. */
export async function refreshTcmbRates(): Promise<Result<{ count: number; rateDate: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
    const { count, rateDate } = await refreshExchangeRates(user.tenantId, user.id);
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: "UPDATE", entityType: "ExchangeRate", entityId: "TCMB", after: { count, rateDate: rateDate.toISOString() }, reason: "TCMB kurları güncellendi" });
    revalidatePath("/integrations");
    return ok({ count, rateDate: rateDate.toISOString() });
  } catch (e) {
    return fail(e);
  }
}
