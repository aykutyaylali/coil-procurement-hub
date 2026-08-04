import { describe, it, expect } from "vitest";
import { countryFlag } from "@/lib/country";
import { RFQ_STATUS, RFQ_STATUS_LABEL } from "@/app/(app)/sales/rfqs/status";
import { statusTone } from "@/lib/enums";

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
