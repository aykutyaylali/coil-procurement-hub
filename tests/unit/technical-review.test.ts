import { describe, it, expect } from "vitest";
import { REVIEW_TYPES, REVIEW_ACTIONS, REVIEW_RISKS, STATUS_BY_ACTION } from "@/domain/technical-review-constants";
import { permissionsForRoles, PERMISSIONS as P } from "@/lib/rbac";

describe("Teknik İnceleme — sabitler & karar akışı (Master §7)", () => {
  it("6 inceleme türü, 6 karar aksiyonu, 3 risk seviyesi", () => {
    expect(REVIEW_TYPES).toEqual(["DIMENSION", "MATERIAL", "PROCESS", "TOLERANCE", "SUBSTITUTION", "OTHER"]);
    expect(REVIEW_ACTIONS).toEqual(["APPROVE", "REJECT", "REQUEST_INFO", "SUGGEST_ALTERNATIVE", "FORWARD", "INTERNAL_NOTE"]);
    expect(REVIEW_RISKS).toEqual(["LOW", "MEDIUM", "HIGH"]);
  });

  it("karar aksiyonu → durum eşlemesi doğru", () => {
    expect(STATUS_BY_ACTION.APPROVE).toBe("APPROVED");
    expect(STATUS_BY_ACTION.REJECT).toBe("REJECTED");
    expect(STATUS_BY_ACTION.REQUEST_INFO).toBe("INFO_REQUESTED");
    expect(STATUS_BY_ACTION.SUGGEST_ALTERNATIVE).toBe("ALTERNATIVE_SUGGESTED");
    expect(STATUS_BY_ACTION.FORWARD).toBe("FORWARDED");
  });

  it("INTERNAL_NOTE durumu DEĞİŞTİRMEZ (eşlemede yok)", () => {
    expect(STATUS_BY_ACTION.INTERNAL_NOTE).toBeUndefined();
  });
});

describe("Teknik İnceleme — RBAC", () => {
  it("tedarikçi oluşturabilir ama karar veremez", () => {
    const s = permissionsForRoles(["SUPPLIER_USER"]);
    expect(s.has(P.TECH_REVIEW_CREATE)).toBe(true);
    expect(s.has(P.TECH_REVIEW_DECIDE)).toBe(false);
  });

  it("iç teknik/satınalma hem oluşturur hem karar verir", () => {
    for (const role of ["TECHNICAL_APPROVER", "PURCHASING_SPECIALIST", "PURCHASING_MANAGER"]) {
      const s = permissionsForRoles([role]);
      expect(s.has(P.TECH_REVIEW_CREATE)).toBe(true);
      expect(s.has(P.TECH_REVIEW_DECIDE)).toBe(true);
    }
  });
});
