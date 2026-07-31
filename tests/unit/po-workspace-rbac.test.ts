import { describe, it, expect } from "vitest";
import { permissionsForRoles, PERMISSIONS as P } from "@/lib/rbac";
import { assertPoAccess, isSupplierUser } from "@/lib/auth/po-access";
import { ForbiddenError } from "@/lib/errors";

describe("PO Workspace RBAC — izin matrisi", () => {
  it("SUPPLIER_USER tedarikçi-scoped izinlere sahip; karar/iç-yorum İZNİ YOK", () => {
    const perms = permissionsForRoles(["SUPPLIER_USER"]);
    expect(perms.has(P.PO_WORKSPACE_VIEW)).toBe(true);
    expect(perms.has(P.PO_WORKSPACE_COMMENT)).toBe(true);
    expect(perms.has(P.PO_PRODUCTION_UPDATE)).toBe(true);
    expect(perms.has(P.TECH_REVIEW_CREATE)).toBe(true);
    // Coil'e ait yetkiler tedarikçide OLMAMALI
    expect(perms.has(P.TECH_REVIEW_DECIDE)).toBe(false);
    expect(perms.has(P.PO_INTERNAL_COMMENT)).toBe(false);
    expect(perms.has(P.PO_PARTICIPANT_MANAGE)).toBe(false);
  });

  it("PURCHASING_SPECIALIST tam workspace (karar + iç-yorum + katılımcı)", () => {
    const perms = permissionsForRoles(["PURCHASING_SPECIALIST"]);
    expect(perms.has(P.TECH_REVIEW_DECIDE)).toBe(true);
    expect(perms.has(P.PO_INTERNAL_COMMENT)).toBe(true);
    expect(perms.has(P.PO_PARTICIPANT_MANAGE)).toBe(true);
  });

  it("TECHNICAL_APPROVER karar verebilir ama üretim güncelleyemez", () => {
    const perms = permissionsForRoles(["TECHNICAL_APPROVER"]);
    expect(perms.has(P.TECH_REVIEW_DECIDE)).toBe(true);
    expect(perms.has(P.PO_PRODUCTION_UPDATE)).toBe(false);
  });

  it("SUPPLIER_MANAGER katılımcı yönetir; SUPPLIER_USER yönetemez", () => {
    expect(permissionsForRoles(["SUPPLIER_MANAGER"]).has(P.PO_PARTICIPANT_MANAGE)).toBe(true);
    expect(permissionsForRoles(["SUPPLIER_USER"]).has(P.PO_PARTICIPANT_MANAGE)).toBe(false);
  });
});

describe("assertPoAccess — tedarikçi veri izolasyonu", () => {
  const internal = { isSystemAdmin: false, tenantId: "t1", supplierId: null };
  const supplierA = { isSystemAdmin: false, tenantId: "t1", supplierId: "supA" };
  const admin = { isSystemAdmin: true, tenantId: "t1", supplierId: null };

  it("iç kullanıcı: aynı tenant erişir, farklı tenant reddedilir", () => {
    expect(() => assertPoAccess({ tenantId: "t1", supplierId: "x" }, internal)).not.toThrow();
    expect(() => assertPoAccess({ tenantId: "t2", supplierId: "x" }, internal)).toThrow(ForbiddenError);
  });

  it("tedarikçi kullanıcısı: yalnız kendi supplierId'sine ait PO", () => {
    expect(() => assertPoAccess({ tenantId: "t1", supplierId: "supA" }, supplierA)).not.toThrow();
    expect(() => assertPoAccess({ tenantId: "t1", supplierId: "supB" }, supplierA)).toThrow(ForbiddenError);
  });

  it("sistem yöneticisi her PO'ya erişir", () => {
    expect(() => assertPoAccess({ tenantId: "t2", supplierId: "supB" }, admin)).not.toThrow();
  });

  it("isSupplierUser iç/tedarikçi kullanıcıyı doğru ayırt eder", () => {
    expect(isSupplierUser(internal)).toBe(false);
    expect(isSupplierUser(supplierA)).toBe(true);
  });
});
