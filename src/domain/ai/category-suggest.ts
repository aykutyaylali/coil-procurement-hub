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

/**
 * Yerleşik anahtar-kelime → kategori-adı parçası sözlüğü (domain bilgisi).
 * GEÇMİŞ VERİ OLMASA DA çalışır: yaygın satınalma terimleri, tenant'ın kategori
 * adında geçen parçalarla eşleştirilir (ör. "civata" → adı "hırdavat"/"sarf" geçen
 * kategori). Tenant'ta o kategori yoksa sessizce atlanır (kelime-örtüşmesine düşer).
 */
const KEYWORD_CATEGORY: Record<string, string[]> = {
  // Bağlantı elemanları / hırdavat
  civata: ["hırdavat", "sarf", "bağlantı", "yedek", "mro"], cıvata: ["hırdavat", "sarf", "bağlantı", "yedek", "mro"],
  somun: ["hırdavat", "sarf", "bağlantı", "yedek", "mro"], vida: ["hırdavat", "sarf", "bağlantı", "mro"],
  rondela: ["hırdavat", "sarf", "mro"], saplama: ["hırdavat", "sarf", "mro"], perçin: ["hırdavat", "sarf", "mro"], pul: ["hırdavat", "sarf", "mro"],
  // Bakır / alüminyum / iletken
  bakır: ["bakır", "iletken", "metal"], bakir: ["bakır", "iletken", "metal"], alüminyum: ["alüminyum", "bakır", "metal"], aluminyum: ["alüminyum", "bakır", "metal"],
  tel: ["bakır", "iletken", "tel"], bobin: ["bakır", "iletken"], iletken: ["bakır", "iletken"], bara: ["bakır", "iletken"], kablo: ["kablo", "elektrik", "bakır"],
  // Yalıtım / izolasyon
  yalıtım: ["yalıtım", "izolasyon", "mika"], yalitim: ["yalıtım", "izolasyon", "mika"], izolasyon: ["izolasyon", "yalıtım", "mika"],
  nomex: ["yalıtım", "izolasyon", "mika"], presbant: ["yalıtım", "izolasyon", "mika"], mika: ["mika", "izolasyon", "yalıtım"], reçine: ["yalıtım", "izolasyon"],
  // Elektrik / trafo sacı
  sac: ["elektrik", "sac"], saç: ["elektrik", "sac"], trafo: ["elektrik", "trafo"], nüve: ["elektrik", "sac"], laminasyon: ["elektrik", "sac"], silisyum: ["elektrik", "sac"],
  // Kimyasal / sarf
  yağ: ["sarf", "mro", "kimyasal"], gres: ["sarf", "mro", "kimyasal"], boya: ["sarf", "mro", "kimyasal"], kimyasal: ["kimyasal", "sarf", "mro"], tiner: ["sarf", "mro", "kimyasal"], temizlik: ["sarf", "mro"],
  // Ambalaj
  palet: ["ambalaj"], koli: ["ambalaj"], streç: ["ambalaj"], kutu: ["ambalaj"], ambalaj: ["ambalaj"], şerit: ["ambalaj"],
  // Yedek parça
  rulman: ["yedek", "parça"], kayış: ["yedek", "parça"], kayis: ["yedek", "parça"], motor: ["yedek", "parça"], pompa: ["yedek", "parça"], valf: ["yedek", "parça"], conta: ["yedek", "parça"], filtre: ["yedek", "parça"],
  // Hizmet
  hizmet: ["hizmet"], bakım: ["hizmet"], bakim: ["hizmet"], montaj: ["hizmet"], nakliye: ["hizmet", "lojistik"], danışmanlık: ["hizmet"], kalibrasyon: ["hizmet"],
};

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

  // 3) Yerleşik anahtar-kelime sözlüğü — GEÇMİŞ VERİ GEREKTİRMEZ (domain bilgisi).
  const catNames = categories.map((c) => ({ id: c.id, nm: c.name.toLocaleLowerCase("tr-TR") }));
  for (const w of tokens) {
    const frags = KEYWORD_CATEGORY[w];
    if (!frags) continue;
    for (const c of catNames) {
      if (frags.some((f) => c.nm.includes(f))) bump(c.id, (scoreByCat.get(c.id) ?? 0) + 4);
    }
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
