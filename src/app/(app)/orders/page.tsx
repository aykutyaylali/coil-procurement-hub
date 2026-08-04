import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination, parsePage, pageArgs } from "@/components/ui/pagination";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Siparişler" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePermission(PERMISSIONS.ORDER_VIEW);
  const T = translator(user.locale as Locale);
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const where = { tenantId: user.tenantId };

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page),
      select: {
        id: true, number: true, grandTotal: true, currency: true, status: true, orderDate: true,
        supplier: { select: { legalName: true } },
        company: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return (
    <div>
      <PageHeader title={T("ordPage.title")} description={T("ordPage.subtitle")} />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title={T("ordPage.empty")} hint={T("ordPage.emptyHint")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("ordPage.colNumber")}</TH>
                <TH>{T("ordPage.colSupplier")}</TH>
                <TH>{T("ordPage.colCompany")}</TH>
                <TH className="text-center">{T("ordPage.colLines")}</TH>
                <TH className="text-right">{T("ordPage.colAmount")}</TH>
                <TH>{T("ordPage.colStatus")}</TH>
                <TH>{T("ordPage.colDate")}</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">
                      {o.number}
                    </Link>
                  </TD>
                  <TD>{o.supplier.legalName}</TD>
                  <TD className="text-sm">{o.company.name}</TD>
                  <TD className="text-center">{o._count.lines}</TD>
                  <TD className="text-right font-medium">{formatMoney(o.grandTotal, o.currency)}</TD>
                  <TD>
                    <StatusBadge status={o.status} locale={user.locale} />
                  </TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(o.orderDate)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} total={total} basePath="/orders" />
    </div>
  );
}
