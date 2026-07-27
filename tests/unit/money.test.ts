import { describe, it, expect } from "vitest";
import { add, sub, mul, lineNet, lineTax, withholding, toStr, pct, div } from "@/lib/money";

describe("money - güvenli decimal aritmetiği (floating-point yok)", () => {
  it("0.1 + 0.2 tam 0.30 olmalı", () => {
    expect(toStr(add("0.1", "0.2"), 2)).toBe("0.30");
  });

  it("satır net tutarı: miktar * fiyat * (1 - iskonto)", () => {
    // 500 * 310 = 155000, %10 iskonto => 139500
    expect(toStr(lineNet("500", "310", "10"), 2)).toBe("139500.00");
  });

  it("iskontosuz satır net tutarı", () => {
    expect(toStr(lineNet("500", "310"), 2)).toBe("155000.00");
  });

  it("KDV %20 hesabı", () => {
    expect(toStr(lineTax("155000", "20"), 2)).toBe("31000.00");
  });

  it("tevkifat 5/10: KDV'nin yarısı", () => {
    expect(toStr(withholding("31000", { numerator: 5, denominator: 10 }), 2)).toBe("15500.00");
  });

  it("tevkifat oranı yoksa 0", () => {
    expect(toStr(withholding("31000", null), 2)).toBe("0.00");
  });

  it("yüzde ve bölme", () => {
    expect(toStr(pct("200", "20"), 2)).toBe("40.00");
    expect(toStr(div("100", "4"), 2)).toBe("25.00");
  });

  it("büyük tutarlarda hassasiyet korunur", () => {
    const total = add("999999.99", "0.01");
    expect(toStr(total, 2)).toBe("1000000.00");
  });

  it("çıkarma ve çarpma", () => {
    expect(toStr(sub("100", "33.33"), 2)).toBe("66.67");
    expect(toStr(mul("1.1", "1.1"), 2)).toBe("1.21");
  });
});
