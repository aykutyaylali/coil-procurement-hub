import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.CATALOG_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.CATALOG_MANAGE);

  const item = await prisma.item.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { category: true, baseUom: true },
  });
  if (!item) notFound();

  // Fiyat geçmişi: bu ürünü referanslayan sipariş satırları (canlı) + son alış
  const priceHistory = await prisma.purchaseOrderLine.findMany({
    where: { itemId: item.id, order: { tenantId: user.tenantId } },
    select: { unitPrice: true, currency: true, order: { select: { number: true, orderDate: true, supplier: { select: { legalName: true } } } } },
    orderBy: { order: { orderDate: "desc" } }, take: 20,
  });

  let preferred: string[] = [];
  try { preferred = item.preferredSuppliers ? JSON.parse(item.preferredSuppliers) : []; } catch { /* */ }
  const prefSuppliers = preferred.length ? await prisma.supplier.findMany({ where: { id: { in: preferred } }, select: { id: true, legalName: true } }) : [];
  let conversions: { fromUom: string; toUom: string; factor: string }[] = [];
  try { conversions = item.unitConversions ? JSON.parse(item.unitConversions) : []; } catch { /* */ }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{item.code}</h1>
            <Badge tone={item.isService ? "info" : "default"}>{item.isService ? T("cat.type.service") : T("cat.type.material")}</Badge>
            {!item.isActive && <Badge tone="danger">{T("cat.detail.inactive")}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.name}{item.category ? ` · ${item.category.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && <Link href={`/catalog/${item.id}/edit`} className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">{T("cat.detail.edit")}</Link>}
          <Link href="/catalog" className="text-sm text-primary hover:underline">{T("cat.detail.backToList")}</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{T("cat.detail.priceHistory")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>{T("cat.detail.colOrder")}</TH><TH>{T("cat.detail.colSupplier")}</TH><TH className="text-right">{T("cat.detail.colUnitPrice")}</TH><TH>{T("cat.detail.colDate")}</TH></TR></THead>
                <TBody>
                  {priceHistory.length === 0 && <TR><TD colSpan={4} className="py-4 text-center text-sm text-muted-foreground">{T("cat.detail.noHistory")} {item.lastPurchasePrice ? formatMoney(item.lastPurchasePrice, item.lastPurchaseCurrency ?? "TRY") : "-"}</TD></TR>}
                  {priceHistory.map((p, i) => (
                    <TR key={i}>
                      <TD>{p.order.number}</TD>
                      <TD className="text-sm">{p.order.supplier.legalName}</TD>
                      <TD className="text-right">{formatMoney(p.unitPrice, p.currency ?? "TRY")}</TD>
                      <TD className="text-sm text-muted-foreground">{formatDate(p.order.orderDate)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {conversions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{T("cat.detail.unitConversions")}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {conversions.map((c, i) => <div key={i}>1 {c.fromUom} = {c.factor} {c.toUom}</div>)}
              </CardContent>
            </Card>
          )}

          {item.specs && <Card><CardHeader><CardTitle>{T("cat.detail.specs")}</CardTitle></CardHeader><CardContent className="text-sm">{item.specs}</CardContent></Card>}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{T("cat.detail.summary")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={T("cat.detail.uom")} value={item.baseUom?.code ?? "-"} />
              <Row label={T("cat.detail.brand")} value={item.brand ?? "-"} />
              <Row label={T("cat.detail.manufacturer")} value={item.manufacturer ?? "-"} />
              <Row label={T("cat.detail.gtip")} value={item.gtipCode ?? "-"} />
              <Row label={T("cat.detail.minOrder")} value={item.minOrderQty ?? "-"} />
              <Row label={T("cat.detail.leadTime")} value={item.leadTimeDays ? `${item.leadTimeDays} ${T("cat.detail.days")}` : "-"} />
              <Row label={T("cat.detail.lastPurchase")} value={item.lastPurchasePrice ? formatMoney(item.lastPurchasePrice, item.lastPurchaseCurrency ?? "TRY") : "-"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{T("cat.detail.preferredSuppliers")}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {prefSuppliers.length === 0 && <p className="text-muted-foreground">{T("cat.detail.notDefined")}</p>}
              {prefSuppliers.map((s) => <div key={s.id}>{s.legalName}</div>)}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
