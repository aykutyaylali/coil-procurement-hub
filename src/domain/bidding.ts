import "server-only";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/ids";
import { add, lineNet, lineTax, toStr } from "@/lib/money";
import { getStorage } from "@/lib/storage";
import { getLatestRates } from "@/lib/exchange/service";
import { AppError } from "@/lib/errors";

/** Tedarikçi Sarcam/Sarkuysan (bakır) mı? — LME panelini otomatik açmak için. */
export function isCopperSupplier(name: string | null | undefined): boolean {
  const n = (name || "").toLocaleLowerCase("tr-TR");
  return n.includes("sarcam") || n.includes("sarçam") || n.includes("sarkuysan");
}

/** Onaylı LME kayıtları + güncel USD/TRY + satır-bazlı malzeme fiyat tipi (RFQ item'ından). */
async function loadCopperContext(rfqLines: { id: string; itemId: string | null }[], tenantId: string) {
  const [lmeRows, rates, items] = await Promise.all([
    prisma.lmeRecord.findMany({ where: { tenantId, status: "APPROVED" }, orderBy: [{ priceDate: "desc" }], take: 60, select: { id: true, priceDate: true, kind: true, periodStart: true, periodEnd: true, usdPerTon: true } }),
    getLatestRates(tenantId),
    prisma.item.findMany({ where: { tenantId, id: { in: rfqLines.map((l) => l.itemId).filter((x): x is string => !!x) } }, select: { id: true, pricingType: true, lmeCoefficient: true, defaultPremiumUsdPerKg: true, defaultExtraCostUsdPerKg: true } }),
  ]);
  const usdTryRate = rates.find((r) => r.quote === "USD")?.rate ?? "";
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  const pricingByLineId = new Map<string, { pricingType: string; lmeCoefficient: string | null; premiumUsdPerKg: string | null; extraCostUsdPerKg: string | null }>();
  for (const l of rfqLines) {
    const it = l.itemId ? itemById.get(l.itemId) : null;
    pricingByLineId.set(l.id, {
      pricingType: it?.pricingType ?? "FIXED",
      lmeCoefficient: it?.lmeCoefficient ?? null,
      premiumUsdPerKg: it?.defaultPremiumUsdPerKg ?? null,
      extraCostUsdPerKg: it?.defaultExtraCostUsdPerKg ?? null,
    });
  }
  const lmeRecords = lmeRows.map((r) => ({ id: r.id, priceDate: r.priceDate, kind: r.kind, periodStart: r.periodStart, periodEnd: r.periodEnd, usdPerTon: r.usdPerTon }));
  return { lmeRecords, usdTryRate, pricingByLineId };
}

export interface LinePhoto {
  id: string;
  url: string; // data: URL (base64) — tedarikçi oturumsuz göründüğü için gömülür
  name: string;
}

/**
 * Kalem görsellerini (talep kalemine veya RFQ kalemine bağlı, tedarikçiye açık
 * = isInternal false) yükler ve rfqLineId bazında data-URL olarak döndürür.
 * Tedarikçi oturumsuz olduğundan görseller sayfaya gömülür.
 */
