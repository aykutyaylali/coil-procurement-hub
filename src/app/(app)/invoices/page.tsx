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
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Faturalar" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requirePermission(PERMISSIONS.INVOICE_VIEW);
  const T = translator(user.locale as Locale);
  const canCreate = userCan(user, PERMISSIONS.INVOICE_CREATE);
  const sp = await searchParams;
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: user.tenantId, ...(sp.status ? { status: sp.status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { supplier: true, order: true },
  });

  return (
    <div>
      <PageHeader
        title={T("inv.title")}
        description={T("inv.description")}
        action={canCreate ? { label: T("inv.new"), href: "/invoices/new" } : undefined}
      />
      <Card>
        {invoices.length === 0 ? (
          <EmptyState title={T("inv.empty.title")} hint={T("inv.empty.hint")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("inv.col.number")}</TH>
                <TH>{T("inv.col.supplier")}</TH>
                <TH>{T("inv.col.order")}</TH>
                <TH className="text-right">{T("inv.col.amount")}</TH>
                <TH>{T("inv.col.due")}</TH>
                <TH>{T("inv.col.status")}</TH>
                <TH>{T("inv.col.payment")}</TH>
              </TR>
            </THead>
            <TBody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD><Link href={`/invoices/${i.id}`} className="font-medium text-primary hover:underline">{i.number}</Link></TD>
                  <TD>{i.supplier.legalName}</TD>
                  <TD className="text-sm text-muted-foreground">{i.order?.number ?? "-"}</TD>
                  <TD className="text-right font-medium">{formatMoney(i.grandTotal, i.currency)}</TD>
                  <TD className="text-sm">{i.dueDate ? formatDate(i.dueDate) : "-"}</TD>
                  <TD><StatusBadge status={i.status} locale={user.locale} /></TD>
                  <TD><StatusBadge status={i.paymentStatus} locale={user.locale} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
