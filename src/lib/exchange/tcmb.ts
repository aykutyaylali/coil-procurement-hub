import "server-only";

/**
 * TCMB (Türkiye Cumhuriyet Merkez Bankası) günlük döviz kuru servisi.
 * ÜCRETSİZ, anahtar gerektirmez: https://www.tcmb.gov.tr/kurlar/today.xml
 * Hafta sonu/tatilde today.xml en son iş gününün kurlarını döndürür.
 *
 * Kur anlamı: 1 <quote> = rate TRY (ForexSelling / Unit).
 */
export interface TcmbRate {
  quote: string; // USD, EUR, ...
  rate: string; // 1 quote = rate TRY (decimal-as-string)
}
export interface TcmbResult {
  rateDate: Date;
  rates: TcmbRate[];
}

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
// Sistemde kullanılan başlıca dövizler
const WANTED = ["USD", "EUR", "GBP", "CHF", "JPY", "CNY", "RUB", "SAR", "AED"];

function parseTrDate(s: string | undefined): Date {
  // "27.07.2026"
  if (s) {
    const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }
  return new Date();
}

/** TCMB today.xml çeker ve başlıca dövizlerin TRY karşılığını döndürür. */
export async function fetchTcmbRates(): Promise<TcmbResult> {
  const res = await fetch(TCMB_URL, {
    headers: { "User-Agent": "CoilProcurementHub/1.0 (+exchange-rates)" },
    // Günde bir kez yeterli; Next fetch cache 12 saat
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!res.ok) throw new Error(`TCMB kur servisi yanıt vermedi (HTTP ${res.status}).`);
  const xml = await res.text();

  const dateMatch = xml.match(/Tarih="([^"]+)"/);
  const rateDate = parseTrDate(dateMatch?.[1]);

  const rates: TcmbRate[] = [];
  // Her <Currency ...>...</Currency> bloğunu işle. DİKKAT: "<Currency" ile split
  // etmek "<CurrencyName>" üzerinde de böler; bu yüzden \s ile ayrılan regex kullanılır.
  for (const m of xml.matchAll(/<Currency\s[^>]*Kod="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
    const kod = m[1]!;
    const inner = m[2]!;
    if (!WANTED.includes(kod)) continue;
    const unit = Number(inner.match(/<Unit>(\d+)<\/Unit>/)?.[1] ?? "1") || 1;
    const forexSelling = inner.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1];
    // Bazı dövizlerde ForexSelling boş olabilir; BanknoteSelling'e düş
    const banknoteSelling = inner.match(/<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/)?.[1];
    const raw = forexSelling || banknoteSelling;
    if (!raw) continue;
    const perUnit = Number(raw) / unit; // JPY gibi Unit=100 olanları normalize et
    if (!Number.isFinite(perUnit) || perUnit <= 0) continue;
    rates.push({ quote: kod, rate: perUnit.toFixed(4) });
  }
  return { rateDate, rates };
}
