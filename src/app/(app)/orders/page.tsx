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

export const metadata: Metadata = { title: "Siparişler" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePermission(PERMISSIONS.ORDER_VIEW);
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
      <PageHeader title="Satınalma Siparişleri" description="Onaylı tekliflerden oluşan siparişleri yönetin." />
      <Card>
        {orders.length === 0 ? (
          <EmptyState title="Henüz sipariş yok" hint="RFQ karara bağlandığında sipariş otomatik oluşur." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Sipariş No</TH>
                <TH>Tedarikçi</TH>
                <TH>Şirket</TH>
                <TH className="text-center">Kalem</TH>
                <TH className="text-right">Tutar</TH>
                <TH>Durum</TH>
                <TH>Tarih</TH>
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
                    <StatusBadge status={o.status} />
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
