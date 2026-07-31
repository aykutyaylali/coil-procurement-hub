import "server-only";
import { prisma } from "@/lib/db";
import { fetchTcmbRates } from "@/lib/exchange/tcmb";

export const BASE_CURRENCY = "TRY";

/**
 * TCMB'den güncel kurları çeker ve ExchangeRate tablosuna yazar (idempotent).
 * Kaynak: TCMB. 1 <quote> = rate TRY.
 */
export async function refreshExchangeRates(tenantId: string, createdBy?: string): Promise<{ count: number; rateDate: Date }> {
  const { rateDate, rates } = await fetchTcmbRates();
  let count = 0;
  for (const r of rates) {
    await prisma.exchangeRate.upsert({
      where: { tenantId_base_quote_rateDate_source: { tenantId, base: BASE_CURRENCY, quote: r.quote, rateDate, source: "TCMB" } },
      update: { rate: r.rate, createdBy: createdBy ?? null },
      create: { tenantId, base: BASE_CURRENCY, quote: r.quote, rate: r.rate, source: "TCMB", rateDate, createdBy: createdBy ?? null },
    });
    count++;
  }
  return { count, rateDate };
}

/** Her döviz için en güncel TCMB kurunu döndürür. */
export async function getLatestRates(tenantId: string): Promise<{ quote: string; rate: string; rateDate: Date; source: string }[]> {
  const rows = await prisma.exchangeRate.findMany({
    where: { tenantId, base: BASE_CURRENCY },
    orderBy: [{ quote: "asc" }, { rateDate: "desc" }],
    select: { quote: true, rate: true, rateDate: true, source: true },
  });
  const seen = new Set<string>();
  const out: { quote: string; rate: string; rateDate: Date; source: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.quote)) continue;
    seen.add(r.quote);
    out.push(r);
  }
  return out;
}

/**
 * Bugünün kurları yoksa TCMB'den çeker (otomatik tazeleme). Ağ hatasında sessiz
 * geçer; mevcut en güncel kur kullanılmaya devam eder (uygulama çökmez).
 */
export async function ensureFreshRates(tenantId: string): Promise<void> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const latest = await prisma.exchangeRate.findFirst({
    where: { tenantId, base: BASE_CURRENCY, source: "TCMB" },
    orderBy: { rateDate: "desc" },
    select: { rateDate: true },
  });
  const fresh = latest && latest.rateDate >= today;
  if (fresh) return;
  try {
    await refreshExchangeRates(tenantId);
  } catch {
    // Ağ/servis hatası: mevcut kurlarla devam
  }
}
