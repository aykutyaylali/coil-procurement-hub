import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS, ROLE_LABELS_TR, type RoleKey } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default async function UsersPage() {
  const user = await requirePermission(PERMISSIONS.ADMIN_USERS);
  const users = await prisma.user.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
    include: { userRoles: { include: { role: true } }, department: true },
  });
  return (
    <div>
      <PageHeader
        title="Kullanıcı ve Rol Yönetimi"
        description="Kullanıcılar, roller ve yetkiler. RBAC + kayıt bazlı kapsam."
        action={{ label: "Yeni Kullanıcı", href: "/admin/users/new" }}
      />
      <Card>
        {users.length === 0 ? (
          <EmptyState title="Kullanıcı yok" hint="“Yeni Kullanıcı” ile ekleyin." />
        ) : (
          <Table>
            <THead><TR><TH>Ad</TH><TH>E-posta</TH><TH>Departman</TH><TH>Roller</TH><TH>Dil</TH><TH>Durum</TH><TH></TH></TR></THead>
            <TBody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}{u.isSystemAdmin ? " 🛡️" : ""}</TD>
                  <TD className="text-sm">{u.email}</TD>
                  <TD className="text-sm">{u.department?.name ?? "-"}</TD>
                  <TD className="text-xs">
                    {u.userRoles.map((ur) => ROLE_LABELS_TR[ur.role.key as RoleKey] ?? ur.role.key).join(", ")}
                  </TD>
                  <TD className="text-xs uppercase">{u.locale}</TD>
                  <TD><Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? "Aktif" : "Pasif"}</Badge></TD>
                  <TD className="text-right"><Link href={`/admin/users/${u.id}/edit`} className="text-sm text-primary hover:underline">Düzenle</Link></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
