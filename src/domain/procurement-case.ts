import "server-only";
import { prisma } from "@/lib/db";
import { add, lineNet, lineTax, toStr } from "@/lib/money";

/**
 * SATINALMA DOSYASI (case) — bir talebi merkez alarak tüm süreci tek kayıt altında
 * toplar: talep + kalemler + RFQ'lar + davetli tedarikçiler + teklifler + siparişler
 * + mal kabuller + faturalar + hesaplanan süreç aşaması. Mevcut domain/DB'yi
 * DEĞİŞTİRMEZ; yalnızca ilişkilendirip okur.
 */

export const CASE_STAGES = [
  "REQUEST", // 1 Talep
  "REVIEW", // 2 Satınalma İncelemesi
  "RFQ", // 3 Teklif Talebi
  "AWAITING_BIDS", // 4 Teklifler Bekleniyor
  "EVALUATION", // 5 Teklif Değerlendirme
  "ORDER", // 6 Sipariş
  "DELIVERY", // 7 Teslimat
  "INVOICE", // 8 Fatura
  "DONE", // 9 Tamamlandı
] as const;
export type CaseStage = (typeof CASE_STAGES)[number];

export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  REQUEST: "Talep",
  REVIEW: "Satınalma İncelemesi",
  RFQ: "Teklif Talebi",
  AWAITING_BIDS: "Teklifler Bekleniyor",
  EVALUATION: "Teklif Değerlendirme",
  ORDER: "Sipariş",
  DELIVERY: "Teslimat",
  INVOICE: "Fatura",
  DONE: "Tamamlandı",
};

/** Tedarikçi davet/yanıt durumları — Türkçe (ham enum gösterilmez). */
export function supplierResponseLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: "Gönderilmedi",
    NOT_SENT: "Gönderilmedi",
    INVITED: "Gönderildi",
    VIEWED: "Görüntülendi",
    DRAFTING: "Teklif Hazırlıyor",
    RESPONDED: "Teklif Geldi",
    REVISION_REQUESTED: "Revizyon İstendi",
    REVISED: "Teklif Revize Edildi",
    DECLINED: "Teklif Vermedi",
    NO_BID: "Teklif Vermedi",
    EXPIRED: "Süresi Geçti",
  };
  return map[status] ?? status;
}

/** Teklif (bid) durumları — Türkçe. */
export function bidStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Taslak",
    SUBMITTED: "Teklif Geldi",
    REVISED: "Revize Edildi",
    SHORTLISTED: "Kısa Listede",
    AWARDED: "Karara Bağlandı",
    REJECTED: "Reddedildi",
  };
  return map[status] ?? status;
}

const OPEN_RFQ_STATUSES = ["DRAFT", "SENT", "OPEN", "CLARIFICATION", "EVALUATION", "NEGOTIATION"];

