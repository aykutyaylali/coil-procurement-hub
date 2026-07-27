import { describe, it, expect } from "vitest";
import { allocateLandedCost } from "@/domain/landed-cost";
import { d } from "@/lib/money";

describe("landed cost dağıtımı", () => {
  const lines = [
    { id: "a", quantity: "10", weight: "100", volume: "1", lineTotal: "1000" },
    { id: "b", quantity: "30", weight: "300", volume: "3", lineTotal: "3000" },
  ];

  it("değere göre dağıtım (1000/3000 oranı)", () => {
    const r = allocateLandedCost(lines, [{ amount: "400", allocationMethod: "VALUE" }]);
    expect(d(r.perLine.a!).toFixed(2)).toBe("100.00"); // 400 * 1000/4000
    expect(d(r.perLine.b!).toFixed(2)).toBe("300.00"); // 400 * 3000/4000
    expect(r.total).toBe("400.00");
  });

  it("ağırlığa göre dağıtım", () => {
    const r = allocateLandedCost(lines, [{ amount: "800", allocationMethod: "WEIGHT" }]);
    expect(d(r.perLine.a!).toFixed(2)).toBe("200.00"); // 800 * 100/400
    expect(d(r.perLine.b!).toFixed(2)).toBe("600.00");
  });

  it("birden fazla masraf toplanır", () => {
    const r = allocateLandedCost(lines, [
      { amount: "400", allocationMethod: "VALUE" },
      { amount: "800", allocationMethod: "WEIGHT" },
    ]);
    expect(d(r.perLine.a!).toFixed(2)).toBe("300.00"); // 100 + 200
    expect(d(r.perLine.b!).toFixed(2)).toBe("900.00"); // 300 + 600
    expect(r.total).toBe("1200.00");
  });

  it("dağıtılan toplam, masraf toplamına eşit olmalı (kayıp yok)", () => {
    const r = allocateLandedCost(lines, [{ amount: "1000", allocationMethod: "QUANTITY" }]);
    const sum = d(r.perLine.a!).plus(r.perLine.b!);
    expect(sum.toFixed(2)).toBe("1000.00");
  });
});
