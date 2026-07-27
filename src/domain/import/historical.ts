import { d, add, toStr } from "@/lib/money";

/**
 * Historical purchasing data import engine (pure parsing + analysis).
 * Source: "Kalem Detaylari" sheet. Rules:
 *  - Order/requisition numbers preserved; lines grouped under order.
 *  - Money/qty decimal-as-string; no floating-point.
 *  - Historical TRY (Kalem Tutari TL) stored separately, not recomputed.
 *  - Empty price/VAT/delivery/amount NOT filled with 0; stored null + data-quality warning.
 *
 * NOTE: Turkish column/sheet/status literals use \u escapes to guarantee exact
 * byte-matching against the source workbook regardless of file encoding.
 */

// "Kalem Detaylari" with Turkish i-dotless
export const KALEM_SHEET = "Kalem Detayları";
// "Siparis Ozeti"
export const OZET_SHEET = "Sipariş Özeti";

// Column names (exact) via escapes where Turkish
const COL = {
  orderNo: "Sipariş No",
  date: "Tarih",
  supplier: "Tedarikçi",
  requester: "Talep Eden",
  reqNo: "Talep No",
  status: "Durum",
  category: "Kategori",
  lineNo: "Kalem #",
  desc: "Ürün / Açıklama",
  qty: "Miktar",
  uom: "Birim",
  unitPrice: "Birim Fiyat",
  currency: "PB",
  kdv: "KDV",
  amountPb: "Kalem Tutarı (PB)",
  amountTl: "Kalem Tutarı (TL)",
  delivery: "Teslimat",
  note: "Not",
} as const;

export const KALEM_COLUMNS = Object.values(COL);

// Turkish source status -> app status (historical/completed; does not trigger workflow)
const STATUS_MAP: Record<string, string> = {
  ["Tamamlandı"]: "CLOSED", // Tamamlandi
  ["Sipariş Verildi"]: "SENT", // Siparis Verildi
  ["Mal kabul"]: "RECEIVED",
  ["Mal Kabul"]: "RECEIVED",
  ["İptal"]: "CANCELLED", // Iptal
  ["İptal Edildi"]: "CANCELLED",
};

export function mapStatus(raw: unknown): { status: string; known: boolean } {
  const key = String(raw ?? "").trim();
  const mapped = STATUS_MAP[key];
  return mapped ? { status: mapped, known: true } : { status: "SENT", known: false };
}

export function mapCurrency(raw: unknown): string {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "TL" || v === "TRY" || v === "₺") return "TRY";
  if (v === "") return "TRY";
  return v; // EUR, USD ...
}

/** "%20" -> "20", "20" -> "20", empty -> null. */
export function parseKdv(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  const m = String(raw).replace("%", "").replace(",", ".").trim();
  if (m === "" || isNaN(Number(m))) return null;
  return toStr(m, 2);
}

/** "16.07.2026" (DD.MM.YYYY) or Date -> UTC Date; invalid -> null. */
export function parseTrDate(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  return null;
}

/** Numeric value to decimal-as-string; empty -> null. Turkish format supported. */
export function parseNumber(raw: unknown): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  if (typeof raw === "number") {
    if (isNaN(raw)) return null;
    return toStr(raw, 6).replace(/\.?0+$/, "") || "0";
  }
  let s = String(raw).trim().replace(/[₺€$\sTL]/gi, "");
  // Turkish: thousands "." decimal "," => normalize
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  if (s === "" || isNaN(Number(s))) return null;
  try {
    return d(s).toString();
  } catch {
    return null;
  }
}

/** Supplier name normalization for matching. Original legal name stored separately. */
export function normalizeSupplier(name: unknown): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("tr");
}

export interface ParsedLine {
  sourceRowNo: number;
  orderNumber: string;
  orderDate: Date | null;
  supplierRaw: string;
  supplierNorm: string;
  requesterName: string | null;
  requisitionNumber: string | null;
  statusRaw: string;
  status: string;
  statusKnown: boolean;
  categoryRaw: string | null;
  lineNo: number;
  description: string;
  quantity: string | null;
  uom: string | null;
  unitPrice: string | null;
  currency: string;
  taxRate: string | null;
  originalLineTotal: string | null;
  historicalTryTotal: string | null;
  neededBy: Date | null;
  note: string | null;
  warnings: string[];
  errors: string[];
}

type Row = Record<string, unknown>;

