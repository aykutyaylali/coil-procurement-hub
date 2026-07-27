"use server";
import { saveBid, type SaveBidInput } from "@/domain/bidding";
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
