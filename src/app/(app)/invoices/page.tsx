import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Faturalar" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission(PERMISSIONS.INVOICE_VIEW);
  const sp = await searchParams;
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: user.tenantId, ...(sp.status ? { status: sp.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { supplier: true, order: true },
  });

  return (
    <div>
      <PageHeader title="Faturalar" description="Üçlü eşleştirme (PO–Mal Kabul–Fatura) ve ödeme takibi." />
      <Card>
        {invoices.length === 0 ? (
          <EmptyState title="Fatura yok" hint="Fatura girişi veya e-Fatura entegrasyonu ile faturalar burada görünür." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fatura No</TH>
                <TH>Tedarikçi</TH>
                <TH>Sipariş</TH>
                <TH className="text-right">Tutar</TH>
                <TH>Vade</TH>
                <TH>Durum</TH>
                <TH>Ödeme</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD className="font-medium">{i.number}</TD>
                  <TD>{i.supplier.legalName}</TD>
                  <TD className="text-sm text-muted-foreground">{i.order?.number ?? "-"}</TD>
                  <TD className="text-right font-medium">{formatMoney(i.grandTotal, i.currency)}</TD>
                  <TD className="text-sm">{i.dueDate ? formatDate(i.dueDate) : "-"}</TD>
                  <TD><StatusBadge status={i.status} /></TD>
                  <TD><StatusBadge status={i.paymentStatus} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
