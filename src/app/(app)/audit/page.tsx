import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Denetim Kayıtları" };

export default async function AuditPage() {
  const user = await requirePermission(PERMISSIONS.AUDIT_VIEW);
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: { user: true },
    take: 200,
  });
  return (
    <div>
      <PageHeader title="Denetim Kayıtları" description="Değişmez (append-only) denetim izi. Bu kayıtlar hiçbir kullanıcı tarafından değiştirilemez veya silinemez." />
      <Card>
        {logs.length === 0 ? (
          <EmptyState title="Kayıt yok" />
        ) : (
          <Table>
            <THead><TR><TH>Zaman</TH><TH>Kullanıcı</TH><TH>İşlem</TH><TH>Varlık</TH><TH>Neden</TH></TR></THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(l.createdAt)}</TD>
                  <TD className="text-sm">{l.user?.name ?? "Sistem"}</TD>
                  <TD className="text-sm font-medium">{l.action}</TD>
                  <TD className="text-xs">{l.entityType}</TD>
                  <TD className="max-w-xs truncate text-xs text-muted-foreground">{l.reason ?? "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
