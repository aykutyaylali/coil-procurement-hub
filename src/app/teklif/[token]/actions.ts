"use server";
import { saveBid, saveBidByBuyer, type SaveBidInput } from "@/domain/bidding";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";

export async function submitBidAction(
  input: SaveBidInput,
): Promise<Result<{ bidId: string; total: string; status: string }>> {
  try {
    const res = await saveBid(input);
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}

/**
 * SATINALMA, tedarikçi ADINA teklif girer/düzeltir. Token gerekmez; RFQ_EVALUATE
 * yetkisi gerekir. (E-posta/telefonla gelen teklifleri işleme + tedarikçi hatasını düzeltme.)
 */
export async function submitBidByBuyerAction(
  rfqSupplierId: string,
  input: Omit<SaveBidInput, "token">,
): Promise<Result<{ bidId: string; total: string; status: string }>> {
  try {
    const user = await requirePermission(PERMISSIONS.RFQ_EVALUATE);
    const res = await saveBidByBuyer(rfqSupplierId, user.tenantId, input);
    await writeAudit({ tenantId: user.tenantId, userId: user.id, action: input.submit ? "UPDATE" : "CREATE", entityType: "Bid", entityId: res.bidId, after: { status: res.status, total: res.total }, reason: "Satınalma tedarikçi adına teklif girdi/düzeltti" });
    return ok(res);
  } catch (e) {
    return fail(e);
  }
}
