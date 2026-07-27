import { describe, it, expect } from "vitest";
import { tr } from "@/lib/i18n/tr";
import { en } from "@/lib/i18n/en";
import { t, localeCompare, localeIncludes, formatCurrency } from "@/lib/i18n";
import { opLabel } from "@/domain/operations";

describe("i18n - eksik çeviri anahtarı kontrolü", () => {
  it("tr ve en aynı anahtar kümesine sahip olmalı", () => {
    const trKeys = Object.keys(tr).sort();
    const enKeys = Object.keys(en).sort();
    const missingInEn = trKeys.filter((k) => !(k in en));
    const missingInTr = enKeys.filter((k) => !(k in tr));
    expect(missingInEn, `EN'de eksik: ${missingInEn.join(", ")}`).toEqual([]);
    expect(missingInTr, `TR'de eksik: ${missingInTr.join(", ")}`).toEqual([]);
  });

  it("hiçbir çeviri boş olmamalı", () => {
    for (const [k, v] of Object.entries(en)) expect(v, `Boş EN: ${k}`).not.toBe("");
    for (const [k, v] of Object.entries(tr)) expect(v, `Boş TR: ${k}`).not.toBe("");
  });

  it("t() doğru dili döndürür", () => {
    expect(t("nav.dashboard", "tr")).toBe("Kontrol Paneli");
    expect(t("nav.dashboard", "en")).toBe("Dashboard");
  });

  it("operasyon türü etiketleri iki dilli", () => {
    expect(opLabel("IMPORT_PURCHASE", "tr")).toBe("İthalat");
    expect(opLabel("IMPORT_PURCHASE", "en")).toBe("Import");
  });
});

describe("i18n - yerele duyarlı biçimlendirme ve Türkçe sıralama", () => {
  it("Türkçe karakter sıralaması", () => {
    const arr = ["Zeytin", "Çilek", "Şeftali", "Armut", "İncir"];
    const sorted = [...arr].sort((a, b) => localeCompare(a, b, "tr"));
    expect(sorted[0]).toBe("Armut");
    expect(sorted).toContain("Çilek");
  });

  it("Türkçe aksan duyarsız arama", () => {
    expect(localeIncludes("Şeftali Reçeli", "seftali", "tr")).toBe(true);
    expect(localeIncludes("İstanbul", "istanbul", "tr")).toBe(true);
  });

  it("para biçimlendirme yerele göre değişir", () => {
    const trFmt = formatCurrency(1234.5, "TRY", "tr");
    const enFmt = formatCurrency(1234.5, "USD", "en");
    expect(trFmt).toContain("₺");
    expect(enFmt).toContain("$");
  });
});
