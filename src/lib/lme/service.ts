import "server-only";
import { env } from "@/lib/env";
import { toStr, div, add, mul } from "@/lib/money";
import { mockLmeUsdPerTon } from "./mock";

const LBS_PER_METRIC_TON = "2204.62262"; // 1 metrik ton = 2204.62262 lb (USD/lb → USD/ton)

/**
 * LME bakır fiyatı otomatik çekme servisi.
 *
 * Sağlayıcı `LME_PROVIDER` ile seçilir:
 *  - "mock"        : dış API gerektirmez; tarihe göre DETERMİNİSTİK örnek değer üretir
 *                    (canlıda gerçek sağlayıcı bağlanana kadar test/demo için).
 *  - "fastmarkets" / "lme_api" : gerçek sağlayıcı — LME_API_URL + LME_API_KEY gerekir.
 * Gerçek sağlayıcı entegrasyonu tek noktadan (buradan) eklenir; UI/aksiyon değişmez.
 */

export type LmeKind = "DAILY_SPOT" | "WEEKLY_AVG";

export interface LmeFetchInput {
  kind: LmeKind;
  priceDate: Date; // günlük spot referans günü
  periodStart?: Date | null;
  periodEnd?: Date | null;
}

export interface LmeFetchResult {
  usdPerTon: string; // decimal-as-string
  source: string; // "MOCK LME ... - 2026-07-31 16:00" gibi izlenebilir referans
  fetchedAt: Date;
  provider: string;
}

function fmt(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

async function fetchMock(input: LmeFetchInput, now: Date): Promise<LmeFetchResult> {
  let usdPerTon: string;
  if (input.kind === "WEEKLY_AVG" && input.periodStart && input.periodEnd) {
    // Dönem içindeki günlerin ortalaması (deterministik)
    let sum = add(0);
    let n = 0;
    for (let t = input.periodStart.getTime(); t <= input.periodEnd.getTime(); t += 86_400_000) {
      sum = add(sum, mockLmeUsdPerTon(new Date(t)));
      n++;
    }
    usdPerTon = n > 0 ? toStr(div(sum, n), 2) : toStr(mockLmeUsdPerTon(input.priceDate), 2);
  } else {
    usdPerTon = toStr(mockLmeUsdPerTon(input.priceDate), 2);
  }
  const kindLabel = input.kind === "WEEKLY_AVG" ? "Haftalık Ort." : "Günlük Spot";
  return { usdPerTon, source: `MOCK LME Sağlayıcı (${kindLabel}) — ${fmt(now)}`, fetchedAt: now, provider: "mock" };
}

/**
 * ÜCRETSİZ / ANAHTARSIZ web kaynağı: Yahoo Finance COMEX Bakır (HG=F, USD/lb).
 * LME resmi kapanışları telifli olduğundan, LME ile ~%1-2 içinde hareket eden COMEX
 * bakır fiyatı çekilir ve USD/ton'a çevrilerek "LME eşdeğeri" olarak sunulur (kaynakta
 * açıkça belirtilir). Günlük spot = son kapanış; haftalık = dönem günlerinin ortalaması.
 */
async function fetchWeb(input: LmeFetchInput, now: Date): Promise<LmeFetchResult> {
  const DAY = 86_400; // saniye
  const weekly = input.kind === "WEEKLY_AVG" && !!input.periodStart && !!input.periodEnd;
  // İSTENEN tarih aralığını tam çek (period1/period2) — son 1 aya düşme bug'ı giderilir.
  const p1 = weekly ? Math.floor(input.periodStart!.getTime() / 1000) : Math.floor(input.priceDate.getTime() / 1000) - 8 * DAY;
  const p2 = (weekly ? Math.floor(input.periodEnd!.getTime() / 1000) : Math.floor(input.priceDate.getTime() / 1000)) + DAY; // bitişi dahil et
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/HG=F?period1=${p1}&period2=${p2}&interval=1d`;

  let json: unknown;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CoilProcurementHub/1.0)" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    json = await r.json();
  } catch (e) {
    throw new Error(`Canlı LME/bakır verisi çekilemedi (${String((e as Error).message).slice(0, 60)}). Tekrar deneyin veya değeri manuel girin.`);
  }
  const res = (json as { chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] } })?.chart?.result?.[0];
  const ts = res?.timestamp;
  const close = res?.indicators?.quote?.[0]?.close;
  if (!res || !ts || !close) throw new Error("Bakır fiyat kaynağı beklenmeyen yanıt verdi. Değeri manuel girin.");

  const points = ts.map((t, i) => ({ date: new Date(t * 1000), lb: close[i] })).filter((p): p is { date: Date; lb: number } => typeof p.lb === "number");
  if (points.length === 0) throw new Error("Seçilen dönem için canlı bakır verisi bulunamadı. Tarih/dönemi değiştirin veya değeri manuel girin.");
  const dstr = (dd: Date) => dd.toISOString().slice(0, 10);

  let usdPerLb: number;
  let label: string;
  if (weekly) {
    usdPerLb = points.reduce((s, p) => s + p.lb, 0) / points.length; // dönemin gerçek ortalaması
    label = `Haftalık Ort. (${points.length} işlem günü)`;
  } else {
    const last = points[points.length - 1]!; // döneme en yakın son kapanış
    usdPerLb = last.lb;
    label = `Günlük (${dstr(last.date)})`;
  }

  const adjust = Number.isFinite(env.LME_COMEX_ADJUST) && env.LME_COMEX_ADJUST > 0 ? env.LME_COMEX_ADJUST : 1;
  const usdPerTon = toStr(mul(mul(usdPerLb.toString(), LBS_PER_METRIC_TON), adjust.toString()), 2);
  const adjNote = adjust !== 1 ? ` · LME kal. ×${adjust}` : "";
  return {
    usdPerTon,
    source: `Yahoo Finance · COMEX Bakır HG=F → LME eşdeğeri (USD/ton) · ${label}${adjNote} · ${fmt(now)}`,
    fetchedAt: now,
    provider: "web",
  };
}

/** LME fiyatını sağlayıcıdan çeker. `now` test için enjekte edilebilir. */
export async function fetchLmePrice(input: LmeFetchInput, now: Date = new Date()): Promise<LmeFetchResult> {
  const provider = env.LME_PROVIDER;
  if (provider === "web") return fetchWeb(input, now);
  if (provider === "mock") return fetchMock(input, now);

  // Gerçek LME aboneliği: yapılandırma yoksa anlaşılır hata (UI kullanıcı-dostu gösterir).
  if (!env.LME_API_URL || !env.LME_API_KEY) {
    throw new Error(`LME sağlayıcısı "${provider}" için LME_API_URL ve LME_API_KEY tanımlı değil. Manuel girin veya LME_PROVIDER=web kullanın.`);
  }
  throw new Error(`LME sağlayıcısı "${provider}" entegrasyonu henüz etkin değil.`);
}
