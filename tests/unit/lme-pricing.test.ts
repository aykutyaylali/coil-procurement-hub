import { describe, it, expect } from "vitest";
import { computeCopperPricing, lmeUsdPerKg, copperUnitUsdPerKg } from "@/domain/lme-pricing";
import { parseTrNumber } from "@/lib/money";

describe("LME bakır fiyatlandırma", () => {
  it("LME USD/kg = USD/ton / 1000 (4 ondalık)", () => {
    expect(lmeUsdPerKg("9000")).toBe("9.0000");
    expect(lmeUsdPerKg("9450.5")).toBe("9.4505");
  });

  it("tam kırılım — bilinen örnek", () => {
    const r = computeCopperPricing({
      usdPerTon: "9000", coefficient: "1.0000", premiumUsdPerKg: "0.5", extraCostUsdPerKg: "0.1",
      qtyKg: "100", usdTryRate: "34.20", vatRate: "20",
    });
    expect(r.lmeUsdPerKg).toBe("9.0000");
    expect(r.unitUsdPerKg).toBe("9.6000"); // 9 + 0.5 + 0.1
    expect(r.unitTryPerKg).toBe("328.3200"); // 9.6 × 34.20
    expect(r.netTotalUsd).toBe("960.00"); // 9.6 × 100
    expect(r.netTotalTry).toBe("32832.00"); // 960 × 34.20
    expect(r.vatAmount).toBe("6566.40"); // 32832 × 0.20
    expect(r.grandTotalTry).toBe("39398.40");
  });

  it("LME katsayısı %98 uygulanır", () => {
    const u = copperUnitUsdPerKg({ usdPerTon: "10000", coefficient: "0.98", premiumUsdPerKg: "0", extraCostUsdPerKg: "0" });
    expect(u).toBe("9.8000"); // 10 × 0.98
  });

  it("float hatası yok (0.1+0.2 tarzı)", () => {
    const u = copperUnitUsdPerKg({ usdPerTon: "1000", premiumUsdPerKg: "0.1", extraCostUsdPerKg: "0.2" });
    expect(u).toBe("1.3000"); // 1.0 + 0.1 + 0.2
  });

  it("Türkçe sayı parse: 13.294,80 → 13294.80", () => {
    expect(parseTrNumber("13.294,80")).toBe("13294.80");
    expect(parseTrNumber("9.450,5")).toBe("9450.5");
    expect(parseTrNumber("9450,5")).toBe("9450.5");
    expect(parseTrNumber("9450.5")).toBe("9450.5");
    expect(parseTrNumber("9600")).toBe("9600");
  });

  it("Türkçe girdiden fiyat hesabı", () => {
    const r = computeCopperPricing({
      usdPerTon: parseTrNumber("9.000,00"), premiumUsdPerKg: parseTrNumber("0,50"),
      qtyKg: parseTrNumber("100"), usdTryRate: parseTrNumber("34,20"), vatRate: "20",
    });
    expect(r.unitUsdPerKg).toBe("9.5000");
    expect(r.netTotalTry).toBe("32490.00"); // 9.5 × 100 × 34.20
    expect(r.grandTotalTry).toBe("38988.00"); // +%20 KDV
  });
});
