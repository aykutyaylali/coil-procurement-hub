import { describe, it, expect } from "vitest";
import {
  REQUISITION_TRANSITIONS,
  RFQ_TRANSITIONS,
  ORDER_TRANSITIONS,
  canTransition,
  assertTransition,
} from "@/domain/state-machines";

describe("durum makineleri - geçersiz geçişler engellenir", () => {
  it("talep: DRAFT -> PENDING_APPROVAL geçerli", () => {
    expect(canTransition(REQUISITION_TRANSITIONS, "DRAFT", "PENDING_APPROVAL")).toBe(true);
  });

  it("talep: DRAFT -> ORDERED geçersiz", () => {
    expect(canTransition(REQUISITION_TRANSITIONS, "DRAFT", "ORDERED")).toBe(false);
  });

  it("talep: CLOSED terminal durumdan çıkış yok", () => {
    expect(canTransition(REQUISITION_TRANSITIONS, "CLOSED", "DRAFT")).toBe(false);
  });

  it("RFQ: OPEN -> EVALUATION geçerli", () => {
    expect(canTransition(RFQ_TRANSITIONS, "OPEN", "EVALUATION")).toBe(true);
  });

  it("sipariş: APPROVED -> RECEIVED geçersiz (arada adımlar var)", () => {
    expect(canTransition(ORDER_TRANSITIONS, "APPROVED", "RECEIVED")).toBe(false);
  });

  it("assertTransition geçersizde hata fırlatır", () => {
    expect(() => assertTransition(ORDER_TRANSITIONS, "DRAFT", "RECEIVED", "Sipariş")).toThrow();
  });

  it("assertTransition aynı duruma izin verir (no-op)", () => {
    expect(() => assertTransition(ORDER_TRANSITIONS, "DRAFT", "DRAFT")).not.toThrow();
  });
});
