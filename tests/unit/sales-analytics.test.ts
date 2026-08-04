import { describe, it, expect } from "vitest";
import {
  sumByCurrency, computePipeline, computeConversion, topByWinRate, repBreakdown, monthlyTrend, monthKey,
  type OfferRow, type RfqRow,
} from "@/domain/sales-analytics";

const offer = (p: Partial<OfferRow>): OfferRow => ({
  status: "OPEN", currency: "EUR", totalAmount: "0", salesRepId: null, customerId: "c1", offerDate: "2026-06-15T00:00:00Z", ...p,
});
const rfq = (p: Partial<RfqRow>): RfqRow => ({ status: "REQUEST", customerId: "c1", industry: null, hasOffer: false, ...p });

describe("sumByCurrency", () => {
  it("aggregates per currency with decimal precision", () => {
    const res = sumByCurrency([
      { currency: "EUR", totalAmount: "13294.80" },
      { currency: "EUR", totalAmount: "1000.20" },
      { currency: "USD", totalAmount: "500" },
    ]);
    expect(Number(res.EUR)).toBeCloseTo(14295.0, 2);
    expect(Number(res.USD)).toBeCloseTo(500, 2);
  });
});

describe("computePipeline", () => {
  it("builds RFQ (count) + offer (amount) stages and ignores cancelled/rejected RFQs", () => {
    const rfqs = [rfq({ status: "REQUEST" }), rfq({ status: "IN_PROCESS" }), rfq({ status: "CANCELLED" }), rfq({ status: "OFFERED", hasOffer: true })];
    const offers = [offer({ status: "OPEN", totalAmount: "100", currency: "EUR" }), offer({ status: "ORDER", totalAmount: "200", currency: "EUR" })];
    const p = computePipeline(rfqs, offers);
    const byKey = Object.fromEntries(p.map((s) => [s.key, s]));
    expect(byKey.REQUEST!.count).toBe(1);
    expect(byKey.IN_PROCESS!.count).toBe(1);
    expect(byKey.OPEN!.count).toBe(1);
    expect(Number(byKey.OPEN!.amount.EUR)).toBe(100);
    expect(Number(byKey.ORDER!.amount.EUR)).toBe(200);
  });
});

describe("computeConversion", () => {
  it("computes RFQ→offer rate and win rate", () => {
    const rfqs = [rfq({ status: "OFFERED", hasOffer: true }), rfq({ status: "REQUEST" }), rfq({ status: "CANCELLED" }), rfq({ status: "IN_PROCESS" })];
    // 3 active (cancelled excluded), 1 with offer -> 33.3%
    const offers = [offer({ status: "ORDER" }), offer({ status: "OPEN" }), offer({ status: "CLOSED" }), offer({ status: "REJECTED" })];
    const c = computeConversion(rfqs, offers);
    expect(c.rfqTotal).toBe(3);
    expect(c.rfqWithOffer).toBe(1);
    expect(c.rfqToOfferRate).toBeCloseTo(33.3, 1);
    expect(c.offerTotal).toBe(4);
    expect(c.orderCount).toBe(1);
    expect(c.winRate).toBe(25); // 1/4
    expect(c.decidedWinRate).toBeCloseTo(33.3, 1); // 1 / (ORDER+CLOSED+REJECTED=3)
  });
  it("guards divide-by-zero", () => {
    const c = computeConversion([], []);
    expect(c.rfqToOfferRate).toBe(0);
    expect(c.winRate).toBe(0);
    expect(c.decidedWinRate).toBe(0);
  });
});

describe("topByWinRate", () => {
  it("ranks actors by win rate then order volume", () => {
    const offers = [
      offer({ customerId: "A", status: "ORDER" }), offer({ customerId: "A", status: "OPEN" }), // 50%
      offer({ customerId: "B", status: "ORDER" }), offer({ customerId: "B", status: "ORDER" }), // 100%
      offer({ customerId: "C", status: "OPEN" }), // 0%
    ];
    const top = topByWinRate(offers, (o) => o.customerId, 5);
    expect(top.map((t) => t.key)).toEqual(["B", "A", "C"]);
    expect(top[0]!.winRate).toBe(100);
    expect(top[0]!.orders).toBe(2);
  });
  it("skips null keys (e.g. missing industry)", () => {
    const offers = [offer({ status: "ORDER" }), offer({ status: "OPEN" })];
    const top = topByWinRate(offers, () => null);
    expect(top).toHaveLength(0);
  });
});

describe("repBreakdown", () => {
  it("splits open vs order amounts per rep and currency", () => {
    const offers = [
      offer({ salesRepId: "r1", status: "OPEN", totalAmount: "100", currency: "EUR" }),
      offer({ salesRepId: "r1", status: "ORDER", totalAmount: "300", currency: "EUR" }),
      offer({ salesRepId: "r1", status: "ORDER", totalAmount: "50", currency: "USD" }),
      offer({ salesRepId: null, status: "OPEN", totalAmount: "9", currency: "EUR" }),
    ];
    const reps = repBreakdown(offers);
    const r1 = reps.find((r) => r.key === "r1")!;
    expect(Number(r1.openAmount.EUR)).toBe(100);
    expect(Number(r1.orderAmount.EUR)).toBe(300);
    expect(Number(r1.orderAmount.USD)).toBe(50);
    expect(r1.orderCount).toBe(2);
    expect(reps.find((r) => r.key === "__none__")).toBeTruthy();
  });
});

describe("monthlyTrend / monthKey", () => {
  it("derives UTC year-month key", () => {
    expect(monthKey("2026-06-15T00:00:00Z")).toBe("2026-06");
    expect(monthKey(new Date(Date.UTC(2026, 0, 3)))).toBe("2026-01");
  });
  it("buckets offered vs ordered per month for a currency, last N months", () => {
    const offers = [
      offer({ currency: "EUR", status: "OPEN", totalAmount: "100", offerDate: "2026-05-10T00:00:00Z" }),
      offer({ currency: "EUR", status: "ORDER", totalAmount: "200", offerDate: "2026-06-10T00:00:00Z" }),
      offer({ currency: "EUR", status: "OPEN", totalAmount: "50", offerDate: "2026-06-20T00:00:00Z" }),
      offer({ currency: "USD", status: "ORDER", totalAmount: "999", offerDate: "2026-06-01T00:00:00Z" }), // filtered out
    ];
    const t = monthlyTrend(offers, "EUR", 6);
    expect(t).toHaveLength(2);
    expect(t[0]!.month).toBe("2026-05");
    expect([Number(t[0]!.offered), Number(t[0]!.ordered)]).toEqual([100, 0]);
    expect(t[1]!.month).toBe("2026-06");
    expect([Number(t[1]!.offered), Number(t[1]!.ordered)]).toEqual([250, 200]);
  });
});
