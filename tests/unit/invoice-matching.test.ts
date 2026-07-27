import { describe, it, expect } from "vitest";
import { matchInvoice, type MatchInputLine } from "@/domain/invoice/matching";

const tol = { qtyPct: "2", pricePct: "2", amountAbs: "10" };

function line(over: Partial<MatchInputLine> = {}): MatchInputLine {
  return {
    orderLineId: "l1", description: "Bakır Tel",
    orderedQty: "100", orderedPrice: "310", receivedQty: "100", prevInvoicedQty: "0",
    thisQty: "100", thisPrice: "310", taxRate: "20", ...over,
  };
}

describe("üçlü eşleştirme motoru", () => {
  it("tam eşleşen fatura tolerans içinde geçer", () => {
    const r = matchInvoice([line()], tol);
    expect(r.passed).toBe(true);
    expect(r.lines[0]!.status).toBe("MATCHED");
    expect(r.netTotal).toBe("31000.00");
    expect(r.taxTotal).toBe("6200.00");
    expect(r.grandTotal).toBe("37200.00");
  });

  it("fiyat sapması tolerans dışında bloke eder", () => {
    const r = matchInvoice([line({ thisPrice: "340" })], tol); // ~%9.7 sapma
    expect(r.passed).toBe(false);
    expect(r.lines[0]!.status).toBe("PRICE_VARIANCE");
    expect(r.blockedReasons.length).toBe(1);
  });

  it("küçük fiyat farkı tolerans içinde geçer", () => {
    const r = matchInvoice([line({ thisPrice: "313" })], tol); // ~%0.97
    expect(r.passed).toBe(true);
  });

  it("mal kabulü aşan miktar fazla faturalama olarak bloke edilir", () => {
    const r = matchInvoice([line({ thisQty: "120", receivedQty: "100" })], tol);
    expect(r.passed).toBe(false);
    expect(r.lines[0]!.status).toBe("OVER_INVOICED");
  });

  it("mal kabul yapılmamış satır bloke edilir", () => {
    const r = matchInvoice([line({ receivedQty: "0" })], tol);
    expect(r.passed).toBe(false);
    expect(r.lines[0]!.status).toBe("NOT_RECEIVED");
  });

  it("önceki faturalarla birlikte fazla faturalama tespit edilir", () => {
    const r = matchInvoice([line({ prevInvoicedQty: "90", thisQty: "20", receivedQty: "100" })], tol);
    expect(r.passed).toBe(false); // 90+20=110 > 100*1.02
  });
});
