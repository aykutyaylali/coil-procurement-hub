import { add, sub, div, mul, d, gte, toStr } from "@/lib/money";

/**
 * Operasyonel performans metrikleri (saf, test edilebilir).
 * Her metrik { value, count, sufficient } döner. Yeterli veri yoksa (count<min)
 * UI "veri yetersiz" gösterir; geçmiş içe aktarımda bu zaman damgaları yoktur.
 */
export interface MetricResult {
  value: string; // yüzde veya gün (string)
  count: number; // hesaba giren kayıt sayısı
  sufficient: boolean;
  unit: "percent" | "days" | "amount";
}

const MIN_SAMPLE = 1;

/** OTIF (On-Time In-Full): zamanında VE tam teslim yüzdesi. */
export function computeOtif(lines: { neededBy: Date | null; receivedAt: Date | null; orderedQty: string; receivedQty: string }[]): MetricResult {
  const eligible = lines.filter((l) => l.neededBy && l.receivedAt);
  if (eligible.length < MIN_SAMPLE) return { value: "0", count: eligible.length, sufficient: false, unit: "percent" };
  let onTimeInFull = 0;
  for (const l of eligible) {
    const onTime = l.receivedAt!.getTime() <= l.neededBy!.getTime();
    const inFull = gte(l.receivedQty, l.orderedQty);
    if (onTime && inFull) onTimeInFull++;
  }
  const pct = mul(div(onTimeInFull, eligible.length), 100);
  return { value: toStr(pct, 1), count: eligible.length, sufficient: true, unit: "percent" };
}

/** Ortalama çevrim süresi (gün): başlangıç → bitiş tarih çiftleri. */
export function computeCycleTimeDays(pairs: { start: Date | null; end: Date | null }[]): MetricResult {
  const valid = pairs.filter((p) => p.start && p.end && p.end!.getTime() >= p.start!.getTime());
  if (valid.length < MIN_SAMPLE) return { value: "0", count: valid.length, sufficient: false, unit: "days" };
  let totalDays = add(0);
  for (const p of valid) {
    const days = (p.end!.getTime() - p.start!.getTime()) / 86_400_000;
    totalDays = add(totalDays, days.toString());
  }
  return { value: toStr(div(totalDays, valid.length), 1), count: valid.length, sufficient: true, unit: "days" };
}

/** Ortalama onay bekleme süresi (gün). */
export function computeApprovalWaiting(instances: { createdAt: Date; completedAt: Date | null }[]): MetricResult {
  return computeCycleTimeDays(instances.map((i) => ({ start: i.createdAt, end: i.completedAt })));
}

/**
 * Tasarruf: tahmini/ilk fiyat vs. nihai (award/sipariş) fiyat farkı toplamı.
 * savings = Σ (baseline - actual). cost avoidance ayrı hesaplanabilir.
 */
export function computeSavings(items: { baseline: string; actual: string; qty: string }[]): { savings: MetricResult; savingsPct: MetricResult } {
  const valid = items.filter((i) => d(i.baseline).greaterThan(0));
  if (valid.length < MIN_SAMPLE) {
    const empty: MetricResult = { value: "0", count: 0, sufficient: false, unit: "amount" };
    return { savings: empty, savingsPct: { ...empty, unit: "percent" } };
  }
  let totalBaseline = add(0), totalActual = add(0), totalSavings = add(0);
  for (const i of valid) {
    const baseTotal = mul(i.baseline, i.qty);
    const actualTotal = mul(i.actual, i.qty);
    totalBaseline = add(totalBaseline, baseTotal);
    totalActual = add(totalActual, actualTotal);
    totalSavings = add(totalSavings, sub(baseTotal, actualTotal));
  }
  const pct = d(totalBaseline).isZero() ? "0" : toStr(mul(div(totalSavings, totalBaseline), 100), 1);
  return {
    savings: { value: toStr(totalSavings, 2), count: valid.length, sufficient: true, unit: "amount" },
    savingsPct: { value: pct, count: valid.length, sufficient: true, unit: "percent" },
  };
}
