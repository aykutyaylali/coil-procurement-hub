import "server-only";
import { env } from "@/lib/env";
import { toStr, div, add } from "@/lib/money";
import { mockLmeUsdPerTon } from "./mock";

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

/** LME fiyatını sağlayıcıdan çeker. `now` test için enjekte edilebilir. */
export async function fetchLmePrice(input: LmeFetchInput, now: Date = new Date()): Promise<LmeFetchResult> {
  const provider = env.LME_PROVIDER;
  if (provider === "mock") return fetchMock(input, now);

  // Gerçek sağlayıcı: yapılandırma yoksa anlaşılır hata (UI kullanıcı-dostu gösterir).
  if (!env.LME_API_URL || !env.LME_API_KEY) {
    throw new Error(`LME sağlayıcısı "${provider}" için LME_API_URL ve LME_API_KEY tanımlı değil. Şimdilik manuel giriş yapın veya LME_PROVIDER=mock kullanın.`);
  }
  // Gerçek entegrasyon noktası (ör. Fastmarkets/LME Official). Şimdilik güvenli hata.
  throw new Error(`LME sağlayıcısı "${provider}" entegrasyonu henüz etkin değil.`);
}
