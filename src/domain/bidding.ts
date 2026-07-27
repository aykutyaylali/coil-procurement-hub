import "server-only";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/ids";
import { add, lineNet, lineTax, toStr } from "@/lib/money";
import { AppError } from "@/lib/errors";

export interface BidContext {
  rfqSupplierId: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  supplierLanguage: string;
  rfqNumber: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isExpired: boolean;
  companyName: string;
  currencyOptions: string[];
  lines: {
    id: string;
    lineNo: number;
    description: string;
    specs: string | null;
    quantity: string;
    uom: string | null;
  }[];
  existingBid: {
    id: string;
    status: string;
    currency: string;
    note: string | null;
    lines: Record<string, { unitPrice: string; discountPct: string; taxRate: string; leadTimeDays: string; brand: string; note: string; willQuote: boolean }>;
  } | null;
}

/** Magic link token'ından teklif bağlamını yükler. Token doğrulanır, VIEWED işaretlenir. */
export async function loadBidContext(token: string): Promise<BidContext> {
  const rfqSupplier = await prisma.rFQSupplier.findFirst({
    where: { tokenHash: hashToken(token) },
    include: {
      supplier: true,
      rfq: {
        include: {
          company: true,
          lines: { orderBy: { lineNo: "asc" } },
        },
      },
      bids: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { lines: true },
      },
    },
  });

  if (!rfqSupplier) {
    throw new AppError("Geçersiz veya kullanılmış bağlantı.", "INVALID_TOKEN", 404);
  }
  if (rfqSupplier.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("Bu teklif bağlantısının süresi dolmuş.", "TOKEN_EXPIRED", 410);
  }

  // İlk görüntülemede işaretle
  if (rfqSupplier.status === "INVITED") {
    await prisma.rFQSupplier.update({
      where: { id: rfqSupplier.id },
      data: { status: "VIEWED", viewedAt: new Date() },
    });
  }

  const rfq = rfqSupplier.rfq;
  const dueExpired = rfq.dueAt ? rfq.dueAt.getTime() < Date.now() : false;

  let currencyOptions: string[] = ["TRY"];
  try {
    currencyOptions = JSON.parse(rfq.currencyOptions);
  } catch {
    /* varsayılan */
  }

  const existingBid = rfqSupplier.bids[0]
    ? {
        id: rfqSupplier.bids[0].id,
        status: rfqSupplier.bids[0].status,
        currency: rfqSupplier.bids[0].currency,
        note: rfqSupplier.bids[0].note,
        lines: Object.fromEntries(
          rfqSupplier.bids[0].lines.map((bl) => [
            bl.rfqLineId,
            {
              unitPrice: bl.unitPrice,
              discountPct: bl.discountPct,
              taxRate: bl.taxRate,
              leadTimeDays: bl.leadTimeDays?.toString() ?? "",
              brand: bl.brand ?? "",
              note: bl.note ?? "",
              willQuote: bl.willQuote,
            },
          ]),
        ),
      }
    : null;

  return {
    rfqSupplierId: rfqSupplier.id,
    rfqId: rfq.id,
    supplierId: rfqSupplier.supplierId,
    supplierName: rfqSupplier.supplier.legalName,
    supplierLanguage: rfqSupplier.supplier.preferredLanguage || "tr",
    rfqNumber: rfq.number,
    title: rfq.title,
    description: rfq.description,
    dueAt: rfq.dueAt,
    isExpired: dueExpired,
    companyName: rfq.company.name,
    currencyOptions,
    lines: rfq.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      description: l.description,
      specs: l.specs,
      quantity: l.quantity,
      uom: l.uom,
    })),
    existingBid,
  };
}

export interface SaveBidInput {
  token: string;
  currency: string;
  note?: string;
  validUntil?: string;
  paymentTermDays?: number;
  incoterm?: string;
  freightAmount?: string;
  submit: boolean; // true => resmi gönderim, false => taslak
  lines: {
    rfqLineId: string;
    willQuote: boolean;
    unitPrice: string;
    discountPct: string;
    taxRate: string;
    brand?: string;
    leadTimeDays?: string;
    note?: string;
  }[];
}

