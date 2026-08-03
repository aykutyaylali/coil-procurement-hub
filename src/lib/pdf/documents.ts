import "server-only";
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/i18n";
import { renderPdf, type PdfSpec } from "@/lib/pdf/render";
import { lineNet, lineTax, add, toStr, d, formatMoney } from "@/lib/money";
import { computeCopperPricing, lmeUsdPerKg } from "@/domain/lme-pricing";
import { NotFoundError } from "@/lib/errors";
import { opLabel } from "@/domain/operations";
import { label as enumLabel } from "@/domain/labels";

type L = Locale;
const tr = (loc: L, t: string, e: string) => (loc === "en" ? e : t);

async function companyBlock(companyId: string) {
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  return {
    name: c?.name ?? "Coil Procurement Hub",
    taxOffice: c?.taxOffice ?? null,
    taxNumber: c?.taxNumber ?? null,
    address: null as string | null,
  };
}

/** Satınalma Siparişi PDF */
export async function buildPurchaseOrderPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: { supplier: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!po) throw new NotFoundError("Sipariş bulunamadı.");

  // Bakır Fiyatlandırma Özeti — LME bazlı satırlar için (TR/EN), snapshot'tan hesaplanır.
  const copperSections = po.lines
    .filter((l) => l.pricingType === "LME_COPPER" && l.lmeUsdPerTon)
    .map((l) => {
      const r = computeCopperPricing({
        usdPerTon: l.lmeUsdPerTon!, coefficient: l.lmeCoefficient ?? "1", premiumUsdPerKg: l.premiumUsdPerKg ?? "0",
        extraCostUsdPerKg: l.extraCostUsdPerKg ?? "0", qtyKg: l.quantity ?? "0", usdTryRate: l.usdTryRate ?? "0", vatRate: l.taxRate ?? "0",
      });
      const period = l.lmePriceDate ? formatDate(l.lmePriceDate) : "-";
      return {
        title: `${tr(locale, "Bakır Fiyatlandırma Özeti", "Copper Pricing Summary")} — ${l.description}`,
        rows: [
          { label: tr(locale, "LME Tarihi/Dönemi", "LME Date/Period"), value: period },
          { label: tr(locale, "LME (USD/ton)", "LME (USD/ton)"), value: l.lmeUsdPerTon! },
          { label: tr(locale, "LME (USD/kg)", "LME (USD/kg)"), value: lmeUsdPerKg(l.lmeUsdPerTon!) },
          { label: tr(locale, "LME Katsayısı", "LME Coefficient"), value: l.lmeCoefficient ?? "1" },
          { label: tr(locale, "İşçilik / Prim (USD/kg)", "Labor / Premium (USD/kg)"), value: l.premiumUsdPerKg ?? "0" },
          { label: tr(locale, "Ek Maliyet (USD/kg)", "Extra Cost (USD/kg)"), value: l.extraCostUsdPerKg ?? "0" },
          { label: tr(locale, "Net Tel Fiyatı (USD/kg)", "Net Wire Price (USD/kg)"), value: r.unitUsdPerKg, strong: true },
          { label: tr(locale, "TCMB USD/TRY Kuru", "USD/TRY Rate"), value: l.usdTryRate ?? "-" },
          { label: tr(locale, "Net Tel Fiyatı (TL/kg)", "Net Wire Price (TL/kg)"), value: r.unitTryPerKg },
          { label: tr(locale, "Toplam Net (TL)", "Net Total (TL)"), value: formatMoney(r.netTotalTry, "TRY") },
          { label: tr(locale, "KDV (TL)", "VAT (TL)"), value: formatMoney(r.vatAmount, "TRY") },
          { label: tr(locale, "Genel Toplam (TL)", "Grand Total (TL)"), value: formatMoney(r.grandTotalTry, "TRY"), strong: true },
        ],
      };
    });

  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "SATINALMA SİPARİŞİ", "PURCHASE ORDER"),
    number: po.number,
    revision: po.revision || undefined,
    currency: po.currency,
    company: await companyBlock(po.companyId),
    party: {
      label: tr(locale, "TEDARİKÇİ", "SUPPLIER"),
      name: po.supplier.legalName,
      meta: [
        po.supplier.taxNumber ? `${tr(locale, "Vergi No", "Tax No")}: ${po.supplier.taxNumber}` : "",
        po.supplier.country ? `${tr(locale, "Ülke", "Country")}: ${po.supplier.country}` : "",
      ].filter(Boolean),
    },
    metaRows: [
      { label: tr(locale, "Sipariş Tarihi", "Order Date"), value: formatDate(po.orderDate) },
      { label: tr(locale, "Para Birimi", "Currency"), value: po.currency },
      { label: tr(locale, "Ödeme Koşulu", "Payment Terms"), value: po.paymentTerms ?? "-" },
      { label: "Incoterm", value: po.incoterm ?? "-" },
      { label: tr(locale, "Operasyon", "Operation"), value: opLabel(po.operationType, locale) },
    ],
    columns: [
      { header: "#", key: "no", width: 4, align: "center" },
      { header: tr(locale, "Açıklama", "Description"), key: "desc", width: 40 },
      { header: tr(locale, "Miktar", "Qty"), key: "qty", width: 10, align: "right" },
      { header: tr(locale, "Birim", "Unit"), key: "uom", width: 8, align: "center" },
      { header: tr(locale, "Birim Fiyat", "Unit Price"), key: "price", width: 13, align: "right", money: true },
      { header: "KDV%", key: "vat", width: 8, align: "right" },
      { header: tr(locale, "Tutar", "Amount"), key: "total", width: 17, align: "right", money: true },
    ],
    rows: po.lines.map((l) => ({
      no: l.lineNo,
      desc: l.description,
      qty: l.quantity ?? "-",
      uom: l.uom ?? "-",
      price: l.unitPrice,
      vat: l.taxRate ?? "-",
      total: l.lineTotal,
    })),
    totals: [
      { label: tr(locale, "Ara Toplam", "Subtotal"), value: formatCurrency(Number(po.subtotal), po.currency, locale) },
      { label: tr(locale, "KDV", "VAT"), value: formatCurrency(Number(po.taxTotal), po.currency, locale) },
      { label: tr(locale, "Genel Toplam", "Grand Total"), value: formatCurrency(Number(po.grandTotal), po.currency, locale), bold: true },
    ],
    sections: copperSections.length ? copperSections : undefined,
    terms: [
      tr(locale, "Sipariş teyidi tedarikçi tarafından yapılmalıdır.", "Order must be acknowledged by the supplier."),
      tr(locale, "Teslimat ve fatura bu sipariş numarası ile ilişkilendirilmelidir.", "Delivery and invoice must reference this order number."),
    ],
  };
  return renderPdf(spec);
}

