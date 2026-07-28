import { describe, it, expect } from "vitest";
import { computeOtif, computeCycleTimeDays, computeApprovalWaiting, computeSavings } from "@/domain/metrics";

const day = (s: string) => new Date(s + "T00:00:00.000Z");

describe("metrikler — OTIF", () => {
  it("zamanında ve tam teslim %100", () => {
    const r = computeOtif([
      { neededBy: day("2026-03-10"), receivedAt: day("2026-03-09"), orderedQty: "100", receivedQty: "100" },
      { neededBy: day("2026-03-10"), receivedAt: day("2026-03-10"), orderedQty: "50", receivedQty: "50" },
    ]);
    expect(r.value).toBe("100.0");
    expect(r.sufficient).toBe(true);
  });
  it("geç veya eksik teslim OTIF'i düşürür", () => {
    const r = computeOtif([
      { neededBy: day("2026-03-10"), receivedAt: day("2026-03-12"), orderedQty: "100", receivedQty: "100" }, // geç
      { neededBy: day("2026-03-10"), receivedAt: day("2026-03-09"), orderedQty: "100", receivedQty: "80" },  // eksik
      { neededBy: day("2026-03-10"), receivedAt: day("2026-03-10"), orderedQty: "100", receivedQty: "100" }, // OK
    ]);
    expect(r.value).toBe("33.3");
  });
  it("veri yoksa yetersiz", () => {
    expect(computeOtif([]).sufficient).toBe(false);
  });
});

describe("metrikler — çevrim süresi / onay bekleme", () => {
  it("ortalama gün hesabı", () => {
    const r = computeCycleTimeDays([
      { start: day("2026-03-01"), end: day("2026-03-06") }, // 5 gün
      { start: day("2026-03-01"), end: day("2026-03-02") }, // 1 gün
    ]);
    expect(r.value).toBe("3.0");
  });
  it("onay bekleme tamamlanmamışları yok sayar", () => {
    const r = computeApprovalWaiting([
      { createdAt: day("2026-03-01"), completedAt: day("2026-03-03") },
      { createdAt: day("2026-03-01"), completedAt: null },
    ]);
    expect(r.count).toBe(1);
    expect(r.value).toBe("2.0");
  });
});

describe("metrikler — tasarruf", () => {
  it("baseline vs actual tasarruf ve yüzde", () => {
    const { savings, savingsPct } = computeSavings([
      { baseline: "100", actual: "90", qty: "10" }, // 100 tasarruf
      { baseline: "50", actual: "50", qty: "5" },   // 0
    ]);
    expect(savings.value).toBe("100.00");
    // toplam baseline = 1000+250=1250, tasarruf 100 => %8.0
    expect(savingsPct.value).toBe("8.0");
  });
  it("veri yoksa yetersiz", () => {
    expect(computeSavings([]).savings.sufficient).toBe(false);
  });
});
