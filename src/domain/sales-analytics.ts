// Satış & CRM analitiği — saf, yan etkisiz agregasyon fonksiyonları (decimal.js).
// FX dönüşümü yapılmaz; parasal büyüklükler para birimi bazında ayrık tutulur.
import { d, add, toStr } from "@/lib/money";

export type OfferRow = {
  status: string; // OPEN | ORDER | CLOSED | REJECTED
  currency: string;
  totalAmount: string;
  salesRepId: string | null;
  customerId: string;
  offerDate: Date | string;
};

export type RfqRow = {
  status: string; // REQUEST | IN_PROCESS | OFFERED | REJECTED | CANCELLED
  customerId: string;
  industry: string | null;
  hasOffer: boolean;
};

export type MoneyByCurrency = Record<string, string>;

/** Satırları para birimine göre toplar. */
export function sumByCurrency(rows: { currency: string; totalAmount: string }[]): MoneyByCurrency {
  const out: MoneyByCurrency = {};
  for (const r of rows) {
    const cur = r.currency || "EUR";
    out[cur] = toStr(add(d(out[cur] ?? "0"), d(r.totalAmount || "0")));
  }
  return out;
}

export type PipelineStage = { key: string; label: string; count: number; amount: MoneyByCurrency };

/**
 * Birleşik huni: RFQ aşamaları (talep/işlemde) sayı odaklı, teklif aşamaları
 * (açık/sipariş) parasal. Genişlik sayıya göre; tutarlar etiket olarak gösterilir.
 */
export function computePipeline(rfqs: RfqRow[], offers: OfferRow[]): PipelineStage[] {
  const activeRfqs = rfqs.filter((r) => r.status !== "CANCELLED" && r.status !== "REJECTED");
  const requestCount = activeRfqs.filter((r) => r.status === "REQUEST").length;
  const inProcessCount = activeRfqs.filter((r) => r.status === "IN_PROCESS").length;
  const open = offers.filter((o) => o.status === "OPEN");
  const order = offers.filter((o) => o.status === "ORDER");
  const closed = offers.filter((o) => o.status === "CLOSED");
  return [
    { key: "REQUEST", label: "Talep", count: requestCount, amount: {} },
    { key: "IN_PROCESS", label: "İşlemde", count: inProcessCount, amount: {} },
    { key: "OPEN", label: "Teklif (Açık)", count: open.length, amount: sumByCurrency(open) },
    { key: "ORDER", label: "Sipariş", count: order.length, amount: sumByCurrency(order) },
    { key: "CLOSED", label: "Kapandı", count: closed.length, amount: sumByCurrency(closed) },
  ];
}

export type Conversion = {
  rfqTotal: number;
  rfqWithOffer: number;
  rfqToOfferRate: number; // %
  offerTotal: number;
  orderCount: number;
  decidedCount: number; // ORDER + CLOSED + REJECTED
  winRate: number; // ORDER / offerTotal, %
  decidedWinRate: number; // ORDER / decided, %
};

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

export function computeConversion(rfqs: RfqRow[], offers: OfferRow[]): Conversion {
  const activeRfqs = rfqs.filter((r) => r.status !== "CANCELLED");
  const rfqTotal = activeRfqs.length;
  const rfqWithOffer = activeRfqs.filter((r) => r.hasOffer || r.status === "OFFERED").length;
  const offerTotal = offers.length;
  const orderCount = offers.filter((o) => o.status === "ORDER").length;
  const decidedCount = offers.filter((o) => o.status === "ORDER" || o.status === "CLOSED" || o.status === "REJECTED").length;
  return {
    rfqTotal, rfqWithOffer, rfqToOfferRate: pct(rfqWithOffer, rfqTotal),
    offerTotal, orderCount, decidedCount,
    winRate: pct(orderCount, offerTotal),
    decidedWinRate: pct(orderCount, decidedCount),
  };
}

export type WinActor = { key: string; offers: number; orders: number; winRate: number; orderAmount: MoneyByCurrency };

/** Bir anahtara (müşteri/sektör) göre kazanma oranına göre ilk N aktör. */
export function topByWinRate(offers: OfferRow[], keyOf: (o: OfferRow) => string | null, limit = 5): WinActor[] {
  const groups = new Map<string, OfferRow[]>();
  for (const o of offers) {
    const k = keyOf(o);
    if (!k) continue;
    const arr = groups.get(k);
    if (arr) arr.push(o);
    else groups.set(k, [o]);
  }
  const actors: WinActor[] = [];
  for (const [key, rows] of groups) {
    const orders = rows.filter((r) => r.status === "ORDER");
    actors.push({ key, offers: rows.length, orders: orders.length, winRate: pct(orders.length, rows.length), orderAmount: sumByCurrency(orders) });
  }
  actors.sort((a, b) => b.winRate - a.winRate || b.orders - a.orders || b.offers - a.offers);
  return actors.slice(0, limit);
}

export type RepPerf = { key: string; openAmount: MoneyByCurrency; orderAmount: MoneyByCurrency; openCount: number; orderCount: number };

/** Satış temsilcisi bazında açık/siparişe dönüşen teklif tutarları. */
export function repBreakdown(offers: OfferRow[]): RepPerf[] {
  const groups = new Map<string, OfferRow[]>();
  for (const o of offers) {
    const k = o.salesRepId ?? "__none__";
    const arr = groups.get(k);
    if (arr) arr.push(o);
    else groups.set(k, [o]);
  }
  const out: RepPerf[] = [];
  for (const [key, rows] of groups) {
    const open = rows.filter((r) => r.status === "OPEN");
    const order = rows.filter((r) => r.status === "ORDER");
    out.push({ key, openAmount: sumByCurrency(open), orderAmount: sumByCurrency(order), openCount: open.length, orderCount: order.length });
  }
  return out;
}

export const monthKey = (dt: Date | string): string => {
  const dd = typeof dt === "string" ? new Date(dt) : dt;
  const y = dd.getUTCFullYear();
  const m = String(dd.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

export type TrendPoint = { month: string; offered: string; ordered: string };

/**
 * Belirli bir para birimi için aylık teklif/sipariş hacim trendi.
 * Ay kovaları verinin kendisinden türetilir; son `monthsBack` ay döner.
 */
export function monthlyTrend(offers: OfferRow[], currency: string, monthsBack = 6): TrendPoint[] {
  const rows = offers.filter((o) => (o.currency || "EUR") === currency);
  const buckets = new Map<string, { offered: string; ordered: string }>();
  for (const o of rows) {
    const k = monthKey(o.offerDate);
    const b = buckets.get(k) ?? { offered: "0", ordered: "0" };
    b.offered = toStr(add(d(b.offered), d(o.totalAmount || "0")));
    if (o.status === "ORDER") b.ordered = toStr(add(d(b.ordered), d(o.totalAmount || "0")));
    buckets.set(k, b);
  }
  const months = Array.from(buckets.keys()).sort();
  const tail = months.slice(-monthsBack);
  return tail.map((m) => ({ month: m, offered: buckets.get(m)!.offered, ordered: buckets.get(m)!.ordered }));
}
