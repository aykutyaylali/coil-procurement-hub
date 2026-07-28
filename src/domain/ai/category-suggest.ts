/**
 * Kategori önerisi — YEREL, ÜCRETSİZ (API/anahtar gerektirmez).
 *
 * Yaklaşım: yeni kalem açıklamasını, mevcut talep kalemlerinin açıklamalarıyla
 * (kategorisi belli) kelime örtüşmesine göre eşleştirir; en çok örtüşen kategoriyi
 * önerir. Veri biriktikçe (494 sipariş / 1032 kalem geçmişi) isabet artar.
 * İstenirse ileride Claude ile değiştirilebilir (bkz. src/lib/ai/index.ts).
 */

const STOPWORDS = new Set([
  "ve", "ile", "için", "adet", "adet.", "mm", "cm", "gr", "kg", "lt", "mt", "no", "x",
  "the", "and", "for", "of", "-", "/", "+", "(", ")", "'",
]);

export function tokenize(text: string): string[] {
  return (text || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export interface CategorySample {
  categoryId: string;
  description: string;
}
export interface CategoryOption {
  id: string;
  name: string;
}

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  score: number; // 0..1 (yaklaşık güven)
  source: "local";
}

/**
 * Geçmiş kalemlerden (samples) ve kategori adlarından, açıklamaya en uygun
 * kategoriyi önerir. Saf fonksiyon — test edilebilir, ücretsiz, deterministik.
 */
export function suggestCategoryLocal(
  description: string,
  samples: CategorySample[],
  categories: CategoryOption[],
): CategorySuggestion | null {
  const tokens = new Set(tokenize(description));
  if (tokens.size === 0) return null;

  const scoreByCat = new Map<string, number>();
  const bump = (id: string, v: number) => {
    // Büyük kategoriye yanlılık olmasın: kategori başına EN İYİ eşleşmeyi (max) tut
    if (v > (scoreByCat.get(id) ?? 0)) scoreByCat.set(id, v);
  };

  // 1) Geçmiş kalem açıklamalarıyla en yakın komşu (kategori başına max örtüşme)
  for (const s of samples) {
    const st = tokenize(s.description);
    let overlap = 0;
    for (const w of st) if (tokens.has(w)) overlap++;
    if (overlap > 0) bump(s.categoryId, overlap);
  }

  // 2) Kategori adının kendi kelimeleriyle örtüşme (güçlü ağırlık — en belirleyici sinyal)
  for (const c of categories) {
    const ct = tokenize(c.name);
    let overlap = 0;
    for (const w of ct) if (tokens.has(w)) overlap++;
    if (overlap > 0) bump(c.id, (scoreByCat.get(c.id) ?? 0) + overlap * 3);
  }

  if (scoreByCat.size === 0) return null;

  let bestId = "";
  let bestScore = 0;
  let totalScore = 0;
  for (const [id, sc] of scoreByCat) {
    totalScore += sc;
    if (sc > bestScore) { bestScore = sc; bestId = id; }
  }
  const cat = categories.find((c) => c.id === bestId);
  if (!cat) return null;

  return {
    categoryId: bestId,
    categoryName: cat.name,
    score: totalScore > 0 ? Math.min(1, bestScore / totalScore) : 0,
    source: "local",
  };
}