/** Teklif Talebi (RFQ) PDF */
export async function buildRfqPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const rfq = await prisma.rFQ.findFirst({ where: { id, tenantId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
  if (!rfq) throw new NotFoundError("RFQ bulunamadı.");
  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "TEKLİF TALEBİ", "REQUEST FOR QUOTATION"),
    number: rfq.number,
    currency: "TRY",
    company: await companyBlock(rfq.companyId),
    party: { label: tr(locale, "KONU", "SUBJECT"), name: rfq.title, meta: rfq.description ? [rfq.description] : [] },
    metaRows: [
      { label: tr(locale, "Son Teklif", "Deadline"), value: rfq.dueAt ? formatDate(rfq.dueAt, undefined, "dd.MM.yyyy HH:mm") : "-" },
      { label: "Incoterm", value: rfq.incoterm ?? "-" },
      { label: tr(locale, "Ödeme", "Payment"), value: rfq.paymentTerms ?? "-" },
    ],
    columns: [
      { header: "#", key: "no", width: 5, align: "center" },
      { header: tr(locale, "Açıklama", "Description"), key: "desc", width: 60 },
      { header: tr(locale, "Miktar", "Qty"), key: "qty", width: 20, align: "right" },
      { header: tr(locale, "Birim", "Unit"), key: "uom", width: 15, align: "center" },
    ],
    rows: rfq.lines.map((l) => ({ no: l.lineNo, desc: l.description, qty: l.quantity ?? "-", uom: l.uom ?? "-" })),
    terms: [
      tr(locale, "Lütfen birim fiyat, termin ve ödeme koşullarınızı belirtiniz.", "Please provide unit price, lead time and payment terms."),
      tr(locale, "Teklifler son teklif tarihine kadar geçerlidir.", "Quotations are valid until the deadline."),
    ],
  };
  return renderPdf(spec);
}

