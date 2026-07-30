import { describe, it, expect } from "vitest";
import {
  PRODUCTION_STAGES,
  PO_PRODUCTION_TRANSITIONS,
  allowedProductionTargets,
  assertTransition,
  canTransition,
} from "@/domain/state-machines";
import { StateTransitionError } from "@/lib/errors";

describe("Üretim aşaması state-machine (Master §6)", () => {
  it("8 aşama tanımlı ve sırası doğru", () => {
    expect(PRODUCTION_STAGES).toEqual([
      "PLANNING",
      "WAITING_RAW_MATERIAL",
      "PRODUCTION_STARTED",
      "QUALITY_INSPECTION",
      "READY_FOR_SHIPMENT",
      "LOADED",
      "SHIPPED",
      "COMPLETED",
    ]);
  });

  it("ilk güncelleme (null): herhangi bir aşama seçilebilir", () => {
    expect(allowedProductionTargets(null)).toEqual([...PRODUCTION_STAGES]);
  });

  it("mevcut aşamadan yalnız izinli hedefler", () => {
    expect(allowedProductionTargets("PLANNING")).toEqual(["WAITING_RAW_MATERIAL", "PRODUCTION_STARTED"]);
    expect(allowedProductionTargets("SHIPPED")).toEqual(["COMPLETED", "LOADED"]);
    expect(allowedProductionTargets("COMPLETED")).toEqual([]);
  });

  it("ileri geçiş geçerli, atlamalı geçiş reddedilir", () => {
    expect(canTransition(PO_PRODUCTION_TRANSITIONS, "PRODUCTION_STARTED", "QUALITY_INSPECTION")).toBe(true);
    expect(canTransition(PO_PRODUCTION_TRANSITIONS, "PLANNING", "SHIPPED")).toBe(false);
    expect(() => assertTransition(PO_PRODUCTION_TRANSITIONS, "PLANNING", "SHIPPED", "Üretim")).toThrow(StateTransitionError);
  });

  it("bir adım geri düzeltme desteklenir", () => {
    expect(canTransition(PO_PRODUCTION_TRANSITIONS, "QUALITY_INSPECTION", "PRODUCTION_STARTED")).toBe(true);
    expect(() => assertTransition(PO_PRODUCTION_TRANSITIONS, "LOADED", "READY_FOR_SHIPMENT")).not.toThrow();
  });

  it("finansal ORDER durumlarından bağımsız (kesişim yok)", () => {
    // Üretim aşamaları finansal durum kodlarını içermez (DRAFT/APPROVED/INVOICED vb.)
    expect(PRODUCTION_STAGES).not.toContain("APPROVED");
    expect(PRODUCTION_STAGES).not.toContain("INVOICED");
  });
});