export async function loadProcurementCase(requisitionId: string, tenantId: string) {
  const req = await prisma.purchaseRequisition.findFirst({
    where: { id: requisitionId, tenantId },
    include: {
      requester: { select: { id: true, name: true, email: true } },
      company: { select: { id: true, name: true } },
      department: { select: { name: true } },
      project: { select: { name: true } },
      costCenter: { select: { name: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { category: { select: { name: true } } } },
    },
  });
  if (!req) return null;

  const assignedBuyer = req.assignedBuyerId
    ? await prisma.user.findUnique({ where: { id: req.assignedBuyerId }, select: { id: true, name: true } })
    : null;

  // RFQ'lar: bu talebin kalemlerinden oluşturulanlar
  const rfqs = await prisma.rFQ.findMany({
    where: { tenantId, lines: { some: { requisitionId: req.id } } },
    orderBy: { createdAt: "desc" },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      suppliers: {
        include: {
          supplier: { select: { id: true, legalName: true, code: true } },
          bids: { orderBy: { createdAt: "desc" }, take: 1, include: { lines: true } },
        },
      },
      award: true,
      _count: { select: { bids: true } },
    },
  });
  // Her tedarikçinin teklif toplamını hesapla (bid satır neti + KDV + navlun; bid para biriminde)
  const rfqsView = rfqs.map((r) => {
    const qtyByLine = new Map(r.lines.map((l) => [l.id, l.quantity]));
    return {
      ...r,
      suppliers: r.suppliers.map((s) => {
        const bid = s.bids[0];
        let bidTotal: string | null = null;
        if (bid) {
          let t = add("0");
          for (const bl of bid.lines) {
            if (!bl.willQuote) continue;
            const qty = qtyByLine.get(bl.rfqLineId) ?? "1";
            const net = lineNet(qty, bl.unitPrice, bl.discountPct);
            t = add(t, net, lineTax(net, bl.taxRate));
          }
          t = add(t, bid.freightAmount || "0");
          bidTotal = toStr(t, 2);
        }
        return { ...s, bidTotal, bidCurrency: bid?.currency ?? "TRY" };
      }),
    };
  });

  const rfqIds = rfqs.map((r) => r.id);

  // Siparişler: bu talep numarasından veya bu RFQ'lardan
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      OR: [{ requisitionNumber: req.number }, ...(rfqIds.length ? [{ rfqId: { in: rfqIds } }] : [])],
    },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, legalName: true } },
      lines: { select: { id: true, quantity: true, receivedQty: true } },
      goodsReceipts: { select: { id: true, number: true, status: true, receivedAt: true } },
      invoices: { select: { id: true, number: true, status: true, grandTotal: true, currency: true } },
    },
  });

  // Özet sayılar
  const totalLines = req.lines.length;
  const linesInRfq = req.lines.filter((l) => l.status !== "OPEN").length;
  const respondedSuppliers = rfqsView.flatMap((r) => r.suppliers).filter((s) => s.status === "RESPONDED").length;
  const invitedSuppliers = rfqsView.flatMap((r) => r.suppliers).length;
  const receipts = orders.flatMap((o) => o.goodsReceipts);
  const invoices = orders.flatMap((o) => o.invoices);
  const hasAward = rfqsView.some((r) => r.award);

  const stage = computeStage(req.status, { rfqs: rfqsView, orders, respondedSuppliers, hasAward, receipts, invoices });

  return {
    req,
    assignedBuyer,
    rfqs: rfqsView,
    orders,
    receipts,
    invoices,
    summary: {
      totalLines,
      linesInRfq,
      invitedSuppliers,
      respondedSuppliers,
      rfqCount: rfqs.length,
      orderCount: orders.length,
      receiptCount: receipts.length,
      invoiceCount: invoices.length,
    },
    stage,
    nextAction: computeNextAction(stage, { req, rfqs, respondedSuppliers }),
  };
}

export type ProcurementCase = NonNullable<Awaited<ReturnType<typeof loadProcurementCase>>>;

function computeStage(
  reqStatus: string,
  ctx: { rfqs: { status: string; suppliers: { status: string }[] }[]; orders: { status: string }[]; respondedSuppliers: number; hasAward: boolean; receipts: unknown[]; invoices: unknown[] },
): CaseStage {
  const { rfqs, orders, respondedSuppliers, hasAward, receipts, invoices } = ctx;
  const allOrdersClosed = orders.length > 0 && orders.every((o) => ["CLOSED"].includes(o.status));
  if (allOrdersClosed) return "DONE";
  if (invoices.length > 0) return "INVOICE";
  if (receipts.length > 0) return "DELIVERY";
  if (orders.length > 0 || hasAward) return "ORDER";
  if (respondedSuppliers > 0) return "EVALUATION";
  if (rfqs.some((r) => ["SENT", "OPEN"].includes(r.status))) return "AWAITING_BIDS";
  if (rfqs.length > 0) return "RFQ"; // taslak RFQ var
  if (["APPROVED", "ASSIGNED"].includes(reqStatus)) return "REVIEW";
  return "REQUEST";
}

function computeNextAction(stage: CaseStage, ctx: { req: { status: string; number: string }; rfqs: unknown[]; respondedSuppliers: number }): string {
  switch (stage) {
    case "REQUEST":
      return ctx.req.status === "DRAFT" ? "Talebi onaya/işleme gönderin." : "Talep onayı bekleniyor.";
    case "REVIEW":
      return "Kalemleri seçip teklif talebi (RFQ) oluşturun.";
    case "RFQ":
      return "RFQ'yu tedarikçilere gönderin.";
    case "AWAITING_BIDS":
      return "Tedarikçi yanıtları bekleniyor; hatırlatma gönderebilirsiniz.";
    case "EVALUATION":
      return `${ctx.respondedSuppliers} teklif geldi — inceleyip karşılaştırın ve karar verin.`;
    case "ORDER":
      return "Sipariş oluşturuldu/karar verildi; sipariş onayı/gönderimi yapın.";
    case "DELIVERY":
      return "Teslimat/mal kabul takip edin.";
    case "INVOICE":
      return "Faturaları eşleştirip onaylayın.";
    case "DONE":
      return "Süreç tamamlandı.";
  }
}

/** İş kuyruğu filtreleri — İşlem Merkezi sekmeleri için talep id kümesi mantığı. */
export { OPEN_RFQ_STATUSES };
