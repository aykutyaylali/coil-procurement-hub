import { describe, it, expect } from "vitest";
import { aggregateSarcamSummary, aggregateByMaterial, aggregateByOrder, type CopperLineRow } from "@/domain/lme-reports";

const base = {
  supplierName: "Sarcam", status: "CONFIRMED", lmeCoefficient: "1", extraCostUsdPerKg: "0.1", lmePriceDate: null,
};
const rows: CopperLineRow[] = [
  { ...base, orderId: "o1", orderNumber: "SIP1", orderDate: new Date("2026-07-01"), description: "Bakır tel 2mm", qtyKg: "100", unitUsdPerKg: "9.6000", usdTryRate: "34.20", lmeUsdPerTon: "9000", premiumUsdPerKg: "0.5" },
  { ...base, orderId: "o2", orderNumber: "SIP2", orderDate: new Date("2026-07-05"), description: "Bakır tel 2mm", qtyKg: "200", unitUsdPerKg: "10.0000", usdTryRate: "34.00", lmeUsdPerTon: "9000", premiumUsdPerKg: "0.5" },
];

describe("LME/Sarcam raporları", () => {
  it("Sarcam toplam özeti (kg/USD/TL, ortalamalar)", () => {
    const s = aggregateSarcamSummary(rows);
    expect(s.totalKg).toBe("300.000");
    expect(s.totalUsd).toBe("2960.00"); // 9.6×100 + 10×200
    expect(s.totalTry).toBe("100832.00"); // 960×34.20 + 2000×34.00
    expect(s.avgUsdPerKg).toBe("9.8667"); // 2960/300
    expect(s.avgTryPerKg).toBe("336.1067"); // 100832/300
  });

  it("malzeme bazında ortalamalar", () => {
    const m = aggregateByMaterial(rows);
    expect(m).toHaveLength(1);
    expect(m[0]!.count).toBe(2);
    expect(m[0]!.avgLmeUsdTon).toBe("9000.00");
    expect(m[0]!.avgPremium).toBe("0.5000");
    expect(m[0]!.avgUsdKg).toBe("9.8000"); // (9.6+10)/2
    expect(m[0]!.avgTlKg).toBe("334.1600"); // (328.32+340)/2
  });

  it("PO bazında özet", () => {
    const o = aggregateByOrder(rows);
    expect(o).toHaveLength(2);
    expect(o[0]!.orderNumber).toBe("SIP2"); // tarih desc
    expect(o.find((x) => x.orderNumber === "SIP1")!.orderedKg).toBe("100.000");
  });

  it("boş girişte 0 döner", () => {
    expect(aggregateSarcamSummary([]).avgUsdPerKg).toBe("0.0000");
  });
});
