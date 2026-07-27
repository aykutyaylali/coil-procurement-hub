import { describe, it, expect } from "vitest";
import { permissionsForRoles, hasPermission, PERMISSIONS, ROLE_KEYS } from "@/lib/rbac";

describe("RBAC - rol/yetki matrisi", () => {
  it("talep sahibi talep oluşturabilir ama onaylayamaz", () => {
    const perms = permissionsForRoles([ROLE_KEYS.REQUESTER]);
    expect(hasPermission(perms, PERMISSIONS.REQUISITION_CREATE)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.REQUISITION_APPROVE)).toBe(false);
  });

  it("satınalma müdürü RFQ karara bağlayabilir", () => {
    const perms = permissionsForRoles([ROLE_KEYS.PURCHASING_MANAGER]);
    expect(hasPermission(perms, PERMISSIONS.RFQ_AWARD)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.SUPPLIER_BANK_APPROVE)).toBe(true);
  });

  it("görüntüleyici hiçbir şey oluşturamaz/onaylayamaz", () => {
    const perms = permissionsForRoles([ROLE_KEYS.VIEWER]);
    expect(hasPermission(perms, PERMISSIONS.REQUISITION_VIEW)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.REQUISITION_CREATE)).toBe(false);
    expect(hasPermission(perms, PERMISSIONS.ORDER_APPROVE)).toBe(false);
  });

  it("sistem yöneticisi tüm yetkilere sahip", () => {
    const perms = permissionsForRoles([ROLE_KEYS.SYSTEM_ADMIN]);
    expect(hasPermission(perms, PERMISSIONS.ADMIN_SETTINGS)).toBe(true);
    expect(hasPermission(perms, PERMISSIONS.INVOICE_APPROVE)).toBe(true);
  });
});