export function parseKalemRows(rows: Row[]): ParsedLine[] {
  return rows.map((r, i) => {
    const warnings: string[] = [];
    const errors: string[] = [];

    const orderNumber = String(r[COL.orderNo] ?? "").trim();
    if (!orderNumber) errors.push("Siparis No bos");

    const orderDate = parseTrDate(r[COL.date]);
    if (r[COL.date] != null && !orderDate) warnings.push("Tarih ayristirilamadi");

    const supplierRaw = String(r[COL.supplier] ?? "").trim();
    if (!supplierRaw) errors.push("Tedarikci bos");

    const { status, known } = mapStatus(r[COL.status]);
    if (!known && r[COL.status]) warnings.push(`Bilinmeyen durum (SENT olarak alindi)`);

    const quantity = parseNumber(r[COL.qty]);
    const unitPrice = parseNumber(r[COL.unitPrice]);
    if (unitPrice == null) warnings.push("Birim fiyat bos (null)");
    const taxRate = parseKdv(r[COL.kdv]);
    if (taxRate == null) warnings.push("KDV bos (null)");
    const originalLineTotal = parseNumber(r[COL.amountPb]);
    const historicalTryTotal = parseNumber(r[COL.amountTl]);
    if (historicalTryTotal == null) warnings.push("Kalem Tutari TL bos (null)");
    const neededBy = parseTrDate(r[COL.delivery]);
    if (r[COL.delivery] == null) warnings.push("Teslim tarihi bos (null)");

    return {
      sourceRowNo: i + 2, // header is Excel row 1
      orderNumber,
      orderDate,
      supplierRaw,
      supplierNorm: normalizeSupplier(supplierRaw),
      requesterName: r[COL.requester] ? String(r[COL.requester]).trim() : null,
      requisitionNumber: r[COL.reqNo] ? String(r[COL.reqNo]).trim() : null,
      statusRaw: String(r[COL.status] ?? "").trim(),
      status,
      statusKnown: known,
      categoryRaw: r[COL.category] ? String(r[COL.category]).trim() : null,
      lineNo: Number(r[COL.lineNo]) || 1,
      description: String(r[COL.desc] ?? "").trim() || "(aciklama yok)",
      quantity,
      uom: r[COL.uom] ? String(r[COL.uom]).trim() : null,
      unitPrice,
      currency: mapCurrency(r[COL.currency]),
      taxRate,
      originalLineTotal,
      historicalTryTotal,
      neededBy,
      note: r[COL.note] ? String(r[COL.note]).trim() : null,
      warnings,
      errors,
    };
  });
}

export interface ImportSummary {
  totalRows: number;
  totalLines: number;
  totalOrders: number;
  uniqueSuppliers: number;
  uniqueRequesters: number;
  statuses: Record<string, number>;
  currencies: Record<string, number>;
  categories: Record<string, number>;
  missingPrice: number;
  missingKdv: number;
  missingDelivery: number;
  missingAmountTL: number;
  badDate: number;
  errorRows: number;
  sourceTotalTry: string;
  orderLineCounts: Record<string, number>;
}

export function buildSummary(parsed: ParsedLine[]): ImportSummary {
  const statuses: Record<string, number> = {};
  const currencies: Record<string, number> = {};
  const categories: Record<string, number> = {};
  const suppliers = new Set<string>();
  const requesters = new Set<string>();
  const orders = new Set<string>();
  const orderLineCounts: Record<string, number> = {};
  let missingPrice = 0, missingKdv = 0, missingDelivery = 0, missingAmountTL = 0, badDate = 0, errorRows = 0;
  let sum = add(0);

  for (const l of parsed) {
    const st = l.statusRaw || "(bos)";
    statuses[st] = (statuses[st] || 0) + 1;
    currencies[l.currency] = (currencies[l.currency] || 0) + 1;
    if (l.categoryRaw) categories[l.categoryRaw] = (categories[l.categoryRaw] || 0) + 1;
    if (l.supplierNorm) suppliers.add(l.supplierNorm);
    if (l.requesterName) requesters.add(normalizeSupplier(l.requesterName));
    if (l.orderNumber) { orders.add(l.orderNumber); orderLineCounts[l.orderNumber] = (orderLineCounts[l.orderNumber] || 0) + 1; }
    if (l.unitPrice == null) missingPrice++;
    if (l.taxRate == null) missingKdv++;
    if (l.neededBy == null) missingDelivery++;
    if (l.historicalTryTotal == null) missingAmountTL++;
    if (l.warnings.some((w) => w.includes("Tarih"))) badDate++;
    if (l.errors.length > 0) errorRows++;
    if (l.historicalTryTotal != null) sum = add(sum, l.historicalTryTotal);
  }

  return {
    totalRows: parsed.length,
    totalLines: parsed.length,
    totalOrders: orders.size,
    uniqueSuppliers: suppliers.size,
    uniqueRequesters: requesters.size,
    statuses, currencies, categories,
    missingPrice, missingKdv, missingDelivery, missingAmountTL, badDate, errorRows,
    sourceTotalTry: toStr(sum, 2),
    orderLineCounts,
  };
}

/** Order historical TRY total = sum of line historicalTryTotal. */
export function orderTotalTry(lines: ParsedLine[]): string {
  return toStr(add(...lines.map((l) => l.historicalTryTotal ?? "0")), 2);
}

export function groupByOrder(parsed: ParsedLine[]): Map<string, ParsedLine[]> {
  const map = new Map<string, ParsedLine[]>();
  for (const l of parsed) {
    if (!l.orderNumber) continue;
    const arr = map.get(l.orderNumber) ?? [];
    arr.push(l);
    map.set(l.orderNumber, arr);
  }
  return map;
}
