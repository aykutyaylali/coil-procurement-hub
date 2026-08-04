import "server-only";
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/i18n";
import { renderPdf, type PdfSpec } from "@/lib/pdf/render";
import { renderLabelPdf } from "@/lib/pdf/label";
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

/** Müşteri Teklifi (Sales Offer) PDF — profesyonel TR/EN çıktı. */
export async function buildSalesOfferPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const offer = await prisma.salesOffer.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { customer: true, technicalDetail: true, salesRfq: { select: { number: true } } },
  });
  if (!offer) throw new NotFoundError("Teklif bulunamadı.");

  const [company, rep, lme, notes] = await Promise.all([
    prisma.company.findFirst({ where: { tenantId } }),
    offer.salesRepId ? prisma.user.findUnique({ where: { id: offer.salesRepId }, select: { name: true } }) : Promise.resolve(null),
    offer.technicalDetail?.lmeRecordId ? prisma.lmeRecord.findFirst({ where: { id: offer.technicalDetail.lmeRecordId, tenantId }, select: { priceDate: true, usdPerTon: true } }) : Promise.resolve(null),
    prisma.salesOfferNote.findMany({ where: { offerId: offer.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const t = offer.technicalDetail;
  const dash = "-";
  const statusLabel = ((): string => {
    switch (offer.status) {
      case "OPEN": return tr(locale, "Açık", "Open");
      case "ORDER": return tr(locale, "Siparişe Dönüştü", "Ordered");
      case "CLOSED": return tr(locale, "Kapandı", "Closed");
      case "REJECTED": return tr(locale, "Reddedildi", "Rejected");
      default: return offer.status;
    }
  })();
  const revLabel = offer.revisionNo < 26 ? `Rev ${String.fromCharCode(65 + offer.revisionNo)}` : `Rev ${offer.revisionNo + 1}`;

  const custMeta = [
    `${tr(locale, "Ülke", "Country")}: ${offer.customer.country}`,
    offer.customer.industry ? `${tr(locale, "Sektör", "Industry")}: ${offer.customer.industry}` : null,
    offer.customer.contactName ? `${tr(locale, "İlgili", "Contact")}: ${offer.customer.contactName}` : null,
    offer.customer.contactEmail || null,
  ].filter(Boolean) as string[];

  const techRow = (label: string, value: string | number | null | undefined) => ({ k: label, v: value != null && value !== "" ? String(value) : dash });
  const techRows = [
    techRow(tr(locale, "Üretici (Manufacturer)", "Manufacturer"), t?.manufacturer),
    techRow(tr(locale, "Tip (Type)", "Type"), t?.type),
    techRow(tr(locale, "Güç (Power kW/MW)", "Power (kW/MW)"), t?.power),
    techRow(tr(locale, "Gerilim (Voltage V)", "Voltage (V)"), t?.voltage),
    techRow(tr(locale, "Kutup Sayısı (Pole)", "Number of Pole"), t?.numberOfPole),
    techRow(tr(locale, "Bobin Sayısı (Coils)", "Number of Coils"), t?.numberOfCoils),
    techRow(tr(locale, "Oluk Sayısı (Slot)", "Number of Slot"), t?.numberOfSlot),
    techRow(tr(locale, "Set Sayısı (Set)", "Number of Set"), t?.numberOfSet),
    techRow(tr(locale, "Sarım Sayısı (Turns)", "Number of Turns"), t?.numberOfTurns),
    techRow(tr(locale, "İzolasyon Tipi", "Insulation Type"), t?.insulationType),
    techRow(tr(locale, "Bobin Tipi (Type of Coil)", "Type of Coil"), t?.typeOfCoil?.replace(/_/g, " ")),
    techRow(tr(locale, "Tel Genişliği (Wire W, mm)", "Wire Width (mm)"), t?.wireWidth),
    techRow(tr(locale, "Tel Kalınlığı (Wire T, mm)", "Wire Thickness (mm)"), t?.wireThickness),
  ];

  const sections: NonNullable<PdfSpec["sections"]> = [];
  if (lme) {
    sections.push({
      title: tr(locale, "LME Bakır Maliyet Referansı", "LME Copper Cost Reference"),
      rows: [
        { label: tr(locale, "LME Tarihi", "LME Date"), value: formatDate(lme.priceDate) },
        { label: tr(locale, "LME (USD/ton)", "LME (USD/ton)"), value: lme.usdPerTon },
        { label: tr(locale, "Referans (USD/kg)", "Reference (USD/kg)"), value: toStr(d(lme.usdPerTon).div(1000), 4), strong: true },
      ],
    });
  }
  if (notes.length > 0) {
    sections.push({
      title: tr(locale, "Notlar", "Notes"),
      rows: notes.map((n) => ({ label: n.title || formatDate(n.createdAt), value: n.body })),
    });
  }
  if (offer.reason) {
    sections.push({ title: tr(locale, "Gerekçe / Açıklama", "Reason / Remarks"), rows: [{ label: "", value: offer.reason }] });
  }

  const spec: PdfSpec = {
    locale,
    docTypeLabel: tr(locale, "MÜŞTERİ TEKLİFİ", "SALES OFFER"),
    number: `${offer.number} · ${revLabel}`,
    revision: offer.revisionNo,
    currency: offer.currency,
    company: { name: company?.name ?? "Coil Partners", taxOffice: company?.taxOffice ?? null, taxNumber: company?.taxNumber ?? null, address: null },
    party: { label: tr(locale, "MÜŞTERİ", "CUSTOMER"), name: offer.customer.name, meta: custMeta },
    metaRows: [
      { label: tr(locale, "Teklif Tarihi", "Offer Date"), value: formatDate(offer.offerDate) },
      { label: tr(locale, "Durum", "Status"), value: statusLabel },
      { label: tr(locale, "Satış Temsilcisi", "Sales Rep"), value: rep?.name ?? dash },
      { label: tr(locale, "Geçerlilik Tarihi", "Valid Until"), value: offer.validUntil ? formatDate(offer.validUntil) : dash },
      { label: tr(locale, "Teslim Tarihi", "Delivery Date"), value: offer.deliveryDate ? formatDate(offer.deliveryDate) : dash },
      { label: tr(locale, "Faturalandı", "Invoiced"), value: offer.invoiced ? tr(locale, "Evet", "Yes") : tr(locale, "Hayır", "No") },
      ...(offer.salesRfq ? [{ label: tr(locale, "İlgili Talep", "Related RFQ"), value: offer.salesRfq.number }] : []),
    ],
    columns: [
      { header: tr(locale, "Teknik Parametre", "Technical Parameter"), key: "k", width: 55 },
      { header: tr(locale, "Değer", "Value"), key: "v", width: 45 },
    ],
    rows: techRows,
    totals: [{ label: tr(locale, "Teklif Tutarı", "Offer Amount"), value: formatCurrency(Number(toStr(d(offer.totalAmount || "0"), 2)), offer.currency, locale), bold: true }],
    sections,
    footerNote: tr(locale, "Bu teklif bilgilendirme amaçlıdır ve geçerlilik tarihine kadar geçerlidir.", "This offer is for information purposes and valid until the stated date."),
  };
  return renderPdf(spec);
}

/** İş Emri Barkod Etiketi (Code128) PDF — sahada yazdırılıp bobine yapıştırılır. */
export async function buildWorkOrderLabelPdf(id: string, tenantId: string, locale: L): Promise<Buffer> {
  const wo = await prisma.workOrder.findFirst({ where: { id, tenantId } });
  if (!wo) throw new NotFoundError("İş emri bulunamadı.");
  const company = await prisma.company.findFirst({ where: { tenantId }, select: { name: true } });
  const rows = [
    { label: tr(locale, "Müşteri", "Customer"), value: wo.customerName ?? "-" },
    { label: tr(locale, "Hat", "Line"), value: wo.line ?? "-" },
    { label: tr(locale, "Bobin Tipi", "Coil Type"), value: wo.coilType?.replace(/_/g, " ") ?? "-" },
    { label: tr(locale, "Hedef Adet", "Target Qty"), value: String(wo.targetCoils) },
    { label: tr(locale, "Teslim Tarihi", "Delivery Date"), value: wo.endDate ? formatDate(wo.endDate) : "-" },
    { label: tr(locale, "Durum", "Status"), value: wo.status },
  ];
  return renderLabelPdf({
    locale,
    companyName: company?.name ?? "Coil Partners",
    title: tr(locale, "İŞ EMRİ BARKODU", "WORK ORDER LABEL"),
    number: wo.number,
    barcodeValue: wo.number,
    rows,
    footer: tr(locale, "Üretim Saha Yönetimi", "Shop Floor Control"),
  });
}

export { d };
