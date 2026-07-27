import { describe, it, expect } from "vitest";
import {
  parseTrDate,
  parseKdv,
  parseNumber,
  mapStatus,
  mapCurrency,
  normalizeSupplier,
  parseKalemRows,
  buildSummary,
  groupByOrder,
} from "@/domain/import/historical";

describe("import - alan ayrıştırma", () => {
  it("Türkçe tarih GG.AA.YYYY", () => {
    const d = parseTrDate("16.07.2026");
    expect(d?.getUTCFullYear()).toBe(2026);
    expect(d?.getUTCMonth()).toBe(6); // Temmuz
    expect(d?.getUTCDate()).toBe(16);
    expect(parseTrDate("")).toBeNull();
    expect(parseTrDate("abc")).toBeNull();
  });

  it("KDV metni sayısal orana", () => {
    expect(parseKdv("%20")).toBe("20.00");
    expect(parseKdv("%1")).toBe("1.00");
    expect(parseKdv(null)).toBeNull();
    expect(parseKdv("")).toBeNull();
  });

  it("sayı ayrıştırma - boş null kalır (0 ile doldurulmaz)", () => {
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(5000)).toBe("5000");
    expect(parseNumber(5.2)).toBe("5.2");
    expect(parseNumber("26.000,00")).toBe("26000"); // Türkçe format
  });

  it("durum eşleme (bilinmeyen SENT + flag)", () => {
    expect(mapStatus("Tamamlandı")).toEqual({ status: "CLOSED", known: true });
    expect(mapStatus("Sipariş Verildi")).toEqual({ status: "SENT", known: true });
    expect(mapStatus("Mal kabul")).toEqual({ status: "RECEIVED", known: true });
    expect(mapStatus("Bilinmeyen")).toEqual({ status: "SENT", known: false });
  });

  it("para birimi eşleme TL->TRY", () => {
    expect(mapCurrency("TL")).toBe("TRY");
    expect(mapCurrency("EUR")).toBe("EUR");
    expect(mapCurrency(null)).toBe("TRY");
  });

  it("tedarikçi normalizasyonu (boşluk/harf farkı birleşir)", () => {
    expect(normalizeSupplier("  ABC   Metal  A.Ş. ")).toBe("abc metal a.ş.");
    expect(normalizeSupplier("ABC METAL A.Ş.")).toBe(normalizeSupplier("abc metal a.ş."));
  });
});

describe("import - satır ayrıştırma ve özet", () => {
  const rows = [
    { "Sipariş No": "SIP0519", Tarih: "16.07.2026", "Tedarikçi": "Pemsan A.Ş.", "Talep Eden": "Uğur Şahin", "Talep No": "TLP0512", Durum: "Sipariş Verildi", Kategori: "Bakır", "Kalem #": 1, "Ürün / Açıklama": "Plastik Sapka", Miktar: 5000, Birim: "ADET", "Birim Fiyat": 5.2, PB: "TL", KDV: "%20", "Kalem Tutarı (PB)": 26000, "Kalem Tutarı (TL)": 26000, Teslimat: "23.07.2026", Not: null },
    { "Sipariş No": "SIP0518", Tarih: "16.07.2026", "Tedarikçi": "Tekcan Ltd.", "Talep Eden": "EMRE KAYA", "Talep No": "TLP0528", Durum: "Sipariş Verildi", Kategori: "Bakır", "Kalem #": 1, "Ürün / Açıklama": "Enamelled", Miktar: 2220, Birim: "KG", "Birim Fiyat": null, PB: "TL", KDV: null, "Kalem Tutarı (PB)": null, "Kalem Tutarı (TL)": null, Teslimat: null, Not: null },
  ];

  it("eksik değerler null kalır ve uyarı üretir", () => {
    const parsed = parseKalemRows(rows);
    expect(parsed[1]!.unitPrice).toBeNull();
    expect(parsed[1]!.taxRate).toBeNull();
    expect(parsed[1]!.historicalTryTotal).toBeNull();
    expect(parsed[1]!.warnings.length).toBeGreaterThan(0);
  });

  it("tarihsel TL ayrı saklanır, kaynak toplam doğru", () => {
    const parsed = parseKalemRows(rows);
    const summary = buildSummary(parsed);
    expect(summary.sourceTotalTry).toBe("26000.00");
    expect(summary.missingPrice).toBe(1);
    expect(summary.missingAmountTL).toBe(1);
  });

  it("siparişler numaraya göre gruplanır", () => {
    const parsed = parseKalemRows(rows);
    const grouped = groupByOrder(parsed);
    expect(grouped.size).toBe(2);
    expect(grouped.get("SIP0519")?.length).toBe(1);
  });
});
