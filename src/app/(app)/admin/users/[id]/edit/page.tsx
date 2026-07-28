import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS, ROLE_LABELS_TR, type RoleKey } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { UserForm, type UserInitial } from "../../user-form";

export const metadata: Metadata = { title: "Kullanıcı Düzenle" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePermission(PERMISSIONS.ADMIN_USERS);
  const u = await prisma.user.findFirst({
    where: { id, tenantId: admin.tenantId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!u) notFound();

  const [roles, departments, managers] = await Promise.all([
    prisma.role.findMany({ where: { tenantId: admin.tenantId }, select: { key: true }, orderBy: { key: "asc" } }),
    prisma.department.findMany({ where: { company: { tenantId: admin.tenantId } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: admin.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const roleOptions = roles.filter((r) => !r.key.startsWith("SUPPLIER_")).map((r) => ({ key: r.key, label: ROLE_LABELS_TR[r.key as RoleKey] ?? r.key }));

  const initial: UserInitial = {
    id: u.id,
    name: u.name,
    email: u.email,
    title: u.title ?? "",
    phone: u.phone ?? "",
    locale: (u.locale as "tr" | "en") ?? "tr",
    departmentId: u.departmentId ?? "",
    managerId: u.managerId ?? "",
    roleKeys: u.userRoles.map((ur) => ur.role.key),
    isActive: u.isActive,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Düzenle — ${u.name}`} description={u.email} />
      <UserForm roles={roleOptions} departments={departments} managers={managers} initial={initial} editMode />
    </div>
  );
}