async function loadLinePhotos(
  rfqLines: { id: string; requisitionLineId: string | null }[],
  tenantId: string,
): Promise<Record<string, LinePhoto[]>> {
  const reqLineIds = rfqLines.map((l) => l.requisitionLineId).filter((x): x is string => !!x);
  const rfqLineIds = rfqLines.map((l) => l.id);
  const or: { entityType: string; entityId: { in: string[] } }[] = [{ entityType: "RFQLine", entityId: { in: rfqLineIds } }];
  if (reqLineIds.length) or.push({ entityType: "RequisitionLine", entityId: { in: reqLineIds } });

  const atts = await prisma.attachment.findMany({
    where: { tenantId, isInternal: false, scanStatus: { not: "INFECTED" }, mimeType: { startsWith: "image/" }, OR: or },
    orderBy: { createdAt: "asc" },
  });
  if (!atts.length) return {};

  const storage = getStorage();
  const byEntity: Record<string, LinePhoto[]> = {};
  for (const a of atts) {
    try {
      const buf = await storage.get(a.storageKey);
      (byEntity[a.entityId] ??= []).push({ id: a.id, url: `data:${a.mimeType};base64,${buf.toString("base64")}`, name: a.fileName });
    } catch {
      /* dosya okunamadıysa atla */
    }
  }

  const result: Record<string, LinePhoto[]> = {};
  for (const l of rfqLines) {
    const photos = [...(byEntity[l.id] ?? []), ...(l.requisitionLineId ? byEntity[l.requisitionLineId] ?? [] : [])];
    if (photos.length) result[l.id] = photos;
  }
  return result;
}

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
  operationType: string; // DOMESTIC_PURCHASE | IMPORT_PURCHASE | EXPORT_RELATED_PURCHASE
  currencyOptions: string[];
  /** Tedarikçinin kayıtlı varsayılan ödeme vadesi (gün); teklif formunda otomatik gelir. */
  supplierPaymentTermDays: number | null;
  // LME bazlı bakır fiyatlandırma bağlamı
  isSarcam: boolean; // tedarikçi Sarcam/Sarkuysan → LME paneli otomatik açılır
  usdTryRate: string; // güncel TCMB USD/TRY (kur alanı otomatik gelir)
  lmeRecords: { id: string; priceDate: Date; kind: string; periodStart: Date | null; periodEnd: Date | null; usdPerTon: string }[];
  lines: {
    id: string;
    lineNo: number;
    description: string;
    specs: string | null;
    quantity: string;
    uom: string | null;
    photos: LinePhoto[];
    // Satır malzemesinin fiyat tipi (LME_COPPER ise panel açılır) + varsayılanlar
    pricingType?: string;
    lmeCoefficient?: string | null;
    premiumUsdPerKg?: string | null;
    extraCostUsdPerKg?: string | null;
  }[];
  existingBid: {
    id: string;
    status: string;
    currency: string;
    note: string | null;
    paymentTermDays: number | null;
    incoterm: string | null;
    lines: Record<string, {
      unitPrice: string; discountPct: string; taxRate: string; leadTimeDays: string; brand: string; note: string; willQuote: boolean; currency: string;
      pricingType?: string | null; lmeRecordId?: string | null; lmeUsdPerTon?: string | null; lmeCoefficient?: string | null; premiumUsdPerKg?: string | null; extraCostUsdPerKg?: string | null; usdTryRate?: string | null;
    }>;
  } | null;
}

/**
 * RFQ para birimi seçenekleri: operasyon türüne göre makul varsayılan set.
 * Yurt içi → TL öncelikli; ithalat/ihracat → döviz öncelikli. RFQ'nun kendi
 * seçenekleri de eklenir. Kalem bazında farklı para birimi seçilebilir.
 */
