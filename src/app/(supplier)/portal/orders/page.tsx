import Link from "next/link";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { translator, type Locale, type TranslationKey } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata = { title: "Siparişlerim / My Orders" };

export default async function PortalOrdersPage() {
  const user = await requireUser();
  const T = translator(user.locale as Locale);

  // İZOLASYON: yalnız kullanıcının bağlı olduğu tedarikçinin (supplierId) siparişleri
  const orders = user.supplierId
    ? await prisma.purchaseOrder.findMany({
        where: { tenantId: user.tenantId, supplierId: user.supplierId, deletedAt: null },
        orderBy: { orderDate: "desc" },
        take: 200,
        select: { id: true, number: true, status: true, productionStage: true, grandTotal: true, currency: true, orderDate: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{T("portal.myOrders")}</h1>
      <Card>
        {orders.length === 0 ? (
          <EmptyState title={T("portal.ordersEmpty")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("portal.orderNo")}</TH>
                <TH>{T("common.status")}</TH>
                <TH>{T("portal.production")}</TH>
                <TH className="text-right">{T("common.amount")}</TH>
                <TH>{T("common.date")}</TH>
              </TR>
            </THead>
            <TBody>
              {orders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/portal/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link>
                  </TD>
                  <TD><StatusBadge status={o.status} /></TD>
                  <TD>{o.productionStage ? <Badge tone="info">{T(`po.production.stage.${o.productionStage}` as TranslationKey)}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TD>
                  <TD className="text-right">{formatMoney(o.grandTotal, o.currency)}</TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(o.orderDate)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
