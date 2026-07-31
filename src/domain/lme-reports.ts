/**
 * LME / Sarcam bakır alım raporları — saf, decimal.js tabanlı agregasyonlar.
 * Prisma sorguları sayfada; buradaki fonksiyonlar test edilebilir.
 */
import { d, mul, div, toStr } from "@/lib/money";

export interface CopperLineRow {
  orderId: string;
  orderNumber: string;
  supplierName: string;
  orderDate: Date;
  status: string;
  projectCode?: string | null;
  description: string;
  qtyKg: string;
  unitUsdPerKg: string; // net USD/kg (snapshot birim fiyat)
  usdTryRate: string;
  lmeUsdPerTon: string;
  lmeCoefficient: string;
  premiumUsdPerKg: string;
  extraCostUsdPerKg: string;
  lmePriceDate?: Date | null;
}

/** (e) Sarcam toplam satınalma özeti: toplam kg/USD/TL, ort. USD/kg ve TL/kg. */
export function aggregateSarcamSummary(rows: CopperLineRow[]) {
  let totalKg = d(0), totalUsd = d(0), totalTry = d(0);
  for (const r of rows) {
    const kg = d(r.qtyKg);
    totalKg = totalKg.plus(kg);
    totalUsd = totalUsd.plus(mul(r.unitUsdPerKg, kg));
    totalTry = totalTry.plus(mul(mul(r.unitUsdPerKg, kg), r.usdTryRate));
  }
  return {
    lineCount: rows.length,
    totalKg: toStr(totalKg, 3),
    totalUsd: toStr(totalUsd, 2),
    totalTry: toStr(totalTry, 2),
    avgUsdPerKg: totalKg.isZero() ? "0.0000" : toStr(div(totalUsd, totalKg), 4),
    avgTryPerKg: totalKg.isZero() ? "0.0000" : toStr(div(totalTry, totalKg), 4),
  };
}

/** (c) Malzeme bazında ortalama LME (USD/ton), prim (USD/kg), nihai USD/kg ve TL/kg. */
export function aggregateByMaterial(rows: CopperLineRow[]) {
  const byDesc = new Map<string, CopperLineRow[]>();
  for (const r of rows) {
    const arr = byDesc.get(r.description) ?? [];
    arr.push(r);
    byDesc.set(r.description, arr);
  }
  const avgOf = (rs: CopperLineRow[], f: (r: CopperLineRow) => string) => toStr(div(rs.reduce((a, r) => a.plus(d(f(r))), d(0)), rs.length), 4);
  return [...byDesc.entries()]
    .map(([description, rs]) => ({
      description,
      count: rs.length,
      avgLmeUsdTon: toStr(div(rs.reduce((a, r) => a.plus(d(r.lmeUsdPerTon)), d(0)), rs.length), 2),
      avgPremium: avgOf(rs, (r) => r.premiumUsdPerKg),
      avgUsdKg: avgOf(rs, (r) => r.unitUsdPerKg),
      avgTlKg: toStr(div(rs.reduce((a, r) => a.plus(mul(r.unitUsdPerKg, r.usdTryRate)), d(0)), rs.length), 4),
    }))
    .sort((a, b) => b.count - a.count);
}

/** (d) PO bazında LME farkı & bakiye için satır özeti (fatura bakiyesi sayfada eklenir). */
export function aggregateByOrder(rows: CopperLineRow[]) {
  const byOrder = new Map<string, CopperLineRow[]>();
  for (const r of rows) {
    const arr = byOrder.get(r.orderId) ?? [];
    arr.push(r);
    byOrder.set(r.orderId, arr);
  }
  return [...byOrder.entries()].map(([orderId, rs]) => {
    const first = rs[0]!;
    const orderedKg = rs.reduce((a, r) => a.plus(d(r.qtyKg)), d(0));
    const netTry = rs.reduce((a, r) => a.plus(mul(mul(r.unitUsdPerKg, r.qtyKg), r.usdTryRate)), d(0));
    return {
      orderId, orderNumber: first.orderNumber, supplierName: first.supplierName, status: first.status, orderDate: first.orderDate,
      lmeUsdPerTon: first.lmeUsdPerTon, usdTryRate: first.usdTryRate,
      orderedKg: toStr(orderedKg, 3), netTry: toStr(netTry, 2),
    };
  }).sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
}
