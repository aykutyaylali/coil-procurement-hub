import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Türkçe karakter bozulması (mojibake) regresyon testi.
 * Çift-kodlama (CP1252→UTF8) göstergesi karakterleri kod noktasıyla aranır
 * (literal encoding riskini önlemek için charCodeAt kullanılır).
 * Doğru Türkçe kaynak metin bu kod noktalarını içermez.
 */
const ROOT = join(__dirname, "..", "..", "src");

// Mojibake öncü karakterleri: Ã(0xC3) Ä(0xC4) Å(0xC5) + CP1252 artıkları
// 0x2020 (†) = "←" okunun çift-kodlama göstergesi; 0x0090 = CP1252 kontrol artığı.
// (0x00E2 "â" Türkçede meşrudur — ör. "kâğıt" — bu yüzden yasaklanmaz.)
const BAD_CODES = new Set([0x00c3, 0x00c4, 0x00c5, 0x0178, 0x0152, 0x0153, 0x017d, 0x017e, 0x2020, 0x0090]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("kaynak dosyalarda Türkçe karakter bozulması olmamalı", () => {
  const files = walk(ROOT);

  it("hiçbir dosyada mojibake göstergesi bulunmamalı", () => {
    const dirty: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      for (let i = 0; i < content.length; i++) {
        if (BAD_CODES.has(content.charCodeAt(i))) {
          const ctx = content.slice(Math.max(0, i - 10), i + 10).replace(/\n/g, " ");
          dirty.push(`${f.replace(ROOT, "src")} → "...${ctx}..."`);
          break;
        }
      }
    }
    expect(dirty, `Mojibake içeren dosyalar:\n${dirty.join("\n")}`).toEqual([]);
  });

  it("taranan dosya sayısı makul olmalı", () => {
    expect(files.length).toBeGreaterThan(50);
  });
});
