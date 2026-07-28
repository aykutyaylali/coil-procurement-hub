import "server-only";
import { prisma } from "@/lib/db";
import { computeOtif, computeApprovalWaiting, computeCycleTimeDays, computeSavings, type MetricResult } from "@/domain/metrics";

export interface OperationalMetrics {
  otif: MetricResult;
  approvalWaiting: MetricResult;
  reqCycleTime: MetricResult;
  savings: MetricResult;
  savingsPct: MetricResult;
}

/**
 * Operasyonel metrikleri gerçek (canlı) veriden hesaplar.
 * Geçmiş içe aktarımda mal kabul/onay zaman damgaları olmadığından
 * ilgili metrikler "veri yetersiz" döner (sufficient=false).
 */
export async function computeOperationalMetrics(tenantId: string): Promise<OperationalMetrics> {
  // OTIF: mal kabul satırları (receivedAt) vs sipariş satırı (neededBy, quantity)
  const grLines = await prisma.goodsReceiptLine.findMany({
    where: { receipt: { order: { tenantId } } },
    select: { acceptedQty: true, receipt: { select: { receivedAt: true } }, orderLine: { select: { neededBy: true, quantity: true } } },
  });
  const otif = computeOtif(
    grLines.map((l) => ({ neededBy: l.orderLine.neededBy, receivedAt: l.receipt.receivedAt, orderedQty: l.orderLine.quantity ?? "0", receivedQty: l.acceptedQty })),
  );

  // Onay bekleme: tamamlanmış onay örnekleri
  const instances = await prisma.approvalInstance.findMany({
    where: { workflow: { tenantId } },
    select: { createdAt: true, completedAt: true },
  });
  const approvalWaiting = computeApprovalWaiting(instances);

  // Talep çevrim süresi: taslak dışı talepler createdAt → updatedAt (sipariş/kapanış)
  const reqs = await prisma.purchaseRequisition.findMany({
    where: { tenantId, status: { in: ["ORDERED", "CLOSED", "IN_RFQ"] } },
    select: { createdAt: true, updatedAt: true },
  });
  const reqCycleTime = computeCycleTimeDays(reqs.map((r) => ({ start: r.createdAt, end: r.updatedAt })));

  // Tasarruf: karara bağlanmış RFQ'larda tahmini (talep satırı) vs award edilen fiyat
  const awards = await prisma.awardDecision.findMany({
    where: { rfq: { tenantId } },
    select: {
      awards: true,
      rfq: {
        select: {
          lines: { select: { id: true, requisitionLine: { select: { estUnitPrice: true } } } },
          bids: { select: { id: true, lines: { select: { rfqLineId: true, unitPrice: true } } } },
        },
      },
    },
  });
  const savingsItems: { baseline: string; actual: string; qty: string }[] = [];
  for (const a of awards) {
    let parsed: { rfqLineId: string; bidId: string; quantity: string }[] = [];
    try { parsed = JSON.parse(a.awards); } catch { parsed = []; }
    for (const w of parsed) {
      const rfqLine = a.rfq.lines.find((l) => l.id === w.rfqLineId);
      const bid = a.rfq.bids.find((b) => b.id === w.bidId);
      const bidLine = bid?.lines.find((bl) => bl.rfqLineId === w.rfqLineId);
      const baseline = rfqLine?.requisitionLine?.estUnitPrice;
      if (baseline && bidLine) savingsItems.push({ baseline, actual: bidLine.unitPrice, qty: w.quantity });
    }
  }
  const { savings, savingsPct } = computeSavings(savingsItems);

  return { otif, approvalWaiting, reqCycleTime, savings, savingsPct };
}
