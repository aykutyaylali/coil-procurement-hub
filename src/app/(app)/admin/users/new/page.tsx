import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS, ROLE_LABELS_TR, type RoleKey } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Yeni Kullanıcı" };

export default async function NewUserPage() {
  const admin = await requirePermission(PERMISSIONS.ADMIN_USERS);
  const [roles, departments, managers] = await Promise.all([
    prisma.role.findMany({ where: { tenantId: admin.tenantId }, select: { key: true }, orderBy: { key: "asc" } }),
    prisma.department.findMany({ where: { company: { tenantId: admin.tenantId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: admin.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const roleOptions = roles
    .filter((r) => !r.key.startsWith("SUPPLIER_"))
    .map((r) => ({ key: r.key, label: ROLE_LABELS_TR[r.key as RoleKey] ?? r.key }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Yeni Kullanıcı" description="Kullanıcı oluşturun, departman/amir atayın ve RBAC rollerini verin." />
      <UserForm roles={roleOptions} departments={departments} managers={managers} />
    </div>
  );
}
