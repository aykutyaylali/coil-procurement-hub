import { describe, it, expect } from "vitest";
import { encodeCode128B, code128BChecksum, isEncodableCode128B, code128Bars } from "@/lib/barcode";

describe("Code128-B barkod kodlayıcı", () => {
  it("kodlanabilirliği doğru belirler (ASCII 32..126)", () => {
    expect(isEncodableCode128B("WO-2026-0001")).toBe(true);
    expect(isEncodableCode128B("EMP-101")).toBe(true);
    expect(isEncodableCode128B("")).toBe(false);
    expect(isEncodableCode128B("çğü")).toBe(false); // ASCII dışı
  });

  it("modül dizisi doğru yapı ve uzunlukta: 11*(karakter+2) + 13", () => {
    const value = "EMP-101"; // 7 karakter
    const { modules, totalModules } = encodeCode128B(value);
    // start + data*7 + checksum = (7+2) sembol * 6 modül; stop = 7 modül
    expect(modules.length).toBe((value.length + 2) * 6 + 7);
    // toplam modül genişliği: 11 * (karakter + start + checksum) + 13 (stop)
    expect(totalModules).toBe(11 * (value.length + 2) + 13);
  });

  it("Start B deseni (211214) ile başlar", () => {
    const { modules } = encodeCode128B("A");
    expect(modules.slice(0, 6)).toEqual([2, 1, 1, 2, 1, 4]);
  });

  it("Stop deseni (2331112) ile biter", () => {
    const { modules } = encodeCode128B("A");
    expect(modules.slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]);
  });

  it("checksum: (104 + Σ value_i*i) mod 103", () => {
    // "A" -> value 33, checksum = (104 + 33*1) % 103 = 137 % 103 = 34
    expect(code128BChecksum("A")).toBe(34);
    // "AB" -> (104 + 33*1 + 34*2) % 103 = (104+33+68)=205 %103 = 102
    expect(code128BChecksum("AB")).toBe(102);
  });

  it("code128Bars: siyah çubukları üretir, ilk çubuk bardır", () => {
    const { bars, width } = code128Bars("WO-1", 1.5, 10);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]!.x).toBe(10); // startX'ten başlar (ilk modül bar)
    expect(width).toBeGreaterThan(0);
  });

  it("ASCII dışı değerde hata verir", () => {
    expect(() => encodeCode128B("çğü")).toThrow();
  });
});