/** Teklif Karşılaştırma PDF */
export async function buildComparisonPdf(rfqId: string, tenantId: string, locale: L): Promise<Buffer> {
  const rfq = await prisma.rFQ.findFirst({
    where: { id: rfqId, tenantId },
    include: {
      lines: { orderBy: { lineNo: "asc" } },
      bids: { where: { status: { in: ["SUBMITTED", "REVISED", "AWARDED"] } }, include: { supplier: true, lines: true } },
    },
  });
  if (!rfq) throw new NotFoundError("RFQ bulunamadı.");

  const columns: PdfSpec["columns"] = [{ header: tr(locale, "Kalem", "Item"), key: "desc", width: 30 }];
  rfq.bids.forEach((b, i) => columns.push({ header: b.supplier.legalName.slice(0, 18), key: `b${i}`, width: 20, align: "right" }));

  const rows = rfq.lines.map((line) => {
    const row: Record<string, string> = { desc: line.description };
    rfq.bids.forEach((b, i) => {
      const bl = b.lines.find((x) => x.rfqLineId === line.id && x.willQuote);
      if (!bl) { row[`b${i}`] = "-"; return; }
      const net = lineNet(line.quantity ?? "1", bl.unitPrice, bl.discountPct);
      const total = add(net, lineTax(net, bl.taxRate));
      row[`b${i}`] = formatCurrency(Number(toStr(total, 2)), b.currency, locale);
    });
    return row;
  });

  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "TEKLİF KARŞILAŞTIRMA", "BID COMPARISON"),
    number: rfq.number,
    currency: "TRY",
    company: await companyBlock(rfq.companyId),
    party: { label: tr(locale, "KONU", "SUBJECT"), name: rfq.title },
    metaRows: [{ label: tr(locale, "Tedarikçi Sayısı", "Bidders"), value: String(rfq.bids.length) }],
    columns, rows,
    footerNote: tr(locale, "Gizli – yalnızca dahili kullanım", "Confidential – internal use only"),
  };
  return renderPdf(spec);
}

/** Mal Kabul PDF */
export async function buildGoodsReceiptPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const gr = await prisma.goodsReceipt.findFirst({
    where: { id, order: { tenantId } },
    include: { order: { include: { supplier: true } }, lines: { include: { orderLine: true } }, warehouse: true },
  });
  if (!gr) throw new NotFoundError("Mal kabul bulunamadı.");
  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "MAL KABUL BELGESİ", "GOODS RECEIPT NOTE"),
    number: gr.number,
    currency: gr.order.currency,
    company: await companyBlock(gr.order.companyId),
    party: { label: tr(locale, "TEDARİKÇİ", "SUPPLIER"), name: gr.order.supplier.legalName, meta: [`${tr(locale, "Sipariş", "Order")}: ${gr.order.number}`] },
    metaRows: [
      { label: tr(locale, "İrsaliye No", "Waybill No"), value: gr.waybillNo ?? "-" },
      { label: tr(locale, "Ambar", "Warehouse"), value: gr.warehouse?.name ?? "-" },
      { label: tr(locale, "Tarih", "Date"), value: formatDate(gr.receivedAt) },
    ],
    columns: [
      { header: "#", key: "no", width: 5, align: "center" },
      { header: tr(locale, "Açıklama", "Description"), key: "desc", width: 45 },
      { header: tr(locale, "Kabul", "Accepted"), key: "acc", width: 12, align: "right" },
      { header: tr(locale, "Ret", "Rejected"), key: "rej", width: 12, align: "right" },
      { header: tr(locale, "Durum", "Disposition"), key: "disp", width: 14, align: "center" },
      { header: "Lot", key: "lot", width: 12 },
    ],
    rows: gr.lines.map((l, i) => ({ no: i + 1, desc: l.orderLine.description, acc: l.acceptedQty, rej: l.rejectedQty, disp: enumLabel(l.disposition === "REJECTED" ? "REJECTED_DISP" : l.disposition, locale), lot: l.lotNumber ?? "-" })),
    terms: [tr(locale, "Kalite kontrolü gerektiren kalemler karantinaya alınmıştır.", "Items requiring inspection are placed in quarantine.")],
  };
  return renderPdf(spec);
}

