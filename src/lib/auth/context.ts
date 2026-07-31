import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth/session";
import { permissionsForRoles, type Permission } from "@/lib/rbac";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  title: string | null;
  locale: string;
  timezone: string;
  isSystemAdmin: boolean;
  departmentId: string | null;
  managerId: string | null;
  roleKeys: string[];
  permissions: Set<string>;
  /** Kayıt bazlı erişim kapsamları: scopeType -> id set */
  scopes: Record<string, Set<string>>;
  /**
   * Tedarikçi portalı kullanıcısıysa bağlı tedarikçi id'si (SupplierContact.userId
   * üzerinden çözülür); iç kullanıcılarda null. PO Workspace izolasyonunda kullanılır.
   */
  supplierId: string | null;
}

/**
 * Aktif kullanıcıyı (rol/yetki/kapsam ile) döndürür.
 * React `cache` ile istek başına tek sorgu.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: { include: { role: true } },
      scopes: true,
      supplierUser: { select: { supplierId: true } },
    },
  });
  if (!user || !user.isActive) return null;

  const roleKeys = user.userRoles.map((ur) => ur.role.key);
  const permissions = permissionsForRoles(roleKeys);

  // Ek: role'e özel permission override (JSON alan)
  for (const ur of user.userRoles) {
    try {
      const extra = JSON.parse(ur.role.permissions) as string[];
      extra.forEach((p) => permissions.add(p));
    } catch {
      /* yok say */
    }
  }

  // Sistem yöneticisi tüm yetkilere sahip
  if (user.isSystemAdmin) {
    permissions.add("*");
  }

  const scopes: Record<string, Set<string>> = {};
  for (const s of user.scopes) {
    (scopes[s.scopeType] ??= new Set()).add(s.scopeId);
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    title: user.title,
    locale: user.locale,
    timezone: user.timezone,
    isSystemAdmin: user.isSystemAdmin,
    departmentId: user.departmentId,
    managerId: user.managerId,
    roleKeys,
    permissions,
    scopes,
    supplierId: user.supplierUser?.supplierId ?? null,
  };
});

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function userCan(user: AuthUser, permission: Permission): boolean {
  return user.isSystemAdmin || user.permissions.has("*") || user.permissions.has(permission);
}

export async function requirePermission(permission: Permission): Promise<AuthUser> {
  const user = await requireUser();
  if (!userCan(user, permission)) {
    throw new ForbiddenError();
  }
  return user;
}

/**
 * Kayıt bazlı erişim: kullanıcının belirtilen kapsamda hakkı var mı?
 * Hiç scope tanımlı değilse (kapsam kısıtı yok) => tüm tenant erişimi.
 */
export function userInScope(user: AuthUser, scopeType: string, scopeId: string | null): boolean {
  if (user.isSystemAdmin) return true;
  const set = user.scopes[scopeType];
  if (!set || set.size === 0) return true; // kapsam kısıtı tanımlı değil
  return scopeId ? set.has(scopeId) : true;
}

// PO Workspace izolasyon guard'ları saf modülde tutulur (birim-test edilebilir).
export { isSupplierUser, assertPoAccess } from "./po-access";
