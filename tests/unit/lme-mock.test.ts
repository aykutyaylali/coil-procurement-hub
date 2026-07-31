import { describe, it, expect } from "vitest";
import { mockLmeUsdPerTon } from "@/lib/lme/mock";

describe("LME mock sağlayıcı (deterministik)", () => {
  it("aynı tarih için aynı değeri döner (deterministik)", () => {
    const d = new Date("2026-07-31T10:00:00");
    expect(mockLmeUsdPerTon(d)).toBe(mockLmeUsdPerTon(new Date("2026-07-31T18:00:00")));
  });

  it("değer 9500–10000 bandında ve rastgele değil", () => {
    for (const iso of ["2026-01-15", "2026-06-01", "2026-12-20"]) {
      const v = mockLmeUsdPerTon(new Date(iso));
      expect(v).toBeGreaterThanOrEqual(9500);
      expect(v).toBeLessThan(10000);
    }
  });

  it("bilinen gün için tam değer", () => {
    // 2026-01-10 → gün ~10 → 9500 + (10 % 40) * 12.5 = 9625
    expect(mockLmeUsdPerTon(new Date("2026-01-10T12:00:00"))).toBe(9625);
  });
});