/** Teklifi kaydeder/gönderir. Fiyat hesapları backend'de doğrulanır. */
export async function saveBid(input: SaveBidInput): Promise<{ bidId: string; total: string; status: string }> {
  const rfqSupplier = await prisma.rFQSupplier.findFirst({
    where: { tokenHash: hashToken(input.token) },
    include: { rfq: true },
  });
  if (!rfqSupplier) throw new AppError("Geçersiz bağlantı.", "INVALID_TOKEN", 404);
  if (rfqSupplier.tokenExpiresAt.getTime() < Date.now()) {
    throw new AppError("Bağlantı süresi dolmuş.", "TOKEN_EXPIRED", 410);
  }
  // Son teklif tarihi geçtiyse yalnızca görüntüleme (geç teklif ayrı izinle)
  if (input.submit && rfqSupplier.rfq.dueAt && rfqSupplier.rfq.dueAt.getTime() < Date.now()) {
    throw new AppError("Son teklif tarihi geçti; teklif gönderilemez.", "DEADLINE_PASSED", 409);
  }

  const round = rfqSupplier.rfq.round;

  // Toplam hesabı (backend doğrulaması)
  let total = add(0);
  for (const l of input.lines) {
    if (!l.willQuote) continue;
    const net = lineNet("1", l.unitPrice, l.discountPct); // birim bazlı gösterim; gerçek miktar RFQ satırından
    const withTax = add(net, lineTax(net, l.taxRate));
    total = add(total, withTax);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Mevcut taslak/teklif bul
    let bid = await tx.bid.findFirst({
      where: { rfqSupplierId: rfqSupplier.id, round },
      orderBy: { createdAt: "desc" },
    });

    if (bid && bid.status === "SUBMITTED" && input.submit) {
      // Yeni revizyon: eski sürümü koru
      const snapshot = await tx.bidLine.findMany({ where: { bidId: bid.id } });
      await tx.bidRevision.create({
        data: { bidId: bid.id, round, snapshot: JSON.stringify(snapshot) },
      });
    }

    if (!bid) {
      bid = await tx.bid.create({
        data: {
          rfqId: rfqSupplier.rfqId,
          rfqSupplierId: rfqSupplier.id,
          supplierId: rfqSupplier.supplierId,
          round,
          status: input.submit ? "SUBMITTED" : "DRAFT",
          currency: input.currency,
          note: input.note ?? null,
          paymentTermDays: input.paymentTermDays ?? null,
          incoterm: input.incoterm ?? null,
          freightAmount: input.freightAmount ?? "0",
          submittedAt: input.submit ? new Date() : null,
        },
      });
    } else {
      await tx.bid.update({
        where: { id: bid.id },
        data: {
          status: input.submit ? (bid.status === "SUBMITTED" ? "REVISED" : "SUBMITTED") : "DRAFT",
          currency: input.currency,
          note: input.note ?? null,
          paymentTermDays: input.paymentTermDays ?? null,
          incoterm: input.incoterm ?? null,
          freightAmount: input.freightAmount ?? "0",
          submittedAt: input.submit ? new Date() : bid.submittedAt,
        },
      });
    }

    // Satırları yeniden yaz
    await tx.bidLine.deleteMany({ where: { bidId: bid.id } });
    await tx.bidLine.createMany({
      data: input.lines.map((l) => ({
        bidId: bid!.id,
        rfqLineId: l.rfqLineId,
        willQuote: l.willQuote,
        unitPrice: toStr(l.unitPrice, 4),
        discountPct: toStr(l.discountPct, 4),
        taxRate: toStr(l.taxRate, 4),
        brand: l.brand ?? null,
        leadTimeDays: l.leadTimeDays ? parseInt(l.leadTimeDays, 10) : null,
        note: l.note ?? null,
      })),
    });

    if (input.submit) {
      await tx.rFQSupplier.update({
        where: { id: rfqSupplier.id },
        data: { status: "RESPONDED", respondedAt: new Date() },
      });
      // Satınalma uzmanına bildirim
      const rfq = await tx.rFQ.findUnique({ where: { id: rfqSupplier.rfqId } });
      if (rfq) {
        await tx.notification.create({
          data: {
            tenantId: rfq.tenantId,
            userId: rfq.createdById,
            type: "BID_RECEIVED",
            title: `Yeni teklif alındı: ${rfq.number}`,
            body: `Bir tedarikçi ${rfq.number} için teklif gönderdi.`,
            link: `/rfqs/${rfq.id}`,
          },
        });
      }
    }

    return { bidId: bid.id, status: bid.status };
  });

  return { bidId: result.bidId, total: toStr(total, 2), status: result.status };
}
