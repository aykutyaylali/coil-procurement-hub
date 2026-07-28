"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth/password";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result, NotFoundError, ValidationError } from "@/lib/errors";

const baseSchema = z.object({
  name: z.string().min(1, "Ad zorunlu."),
  email: z.string().email("Geçerli e-posta girin."),
  title: z.string().optional(),
  phone: z.string().optional(),
  locale: z.enum(["tr", "en"]).default("tr"),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  roleKeys: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

async function resolveRoleIds(tenantId: string, roleKeys: string[]): Promise<string[]> {
  if (roleKeys.length === 0) return [];
  const roles = await prisma.role.findMany({ where: { tenantId, key: { in: roleKeys } }, select: { id: true, key: true } });
  const found = new Set(roles.map((r) => r.key));
  const missing = roleKeys.filter((k) => !found.has(k));
  if (missing.length) throw new ValidationError(`Bilinmeyen rol: ${missing.join(", ")}`);
  return roles.map((r) => r.id);
}

export async function createUser(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const admin = await requirePermission(PERMISSIONS.ADMIN_USERS);
    const data = baseSchema.extend({ password: z.string().min(8, "Parola en az 8 karakter olmalı.") }).parse(input);
    const email = data.email.trim().toLowerCase();

    const dup = await prisma.user.findFirst({ where: { tenantId: admin.tenantId, email } });
    if (dup) throw new ValidationError("Bu e-posta ile bir kullanıcı zaten var.");

    const roleIds = await resolveRoleIds(admin.tenantId, data.roleKeys);
    const passwordHash = await hashPassword(data.password);

    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: admin.tenantId,
          email,
          name: data.name,
          title: data.title || null,
          phone: data.phone || null,
          locale: data.locale,
          departmentId: data.departmentId || null,
          managerId: data.managerId || null,
          isActive: data.isActive,
          passwordHash,
          userRoles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
      });
      await writeAudit({ tenantId: admin.tenantId, userId: admin.id, action: "CREATE", entityType: "User", entityId: u.id, after: { email, name: data.name, roles: data.roleKeys } }, tx);
      return u;
    });
    revalidatePath("/admin/users");
    return ok({ id: created.id });
  } catch (e) {
    return fail(e);
  }
}

export async function updateUser(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const admin = await requirePermission(PERMISSIONS.ADMIN_USERS);
    const data = baseSchema.extend({ id: z.string(), password: z.string().optional() }).parse(input);
    const existing = await prisma.user.findFirst({ where: { id: data.id, tenantId: admin.tenantId } });
    if (!existing) throw new NotFoundError("Kullanıcı bulunamadı.");

    const roleIds = await resolveRoleIds(admin.tenantId, data.roleKeys);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          title: data.title || null,
          phone: data.phone || null,
          locale: data.locale,
          departmentId: data.departmentId || null,
          managerId: data.managerId || null,
          isActive: data.isActive,
          ...(data.password && data.password.length >= 8 ? { passwordHash: await hashPassword(data.password) } : {}),
        },
      });
      // Rolleri senkronla (mevcutları sil, yenilerini ekle)
      await tx.userRole.deleteMany({ where: { userId: existing.id } });
      if (roleIds.length) await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: existing.id, roleId })) });
      await writeAudit({ tenantId: admin.tenantId, userId: admin.id, action: "UPDATE", entityType: "User", entityId: existing.id, before: { name: existing.name, isActive: existing.isActive }, after: { name: data.name, isActive: data.isActive, roles: data.roleKeys } }, tx);
    });
    revalidatePath("/admin/users");
    return ok({ id: existing.id });
  } catch (e) {
    return fail(e);
  }
}
