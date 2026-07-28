import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "E-posta Merkezi" };

export default async function EmailsPage() {
  const user = await requirePermission(PERMISSIONS.RFQ_VIEW);
  const [messages, unmatched] = await Promise.all([
    prisma.emailMessage.findMany({ where: { tenantId: user.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.emailMessage.count({ where: { tenantId: user.tenantId, status: "UNMATCHED" } }),
  ]);

  return (
    <div>
      <PageHeader title="E-posta İşlem Merkezi" description={`Aktif sağlayıcı: ${env.EMAIL_PROVIDER.toUpperCase()} · Gelen/giden tüm e-postalar, teslim durumu ve loglar.`} />
      {unmatched > 0 && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm">
          {unmatched} adet eşleşmeyen gelen e-posta &quot;eşleştirme bekleyen&quot; kuyruğunda.
        </div>
      )}
      <Card>
        {messages.length === 0 ? (
          <EmptyState title="E-posta kaydı yok" hint="RFQ gönderdiğinizde e-postalar burada listelenir." />
        ) : (
          <Table>
            <THead><TR><TH>Yön</TH><TH>Alıcı/Gönderen</TH><TH>Konu</TH><TH>Referans</TH><TH>Durum</TH><TH>Tarih</TH></TR></THead>
            <TBody>
              {messages.map((m) => (
                <TR key={m.id}>
                  <TD>{m.direction === "OUTBOUND" ? "Giden" : "Gelen"}</TD>
                  <TD className="text-sm">{m.direction === "OUTBOUND" ? m.toAddress : m.fromAddress}</TD>
                  <TD className="max-w-xs truncate text-sm">{m.subject}</TD>
                  <TD className="text-xs text-muted-foreground">{m.refType ?? "-"}</TD>
                  <TD><StatusBadge status={m.status} /></TD>
                  <TD className="text-sm text-muted-foreground">{formatDateTime(m.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
