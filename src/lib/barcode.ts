/**
 * Code 128 (subset B) barkod kodlayıcı — bağımlılıksız, saf, birim-test edilebilir.
 * İş emri / bobin / rozet barkodlarını (WO-CP7612-001, EMP-101 gibi ASCII değerleri)
 * PDF etiketinde çizilebilecek modül genişliklerine çevirir.
 *
 * Çıktı: dolu-bar ile başlayıp bar/boşluk sırayla giden modül genişliği dizisi.
 * (ilk eleman bar, ikinci boşluk, ...). Toplam modül = 11*(karakter+2) + 13.
 */

// Code 128 desen tablosu (index 0..106). Her değer 6 (stop'ta 7) modülün
// bar/boşluk genişliklerini verir. Endüstri standardı sabit tablo:
// 0..102 = veri sembolleri, 103/104/105 = Start A/B/C, 106 = Stop (13 modül).
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", // 96..102
  "211412", "211214", "211232", // 103 Start A, 104 Start B, 105 Start C
  "2331112", // 106 Stop
];

const START_B = 104;
const STOP = 106;

/** Değer Code 128-B ile kodlanabilir mi? (ASCII 32..126) */
export function isEncodableCode128B(value: string): boolean {
  return value.length > 0 && [...value].every((ch) => {
    const c = ch.charCodeAt(0);
    return c >= 32 && c <= 126;
  });
}

/** Code 128-B sağlama (checksum) değeri: (startB + Σ value_i*i) mod 103. */
export function code128BChecksum(value: string): number {
  let sum = START_B;
  for (let i = 0; i < value.length; i++) {
    sum += (value.charCodeAt(i) - 32) * (i + 1);
  }
  return sum % 103;
}

/**
 * Code 128-B modül dizisi üretir. Dönen dizi: bar,boşluk,bar,... genişlikleri
 * (modül cinsinden). Çizerken tek indeksler boşluk (çizilmez), çift indeksler bar.
 */
export function encodeCode128B(value: string): { modules: number[]; totalModules: number } {
  if (!isEncodableCode128B(value)) {
    throw new Error("Code128-B ile kodlanamayan değer (yalnız ASCII 32..126).");
  }
  const symbols: number[] = [START_B];
  for (const ch of value) symbols.push(ch.charCodeAt(0) - 32);
  symbols.push(code128BChecksum(value));
  symbols.push(STOP);

  const modules: number[] = [];
  for (const sym of symbols) {
    const pattern = CODE128_PATTERNS[sym]!;
    for (const digit of pattern) modules.push(Number(digit));
  }
  const totalModules = modules.reduce((a, b) => a + b, 0);
  return { modules, totalModules };
}

/**
 * Barkodun çizilecek siyah çubuklarını (x, genişlik) listesi olarak döndürür.
 * modules dizisi bar/boşluk sırayla; ilk eleman bardır (çift indeks = bar).
 * @param moduleWidth tek modülün nokta (pt) genişliği
 * @param startX sol başlangıç x
 */
export function code128Bars(value: string, moduleWidth: number, startX = 0): { bars: { x: number; width: number }[]; width: number } {
  const { modules } = encodeCode128B(value);
  const bars: { x: number; width: number }[] = [];
  let x = startX;
  modules.forEach((m, i) => {
    const w = m * moduleWidth;
    if (i % 2 === 0) bars.push({ x, width: w }); // çift indeks = bar (siyah)
    x += w;
  });
  return { bars, width: x - startX };
}
