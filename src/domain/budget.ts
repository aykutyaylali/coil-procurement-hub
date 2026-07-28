import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";
import { add, sub, d, gt, toStr } from "@/lib/money";

/**
 * Bütçe hesaplama ve kontrol motoru.
 * Bütçe durumu, BudgetTransaction hareketlerinden hesaplanır:
 *  RESERVE (talep rezervi), COMMIT (sipariş taahhüdü), INVOICE (faturalanan), PAYMENT (ödenen).
 */
export interface BudgetStatus {
  planned: string;
  reserved: string;
  committed: string;
  invoiced: string;
  paid: string;
  remaining: string; // planned - (reserved + committed + invoiced) ... rezerv+taahhüt bloke eder
  overage: string; // aşım (negatifse 0)
  isOver: boolean;
}

type TxLike = { type: string; amount: string };

export function computeBudgetStatus(planned: string, transactions: TxLike[]): BudgetStatus {
  const sumType = (t: string) => add(...transactions.filter((x) => x.type === t).map((x) => x.amount));
  const reserved = sumType("RESERVE").minus(sumType("RELEASE"));
  const committed = sumType("COMMIT");
  const invoiced = sumType("INVOICE");
  const paid = sumType("PAYMENT");
  // Kullanılan/bloke = rezerv + taahhüt + faturalanan (mükerrer saymadan basit model)
  const used = add(reserved.isNegative() ? "0" : reserved.toString(), committed, invoiced);
  const remaining = sub(planned, used);
  const isOver = remaining.isNegative();
  return {
    planned: toStr(planned, 2),
    reserved: toStr(reserved, 2),
    committed: toStr(committed, 2),
    invoiced: toStr(invoiced, 2),
    paid: toStr(paid, 2),
    remaining: toStr(remaining, 2),
    overage: isOver ? toStr(remaining.abs(), 2) : "0.00",
    isOver,
  };
}

/** Talep/sipariş için uygun aktif bütçeyi bulur (şirket + maliyet merkezi/proje + yıl). */
export async function findMatchingBudget(
  tx: Tx,
  params: { tenantId: string; companyId: string; costCenterId?: string | null; projectId?: string | null; year?: number },
): Promise<{ id: string; plannedAmount: string; currency: string } | null> {
  const year = params.year ?? new Date().getFullYear();
  // Öncelik: proje bütçesi > maliyet merkezi > şirket geneli
  const candidates = await tx.budget.findMany({
    where: {
      tenantId: params.tenantId,
      companyId: params.companyId,
      fiscalYear: year,
      OR: [
        ...(params.projectId ? [{ projectId: params.projectId }] : []),
        ...(params.costCenterId ? [{ costCenterId: params.costCenterId }] : []),
        { projectId: null, costCenterId: null },
      ],
    },
    select: { id: true, plannedAmount: true, currency: true, projectId: true, costCenterId: true },
  });
  if (candidates.length === 0) return null;
  const byProject = candidates.find((c) => params.projectId && c.projectId === params.projectId);
  const byCC = candidates.find((c) => params.costCenterId && c.costCenterId === params.costCenterId);
  const chosen = byProject ?? byCC ?? candidates[0]!;
  return { id: chosen.id, plannedAmount: chosen.plannedAmount, currency: chosen.currency };
}

/**
 * Bütçe rezervasyonu (talep onaya girerken). Uygun bütçe varsa RESERVE hareketi yazar.
 * Dönüş: { budgetId, wouldExceed } — aşım varsa çağıran yapılandırılabilir onaya yönlendirebilir.
 */
export async function reserveBudget(
  tx: Tx,
  params: { tenantId: string; companyId: string; costCenterId?: string | null; projectId?: string | null; amount: string; refType: string; refId: string; note?: string },
): Promise<{ budgetId: string; wouldExceed: boolean; remaining: string } | null> {
  const budget = await findMatchingBudget(tx, params);
  if (!budget) return null;

  // Mevcut hareketler + yeni rezerv ile aşım kontrolü
  const txs = await tx.budgetTransaction.findMany({ where: { budgetId: budget.id }, select: { type: true, amount: true } });
  const status = computeBudgetStatus(budget.plannedAmount, txs);
  const newRemaining = sub(status.remaining, params.amount);
  const wouldExceed = newRemaining.isNegative();

  await tx.budgetTransaction.create({
    data: { budgetId: budget.id, type: "RESERVE", amount: toStr(params.amount, 2), refType: params.refType, refId: params.refId, note: params.note ?? null },
  });

  return { budgetId: budget.id, wouldExceed, remaining: toStr(newRemaining, 2) };
}

/** Rezervi serbest bırak (talep reddedilirse/iptal edilirse). */
export async function releaseBudget(tx: Tx, refType: string, refId: string): Promise<void> {
  const reserves = await tx.budgetTransaction.findMany({ where: { refType, refId, type: "RESERVE" } });
  for (const r of reserves) {
    await tx.budgetTransaction.create({ data: { budgetId: r.budgetId, type: "RELEASE", amount: r.amount, refType, refId, note: "Rezerv iptali" } });
  }
}

export { gt, d };