/** Kalite Uygunsuzluk Raporu (NCR) PDF */
export async function buildNcrPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const ncr = await prisma.nonConformance.findFirst({
    where: { id, inspection: { receipt: { order: { tenantId } } } },
    include: { supplier: true, inspection: { include: { receipt: { include: { order: true } } } }, capas: true },
  });
  if (!ncr) throw new NotFoundError("Uygunsuzluk bulunamadı.");
  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "UYGUNSUZLUK RAPORU (NCR)", "NON-CONFORMANCE REPORT"),
    number: ncr.code,
    currency: "TRY",
    company: await companyBlock(ncr.inspection.receipt.order.companyId),
    party: { label: tr(locale, "TEDARİKÇİ", "SUPPLIER"), name: ncr.supplier?.legalName ?? "-", meta: [`${tr(locale, "Sipariş", "Order")}: ${ncr.inspection.receipt.order.number}`] },
    metaRows: [
      { label: tr(locale, "Şiddet", "Severity"), value: enumLabel(ncr.severity, locale) },
      { label: tr(locale, "Durum", "Status"), value: enumLabel(ncr.status, locale) },
      { label: tr(locale, "Hedef Tarih", "Due Date"), value: ncr.dueDate ? formatDate(ncr.dueDate) : "-" },
    ],
    columns: [
      { header: tr(locale, "Alan", "Field"), key: "k", width: 25 },
      { header: tr(locale, "Açıklama", "Detail"), key: "v", width: 75 },
    ],
    rows: [
      { k: tr(locale, "Başlık", "Title"), v: ncr.title ?? "-" },
      { k: tr(locale, "Açıklama", "Description"), v: ncr.description ?? "-" },
      { k: tr(locale, "Kök Neden", "Root Cause"), v: ncr.rootCause ?? "-" },
      { k: tr(locale, "Düzeltici Faaliyet", "Corrective Action"), v: ncr.correctiveAction ?? "-" },
      { k: tr(locale, "Önleyici Faaliyet", "Preventive Action"), v: ncr.preventiveAction ?? "-" },
      { k: tr(locale, "Disposition", "Disposition"), v: ncr.disposition ?? "-" },
      { k: tr(locale, "Maliyet", "Cost"), v: ncr.cost ? formatCurrency(Number(ncr.cost), "TRY", locale) : "-" },
    ],
    footerNote: tr(locale, "Kalite Yönetim Sistemi", "Quality Management System"),
  };
  return renderPdf(spec);
}

/** Tedarikçi Değerlendirme Raporu PDF */
export async function buildSupplierEvalPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const s = await prisma.supplier.findFirst({
    where: { id, tenantId },
    include: { scores: { orderBy: { createdAt: "desc" }, take: 8 }, purchaseOrders: { where: { status: { notIn: ["CANCELLED"] } }, select: { grandTotal: true, currency: true } } },
  });
  if (!s) throw new NotFoundError("Tedarikçi bulunamadı.");
  const totalTry = add(...s.purchaseOrders.filter((p) => p.currency === "TRY").map((p) => p.grandTotal));
  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "TEDARİKÇİ DEĞERLENDİRME", "SUPPLIER EVALUATION"),
    number: s.code,
    currency: "TRY",
    company: await companyBlock((await prisma.company.findFirst({ where: { tenantId } }))!.id),
    party: { label: tr(locale, "TEDARİKÇİ", "SUPPLIER"), name: s.legalName, meta: [`${tr(locale, "Ülke", "Country")}: ${s.country}`, `${tr(locale, "Risk", "Risk")}: ${s.riskLevel}`] },
    metaRows: [
      { label: tr(locale, "Toplam Sipariş (TRY)", "Total Orders (TRY)"), value: formatCurrency(Number(toStr(totalTry, 2)), "TRY", locale) },
      { label: tr(locale, "Sipariş Adedı", "Order Count"), value: String(s.purchaseOrders.length) },
    ],
    columns: [
      { header: tr(locale, "Dönem", "Period"), key: "p", width: 20 },
      { header: tr(locale, "Satınalma", "Purchasing"), key: "ps", width: 20, align: "right" },
      { header: tr(locale, "Kalite", "Quality"), key: "qs", width: 20, align: "right" },
      { header: tr(locale, "Sınıf", "Class"), key: "cl", width: 20, align: "center" },
    ],
    rows: s.scores.map((sc) => ({ p: sc.period, ps: sc.purchasingScore, qs: sc.qualityScore, cl: `${sc.purchasingClass ?? "-"}/${sc.qualityClass ?? "-"}` })),
    footerNote: tr(locale, "Tedarikçi Performans Yönetimi", "Supplier Performance Management"),
  };
  return renderPdf(spec);
}

export { d };
