import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Sözleşmeler" };

export default async function ContractsPage() {
  const user = await requirePermission(PERMISSIONS.CONTRACT_VIEW);
  const canManage = userCan(user, PERMISSIONS.CONTRACT_MANAGE);
  const contracts = await prisma.contract.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: { supplier: true },
    take: 100,
  });
  return (
    <div>
      <PageHeader title="Sözleşmeler" description="Çerçeve sözleşmeler, fiyat listeleri, limit ve yenileme takibi." action={canManage ? { label: "Yeni Sözleşme", href: "/contracts/new" } : undefined} />
      <Card>
        {contracts.length === 0 ? (
          <EmptyState title="Sözleşme yok" hint="Yeni sözleşme ekleyerek başlayın." />
        ) : (
          <Table>
            <THead><TR><TH>No</TH><TH>Başlık</TH><TH>Tedarikçi</TH><TH className="text-right">Limit</TH><TH className="text-right">Kullanılan</TH><TH>Bitiş</TH><TH>Durum</TH></TR></THead>
            <TBody>
              {contracts.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">{c.code}</Link></TD>
                  <TD>{c.title}</TD>
                  <TD className="text-sm">{c.supplier.legalName}</TD>
                  <TD className="text-right">{c.totalLimit ? formatMoney(c.totalLimit, c.currency) : "-"}</TD>
                  <TD className="text-right">{formatMoney(c.usedAmount, c.currency)}</TD>
                  <TD className="text-sm">{c.endDate ? formatDate(c.endDate) : "-"}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
