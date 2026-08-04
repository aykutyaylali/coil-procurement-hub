import { describe, it, expect } from "vitest";
import { countryFlag } from "@/lib/country";
import { RFQ_STATUS, RFQ_STATUS_LABEL } from "@/app/(app)/sales/rfqs/status";
import { OFFER_STATUS, OFFER_STATUS_LABEL, OFFER_CURRENCIES, revisionLabel } from "@/app/(app)/sales/offers/status";
import { statusTone } from "@/lib/enums";
import { add, d, toStr } from "@/lib/money";

describe("countryFlag", () => {
  it("maps ISO alpha-2 to regional indicator flag", () => {
    expect(countryFlag("TR")).toBe("🇹🇷");
    expect(countryFlag("de")).toBe("🇩🇪"); // case-insensitive
    expect(countryFlag(" US ")).toBe("🇺🇸"); // trims
  });
  it("returns white flag for invalid/empty input", () => {
    expect(countryFlag("")).toBe("🏳️");
    expect(countryFlag(null)).toBe("🏳️");
    expect(countryFlag(undefined)).toBe("🏳️");
    expect(countryFlag("XYZ")).toBe("🏳️");
    expect(countryFlag("1")).toBe("🏳️");
  });
});

describe("Sales RFQ status model", () => {
  it("has a label for every status", () => {
    for (const s of RFQ_STATUS) {
      expect(RFQ_STATUS_LABEL[s], `label for ${s}`).toBeTruthy();
    }
  });
  it("resolves a defined badge tone for every status", () => {
    for (const s of RFQ_STATUS) {
      expect(statusTone(s), `tone for ${s}`).toBeTruthy();
    }
  });
  it("covers the full CPQ pipeline", () => {
    expect(RFQ_STATUS).toEqual(["REQUEST", "IN_PROCESS", "OFFERED", "REJECTED", "CANCELLED"]);
  });
});

describe("Sales Offer status model", () => {
  it("has label + defined tone for every status", () => {
    for (const s of OFFER_STATUS) {
      expect(OFFER_STATUS_LABEL[s], `label for ${s}`).toBeTruthy();
      expect(statusTone(s), `tone for ${s}`).toBeTruthy();
    }
  });
  it("summarises across EUR/USD/TRY", () => {
    expect(OFFER_CURRENCIES).toEqual(["EUR", "USD", "TRY"]);
  });
  it("maps ORDER→success and OPEN→info for the summary badges", () => {
    expect(statusTone("ORDER")).toBe("success");
    expect(statusTone("OPEN")).toBe("info");
  });
});

describe("revisionLabel (Rev A/B/...)", () => {
  it("maps 0-based revision number to letters", () => {
    expect(revisionLabel(0)).toBe("Rev A");
    expect(revisionLabel(1)).toBe("Rev B");
    expect(revisionLabel(25)).toBe("Rev Z");
  });
  it("falls back to numeric label past Z and handles invalid", () => {
    expect(revisionLabel(26)).toBe("Rev 27");
    expect(revisionLabel(-1)).toBe("—");
  });
});

describe("per-currency offer amount aggregation (decimal.js)", () => {
  it("sums Turkish-scale amounts without float drift", () => {
    const amounts = ["13294.80", "1000.20", "0.00"];
    const total = amounts.reduce((acc, a) => toStr(add(d(acc), d(a))), "0");
    expect(Number(total)).toBeCloseTo(14295.0, 2);
  });
});
