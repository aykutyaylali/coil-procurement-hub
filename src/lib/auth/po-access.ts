import type { AuthUser } from "./context";
import { ForbiddenError } from "@/lib/errors";

/**
 * PO Workspace veri-izolasyonu guard'ları — SAF fonksiyonlar (server-only bağımlılığı
 * yok, birim-test edilebilir). RBAC izniyle BİRLİKTE kullanılır; tek başına yetmez.
 */

/** Kullanıcı bir tedarikçi portalı kullanıcısı mı? (SupplierContact.userId bağlı) */
export function isSupplierUser(user: Pick<AuthUser, "supplierId">): boolean {
  return user.supplierId !== null;
}

/**
 * PO erişim izolasyonu:
 * - İç kullanıcı (supplierId=null): PO aynı tenant'ta olmalı.
 * - Tedarikçi kullanıcısı: PO yalnızca kendi supplierId'sine ait olmalı (+ tenant).
 * Not: `isInternal=true` içeriğin sızmaması ayrıca sorgu katmanında (where isInternal:false)
 * sağlanır; bu guard erişim sınırını çizer.
 */
export function assertPoAccess(
  po: { tenantId: string; supplierId: string },
  user: Pick<AuthUser, "isSystemAdmin" | "tenantId" | "supplierId">,
): void {
  if (user.isSystemAdmin) return;
  if (po.tenantId !== user.tenantId) {
    throw new ForbiddenError("Bu siparişe erişim yetkiniz yok.");
  }
  if (user.supplierId !== null && po.supplierId !== user.supplierId) {
    throw new ForbiddenError("Bu siparişe erişim yetkiniz yok.");
  }
}
