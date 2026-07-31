import Decimal from "decimal.js";

// Kurumsal finansal hassasiyet: 20 anlamlı basamak, banker yuvarlama yok, HALF_UP
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Money / Decimal yardımcıları.
 * Tüm parasal ve miktar hesaplamaları burada yapılır; hiçbir yerde
 * JavaScript `number` ile para aritmetiği YAPILMAZ (floating-point hatası riski).
 * Değerler veritabanında decimal-as-string olarak saklanır.
 */
export type DecimalInput = string | number | Decimal | null | undefined;

export function d(value: DecimalInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (typeof value === "string") {
    let t = value.trim();
    if (t === "") return new Decimal(0);
    // Türkçe ondalık virgülünü noktaya çevir (yalnız nokta yoksa; "1,5" -> "1.5").
    if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
    try {
      return new Decimal(t);
    } catch {
      // Kısmi/geçersiz giriş (ör. "1.", "-", "abc") canlı hesaplamada render'ı ÇÖKERTMEZ:
      // 0 kabul edilir. Sunucuda gerçek doğrulama zod ile ayrıca yapılır.
      return new Decimal(0);
    }
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Türkçe sayı formatını decimal-string'e çevirir: "13.294,80" -> "13294.80",
 * "1.234.567,5" -> "1234567.5", "9,6" -> "9.6", "9600" -> "9600".
 * Kural: hem nokta hem virgül varsa nokta=binlik/virgül=ondalık; yalnız virgül varsa
 * virgül=ondalık; yalnız nokta varsa ondalık kabul edilir (dokunulmaz).
 */
export function parseTrNumber(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "0";
  let t = String(input).trim();
  if (t === "") return "0";
  const hasComma = t.includes(",");
  const hasDot = t.includes(".");
  if (hasComma && hasDot) t = t.replace(/\./g, "").replace(",", ".");
  else if (hasComma) t = t.replace(",", ".");
  return t;
}

export function add(...values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function sub(a: DecimalInput, b: DecimalInput): Decimal {
  return d(a).minus(d(b));
}

export function mul(a: DecimalInput, b: DecimalInput): Decimal {
  return d(a).times(d(b));
}

export function div(a: DecimalInput, b: DecimalInput): Decimal {
  const denom = d(b);
  if (denom.isZero()) throw new Error("Sıfıra bölme hatası");
  return d(a).dividedBy(denom);
}

/** Yüzde uygula: value * (pct/100) */
export function pct(value: DecimalInput, percentage: DecimalInput): Decimal {
  return mul(value, div(percentage, 100));
}

/** Belirli ondalık basamağa yuvarla ve string döndür (DB saklama formatı) */
export function toStr(value: DecimalInput, decimals = 4): string {
  return d(value).toFixed(decimals);
}

/** İki decimal string eşit mi? */
export function eq(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).equals(d(b));
}

export function gt(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).greaterThan(d(b));
}

export function gte(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).greaterThanOrEqualTo(d(b));
}

export function lt(a: DecimalInput, b: DecimalInput): boolean {
  return d(a).lessThan(d(b));
}

/**
 * Satır tutarı hesabı (KDV hariç net):
 * quantity * unitPrice * (1 - discount/100)
 */
export function lineNet(
  quantity: DecimalInput,
  unitPrice: DecimalInput,
  discountPct: DecimalInput = 0,
): Decimal {
  const gross = mul(quantity, unitPrice);
  const discount = pct(gross, discountPct);
  return gross.minus(discount);
}

/** Satır KDV tutarı: net * taxRate/100 */
export function lineTax(net: DecimalInput, taxRate: DecimalInput): Decimal {
  return pct(net, taxRate);
}

/**
 * Tevkifat (withholding) tutarı: KDV üzerinden oran (pay/payda).
 * ratio örn: { numerator: 5, denominator: 10 } => KDV'nin 5/10'u
 */
export function withholding(
  taxAmount: DecimalInput,
  ratio: { numerator: number; denominator: number } | null,
): Decimal {
  if (!ratio || ratio.denominator === 0) return new Decimal(0);
  return mul(taxAmount, div(ratio.numerator, ratio.denominator));
}

/** Döviz çevrimi: amount (from) -> to, verilen kur ile (1 from = rate to DEĞİL; base bazlı) */
export function convert(amount: DecimalInput, rate: DecimalInput): Decimal {
  return mul(amount, rate);
}

/** Görüntüleme için para biçimlendirme (tr-TR / currency) */
export function formatMoney(
  value: DecimalInput,
  currency = "TRY",
  locale = "tr-TR",
): string {
  const num = d(value).toNumber();
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${d(value).toFixed(2)} ${currency}`;
  }
}

/**
 * Miktar / adet görüntüleme: gereksiz küsurat sıfırları temizlenir.
 * Örn "10000.0000" → "10.000", "12.5000" → "12,5" (tr-TR binlik/ondalık).
 */
export function formatQty(value: DecimalInput, locale = "tr-TR", maxFractionDigits = 3): string {
  const num = d(value).toNumber();
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(num);
  } catch {
    return d(value).toDecimalPlaces(maxFractionDigits).toString();
  }
}

/**
 * Tutar görüntüleme; değer 0 (veya boş) ise "fiyatlandırılmamış" anlamında
 * placeholder döner (talep açan fiyat girmez → 0,00 yerine "Belirlenmedi").
 */
export function formatMoneyOrDash(value: DecimalInput, currency = "TRY", placeholder = "Belirlenmedi", locale = "tr-TR"): string {
  if (d(value).isZero()) return placeholder;
  return formatMoney(value, currency, locale);
}

export { Decimal };
