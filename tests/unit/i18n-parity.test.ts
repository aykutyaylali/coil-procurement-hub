import { describe, it, expect } from "vitest";
import { tr } from "@/lib/i18n/tr";
import { en } from "@/lib/i18n/en";
import { STATUS_LABELS_TR, STATUS_LABELS_EN, statusLabel } from "@/lib/enums";

/**
 * i18n sözlük paritesi: tr.ts ve en.ts AYNI anahtar kümesine sahip olmalı.
 * (en.ts tipi zaten Record<keyof typeof tr, string> ile derleme-zamanı garanti
 *  verir; bu test çalışma-zamanında da doğrular ve değer kalitesini denetler.)
 */
describe("i18n sözlük paritesi (tr ⇄ en)", () => {
  const trKeys = Object.keys(tr).sort();
  const enKeys = Object.keys(en).sort();

  it("iki sözlük tam olarak aynı anahtarlara sahip", () => {
    const missingInEn = trKeys.filter((k) => !(k in en));
    const missingInTr = enKeys.filter((k) => !(k in tr));
    expect(missingInEn, `en.ts'de eksik: ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInTr, `tr.ts'de eksik: ${missingInTr.join(", ")}`).toEqual([]);
    expect(trKeys).toEqual(enKeys);
  });

  it("hiçbir çeviri değeri boş değil", () => {
    const emptyTr = trKeys.filter((k) => !(tr as Record<string, string>)[k]?.trim());
    const emptyEn = enKeys.filter((k) => !(en as Record<string, string>)[k]?.trim());
    expect(emptyTr, `boş TR değerleri: ${emptyTr.join(", ")}`).toEqual([]);
    expect(emptyEn, `boş EN değerleri: ${emptyEn.join(", ")}`).toEqual([]);
  });

  it("sözlük değerlerinde mojibake (CP1252 çift-kodlama) yok", () => {
    // Bozuk kodlamada tipik olarak görülen karakterler
    const bad = /[ÃÄÅŸŒœŽž�]/;
    const offenders: string[] = [];
    for (const [k, v] of [...Object.entries(tr), ...Object.entries(en)]) {
      if (bad.test(v as string)) offenders.push(`${k}="${v}"`);
    }
    expect(offenders, `mojibake içeren değerler: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("anahtar sayısı beklenen alt sınırın üzerinde (kapsam regresyon koruması)", () => {
    expect(trKeys.length).toBeGreaterThanOrEqual(90);
  });
});

describe("durum etiketleri paritesi (STATUS_LABELS_TR ⇄ STATUS_LABELS_EN)", () => {
  it("TR ve EN durum etiketleri aynı anahtar kümesine sahip", () => {
    expect(Object.keys(STATUS_LABELS_TR).sort()).toEqual(Object.keys(STATUS_LABELS_EN).sort());
  });

  it("statusLabel doğru dilde etiket döndürür (auto-prettify değil)", () => {
    expect(statusLabel("IN_RFQ", "tr")).toBe("Teklifte");
    expect(statusLabel("IN_RFQ", "en")).toBe("In RFQ");
    expect(statusLabel("PENDING_APPROVAL", "en")).toBe("Pending Approval");
  });

  it("hiçbir durum etiketi boş değil", () => {
    for (const [k, v] of Object.entries(STATUS_LABELS_TR)) expect(v?.trim(), `TR ${k}`).toBeTruthy();
    for (const [k, v] of Object.entries(STATUS_LABELS_EN)) expect(v?.trim(), `EN ${k}`).toBeTruthy();
  });
});