export function currencyOptionsFor(operationType: string, rfqOptions: string[]): string[] {
  const base = operationType === "DOMESTIC_PURCHASE" ? ["TRY", "USD", "EUR", "GBP"] : ["USD", "EUR", "GBP", "TRY"];
  const merged = [...rfqOptions, ...base].filter((c) => c && c.length === 3);
  return [...new Set(merged)];
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
  const photosByLine = await loadLinePhotos(rfq.lines.map((l) => ({ id: l.id, requisitionLineId: l.requisitionLineId })), rfq.tenantId);

  let currencyOptions: string[] = ["TRY"];
  try {
    currencyOptions = JSON.parse(rfq.currencyOptions);
  } catch {
    /* varsayılan */
  }

  const copper = await loadCopperContext(rfq.lines.map((l) => ({ id: l.id, itemId: l.itemId })), rfq.tenantId);
  const existingBid = rfqSupplier.bids[0]
    ? {
        id: rfqSupplier.bids[0].id,
        status: rfqSupplier.bids[0].status,
        currency: rfqSupplier.bids[0].currency,
        note: rfqSupplier.bids[0].note,
        paymentTermDays: rfqSupplier.bids[0].paymentTermDays,
        incoterm: rfqSupplier.bids[0].incoterm,
        lines: Object.fromEntries(
          rfqSupplier.bids[0].lines.map((bl) => [bl.rfqLineId, existingLine(bl, rfqSupplier.bids[0]!.currency)]),
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
    operationType: rfq.operationType,
    currencyOptions: currencyOptionsFor(rfq.operationType, currencyOptions),
    supplierPaymentTermDays: rfqSupplier.supplier.defaultPaymentTermDays ?? null,
    isSarcam: isCopperSupplier(rfqSupplier.supplier.legalName),
    usdTryRate: copper.usdTryRate,
    lmeRecords: copper.lmeRecords,
    lines: rfq.lines.map((l) => ({
      id: l.id, lineNo: l.lineNo, description: l.description, specs: l.specs, quantity: l.quantity, uom: l.uom,
      photos: photosByLine[l.id] ?? [], ...copper.pricingByLineId.get(l.id),
    })),
    existingBid,
  };
}

/** BidLine → existingBid.lines kaydı (LME snapshot dahil). */
function existingLine(bl: { unitPrice: string; discountPct: string; taxRate: string; leadTimeDays: number | null; brand: string | null; note: string | null; willQuote: boolean; currency: string | null; pricingType?: string | null; lmeRecordId?: string | null; lmeUsdPerTon?: string | null; lmeCoefficient?: string | null; premiumUsdPerKg?: string | null; extraCostUsdPerKg?: string | null; usdTryRate?: string | null }, fallbackCurrency: string) {
  return {
    unitPrice: bl.unitPrice, discountPct: bl.discountPct, taxRate: bl.taxRate,
    leadTimeDays: bl.leadTimeDays?.toString() ?? "", brand: bl.brand ?? "", note: bl.note ?? "",
    willQuote: bl.willQuote, currency: bl.currency ?? fallbackCurrency,
    pricingType: bl.pricingType ?? null, lmeRecordId: bl.lmeRecordId ?? null, lmeUsdPerTon: bl.lmeUsdPerTon ?? null,
    lmeCoefficient: bl.lmeCoefficient ?? null, premiumUsdPerKg: bl.premiumUsdPerKg ?? null,
    extraCostUsdPerKg: bl.extraCostUsdPerKg ?? null, usdTryRate: bl.usdTryRate ?? null,
  };
}

/**
 * Tedarikçi teklif sayfasının ÖNİZLEMESİ için bağlam (token gerektirmez).
 * Satınalma, tedarikçinin göreceği sayfayı kontrol amaçlı görüntüler; hiçbir
 * durum değişmez (VIEWED işaretlenmez) ve teklif gönderilemez.
 */
export async function loadBidContextForPreview(rfqId: string, tenantId: string): Promise<BidContext> {
  const rfq = await prisma.rFQ.findFirst({
    where: { id: rfqId, tenantId },
    include: { company: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!rfq) throw new AppError("RFQ bulunamadı.", "NOT_FOUND", 404);

  let currencyOptions: string[] = ["TRY"];
  try {
    currencyOptions = JSON.parse(rfq.currencyOptions);
  } catch {
    /* varsayılan */
  }

  const photosByLine = await loadLinePhotos(rfq.lines.map((l) => ({ id: l.id, requisitionLineId: l.requisitionLineId })), tenantId);
  const copper = await loadCopperContext(rfq.lines.map((l) => ({ id: l.id, itemId: l.itemId })), tenantId);

  return {
    rfqSupplierId: "preview",
    rfqId: rfq.id,
    supplierId: "preview",
    supplierName: "(Örnek Tedarikçi — Önizleme)",
    supplierLanguage: "tr",
    rfqNumber: rfq.number,
    title: rfq.title,
    description: rfq.description,
    dueAt: rfq.dueAt,
    isExpired: false, // önizlemede form her zaman görünür
    companyName: rfq.company.name,
    operationType: rfq.operationType,
    currencyOptions: currencyOptionsFor(rfq.operationType, currencyOptions),
    supplierPaymentTermDays: null,
    isSarcam: false,
    usdTryRate: copper.usdTryRate,
    lmeRecords: copper.lmeRecords,
    lines: rfq.lines.map((l) => ({
      id: l.id, lineNo: l.lineNo, description: l.description, specs: l.specs, quantity: l.quantity, uom: l.uom,
      photos: photosByLine[l.id] ?? [], ...copper.pricingByLineId.get(l.id),
    })),
    existingBid: null,
  };
}

/**
 * SATINALMA'nın tedarikçi adına teklif girmesi/düzeltmesi için bağlam
 * (rfqSupplierId ile; token gerekmez, durum değişmez). Gerçek tedarikçi bilgisi
 * ve varsa mevcut teklif döner.
 */
export async function loadBidContextForBuyer(rfqSupplierId: string, tenantId: string): Promise<BidContext & { supplierInvitedStatus: string }> {
  const rfqSupplier = await prisma.rFQSupplier.findFirst({
    where: { id: rfqSupplierId, rfq: { tenantId } },
    include: {
      supplier: true,
      rfq: { include: { company: true, lines: { orderBy: { lineNo: "asc" } } } },
      bids: { orderBy: { createdAt: "desc" }, take: 1, include: { lines: true } },
    },
  });
  if (!rfqSupplier) throw new AppError("Davetli tedarikçi bulunamadı.", "NOT_FOUND", 404);
  const rfq = rfqSupplier.rfq;
  const photosByLine = await loadLinePhotos(rfq.lines.map((l) => ({ id: l.id, requisitionLineId: l.requisitionLineId })), tenantId);

  let currencyOptions: string[] = ["TRY"];
  try {
    currencyOptions = JSON.parse(rfq.currencyOptions);
  } catch {
    /* varsayılan */
  }

  const copper = await loadCopperContext(rfq.lines.map((l) => ({ id: l.id, itemId: l.itemId })), tenantId);
  const b = rfqSupplier.bids[0];
  const existingBid = b
    ? {
        id: b.id,
        status: b.status,
        currency: b.currency,
        note: b.note,
        paymentTermDays: b.paymentTermDays,
        incoterm: b.incoterm,
        lines: Object.fromEntries(b.lines.map((bl) => [bl.rfqLineId, existingLine(bl, b.currency)])),
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
    isExpired: false, // satınalma geç teklif de girebilir
    companyName: rfq.company.name,
    operationType: rfq.operationType,
    currencyOptions: currencyOptionsFor(rfq.operationType, currencyOptions),
    supplierPaymentTermDays: rfqSupplier.supplier.defaultPaymentTermDays ?? null,
    isSarcam: isCopperSupplier(rfqSupplier.supplier.legalName),
    usdTryRate: copper.usdTryRate,
    lmeRecords: copper.lmeRecords,
    lines: rfq.lines.map((l) => ({
      id: l.id, lineNo: l.lineNo, description: l.description, specs: l.specs, quantity: l.quantity, uom: l.uom,
      photos: photosByLine[l.id] ?? [], ...copper.pricingByLineId.get(l.id),
    })),
    existingBid,
    supplierInvitedStatus: rfqSupplier.status,
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
    currency?: string;
    // LME bazlı bakır fiyatı snapshot (varsa) — BidLine'a kaydedilir
    pricingType?: string;
    lmeRecordId?: string;
    lmePriceDate?: string;
    lmeUsdPerTon?: string;
    lmeCoefficient?: string;
    premiumUsdPerKg?: string;
    extraCostUsdPerKg?: string;
    usdTryRate?: string;
  }[];
}

type PersistBidInput = Omit<SaveBidInput, "token">;
type RfqSupplierWithRfq = Awaited<ReturnType<typeof prisma.rFQSupplier.findFirst>> extends infer T ? NonNullable<T> & { rfq: NonNullable<Awaited<ReturnType<typeof prisma.rFQ.findFirst>>> } : never;

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
  return persistBid(rfqSupplier as RfqSupplierWithRfq, input, "PORTAL");
}

/**
 * SATINALMA, tedarikçi ADINA teklif girer/düzeltir (e-posta/telefonla gelen
 * teklifleri sisteme işler veya tedarikçinin hatasını düzeltir). Token gerekmez;
 * son teklif tarihi kısıtı uygulanmaz. RFQ_EVALUATE yetkisiyle çağrılır.
 */
export async function saveBidByBuyer(rfqSupplierId: string, tenantId: string, input: PersistBidInput): Promise<{ bidId: string; total: string; status: string }> {
  const rfqSupplier = await prisma.rFQSupplier.findFirst({
    where: { id: rfqSupplierId, rfq: { tenantId } },
    include: { rfq: true },
  });
  if (!rfqSupplier) throw new AppError("Davetli tedarikçi bulunamadı.", "NOT_FOUND", 404);
  return persistBid(rfqSupplier as RfqSupplierWithRfq, input, "MANUAL");
}

async function persistBid(rfqSupplier: RfqSupplierWithRfq, input: PersistBidInput, source: string): Promise<{ bidId: string; total: string; status: string }> {
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
          status: input.submit ? "SUBMITTED" : "DRAFT", source,
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
        currency: l.currency ?? input.currency,
        // LME snapshot (pricingType = LME_COPPER ise dolu)
        pricingType: l.pricingType ?? null,
        lmeRecordId: l.lmeRecordId ?? null,
        lmePriceDate: l.lmePriceDate ? new Date(l.lmePriceDate) : null,
        lmeUsdPerTon: l.lmeUsdPerTon ?? null,
        lmeCoefficient: l.lmeCoefficient ?? null,
        premiumUsdPerKg: l.premiumUsdPerKg ?? null,
        extraCostUsdPerKg: l.extraCostUsdPerKg ?? null,
        usdTryRate: l.usdTryRate ?? null,
      })),
    });

    if (input.submit) {
      await tx.rFQSupplier.update({
        where: { id: rfqSupplier.id },
        data: { status: "RESPONDED", respondedAt: new Date() },
      });
      // Satınalma uzmanına bildirim — doğrudan satınalma DOSYASININ Karşılaştırma sekmesine derin bağlantı
      const rfq = await tx.rFQ.findUnique({ where: { id: rfqSupplier.rfqId } });
      if (rfq) {
        const rl = await tx.rFQLine.findFirst({ where: { rfqId: rfq.id, requisitionId: { not: null } }, select: { requisitionId: true } });
        const link = rl?.requisitionId ? `/islem-merkezi/${rl.requisitionId}?tab=karsilastirma` : `/rfqs/${rfq.id}`;
        await tx.notification.create({
          data: {
            tenantId: rfq.tenantId,
            userId: rfq.createdById,
            type: "BID_RECEIVED",
            title: `Yeni teklif geldi: ${rfq.number}`,
            body: `Bir tedarikçi ${rfq.number} için teklif gönderdi. Karşılaştırıp karar verebilirsiniz.`,
            link,
          },
        });
      }
    }

    return { bidId: bid.id, status: bid.status };
  });

  return { bidId: result.bidId, total: toStr(total, 2), status: result.status };
}
