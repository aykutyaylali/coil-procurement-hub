import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { userCan } from "@/lib/auth/context";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Mal Kabul" };

export default async function ReceiptsPage() {
  const user = await requirePermission(PERMISSIONS.RECEIPT_VIEW);
  const canCreate = userCan(user, PERMISSIONS.RECEIPT_CREATE);
  const receipts = await prisma.goodsReceipt.findMany({
    where: { order: { tenantId: user.tenantId } },
    orderBy: { receivedAt: "desc" },
    include: { order: { include: { supplier: true } }, warehouse: true, _count: { select: { lines: true } } },
    take: 100,
  });
  return (
    <div>
      <PageHeader
        title="Mal Kabul"
        description="Sipariş/ASN üzerinden mal kabul, kısmi teslim ve kalite kuyruğu."
        action={canCreate ? { label: "Yeni Mal Kabul", href: "/receipts/new" } : undefined}
      />
      <Card>
        {receipts.length === 0 ? (
          <EmptyState title="Mal kabul kaydı yok" hint="Onaylı bir siparişten mal kabul oluşturun." />
        ) : (
          <Table>
            <THead><TR><TH>No</TH><TH>Sipariş</TH><TH>Tedarikçi</TH><TH>Ambar</TH><TH className="text-center">Satır</TH><TH>Durum</TH><TH>Tarih</TH></TR></THead>
            <TBody>
              {receipts.map((r) => (
                <TR key={r.id}>
                  <TD><Link href={`/receipts/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link></TD>
                  <TD className="text-sm">{r.order.number}</TD>
                  <TD className="text-sm">{r.order.supplier.legalName}</TD>
                  <TD className="text-sm">{r.warehouse?.name ?? "-"}</TD>
                  <TD className="text-center">{r._count.lines}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(r.receivedAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
