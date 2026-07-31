/**
 * LME bazlı bakır fiyatlandırma — saf, deterministik, decimal.js (float YOK).
 *
 * Formül:
 *   LME USD/kg      = LME USD/ton / 1000
 *   Metal USD/kg    = LME USD/kg × LME katsayısı
 *   Net birim USD/kg= Metal USD/kg + prim/işçilik USD/kg + ek maliyet USD/kg
 *   Net toplam USD  = Net birim USD/kg × miktar(kg)
 *   Net toplam TL   = Net toplam USD × USD/TRY
 *   KDV             = Net toplam TL × KDV%/100 (net üzerine ayrı)
 *   Genel toplam TL = Net toplam TL + KDV
 *
 * Yuvarlama: LME USD/kg, USD/kg, TL/kg → 4 ondalık; toplamlar → 2 ondalık.
 */
import { d, mul, div, add, toStr, type DecimalInput } from "@/lib/money";

export interface CopperPricingInput {
  usdPerTon: DecimalInput; // LME USD/ton (manuel girilen)
  coefficient?: DecimalInput; // LME katsayısı (varsayılan 1.0000)
  premiumUsdPerKg?: DecimalInput; // Sarcam prim/işçilik
  extraCostUsdPerKg?: DecimalInput; // ek maliyet
  qtyKg?: DecimalInput; // miktar (kg)
  usdTryRate?: DecimalInput; // USD/TRY kuru
  vatRate?: DecimalInput; // KDV yüzdesi (ör. 20)
}

export interface CopperPricingResult {
  lmeUsdPerKg: string; // 4 ondalık
  metalUsdPerKg: string; // 4 ondalık
  unitUsdPerKg: string; // net birim fiyat USD/kg — 4 ondalık
  unitTryPerKg: string; // net birim fiyat TL/kg — 4 ondalık
  netTotalUsd: string; // 2 ondalık
  netTotalTry: string; // 2 ondalık
  vatAmount: string; // 2 ondalık
  grandTotalTry: string; // 2 ondalık
}

/** LME USD/kg = usdPerTon / 1000 (4 ondalık). */
export function lmeUsdPerKg(usdPerTon: DecimalInput): string {
  return toStr(div(usdPerTon, 1000), 4);
}

/** Net birim fiyat USD/kg (tam hassasiyet Decimal döner — ara hesaplarda kullanın). */
function unitUsdPerKgDecimal(i: CopperPricingInput) {
  const perKg = div(i.usdPerTon, 1000);
  const metal = mul(perKg, i.coefficient ?? 1);
  return add(metal, i.premiumUsdPerKg ?? 0, i.extraCostUsdPerKg ?? 0);
}

/** Tam fiyat kırılımı. Toplamlar tam hassasiyetten türetilir (çift yuvarlama yok). */
export function computeCopperPricing(i: CopperPricingInput): CopperPricingResult {
  const perKg = div(i.usdPerTon, 1000);
  const metal = mul(perKg, i.coefficient ?? 1);
  const unit = add(metal, i.premiumUsdPerKg ?? 0, i.extraCostUsdPerKg ?? 0);

  const qty = d(i.qtyKg ?? 0);
  const rate = d(i.usdTryRate ?? 0);
  const netUsd = mul(unit, qty);
  const netTry = mul(netUsd, rate);
  const vat = mul(netTry, div(i.vatRate ?? 0, 100));
  const grand = add(netTry, vat);

  return {
    lmeUsdPerKg: toStr(perKg, 4),
    metalUsdPerKg: toStr(metal, 4),
    unitUsdPerKg: toStr(unit, 4),
    unitTryPerKg: toStr(mul(unit, rate), 4),
    netTotalUsd: toStr(netUsd, 2),
    netTotalTry: toStr(netTry, 2),
    vatAmount: toStr(vat, 2),
    grandTotalTry: toStr(grand, 2),
  };
}

/** Yalnız net birim fiyat USD/kg (4 ondalık) — karşılaştırma/rozet için pratik. */
export function copperUnitUsdPerKg(i: CopperPricingInput): string {
  return toStr(unitUsdPerKgDecimal(i), 4);
}
