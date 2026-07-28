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

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.CATALOG_VIEW);
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
            <Badge tone={item.isService ? "info" : "default"}>{item.isService ? "Hizmet" : "Malzeme"}</Badge>
            {!item.isActive && <Badge tone="danger">Pasif</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{item.name}{item.category ? ` · ${item.category.name}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && <Link href={`/catalog/${item.id}/edit`} className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">Düzenle</Link>}
          <Link href="/catalog" className="text-sm text-primary hover:underline">← Listeye dön</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Fiyat Geçmişi</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>Sipariş</TH><TH>Tedarikçi</TH><TH className="text-right">Birim Fiyat</TH><TH>Tarih</TH></TR></THead>
                <TBody>
                  {priceHistory.length === 0 && <TR><TD colSpan={4} className="py-4 text-center text-sm text-muted-foreground">Bu ürün için sipariş geçmişi yok. Son alış: {item.lastPurchasePrice ? formatMoney(item.lastPurchasePrice, item.lastPurchaseCurrency ?? "TRY") : "-"}</TD></TR>}
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
              <CardHeader><CardTitle>Birim Dönüşümleri</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {conversions.map((c, i) => <div key={i}>1 {c.fromUom} = {c.factor} {c.toUom}</div>)}
              </CardContent>
            </Card>
          )}

          {item.specs && <Card><CardHeader><CardTitle>Teknik Özellikler</CardTitle></CardHeader><CardContent className="text-sm">{item.specs}</CardContent></Card>}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Birim" value={item.baseUom?.code ?? "-"} />
              <Row label="Marka" value={item.brand ?? "-"} />
              <Row label="Üretici" value={item.manufacturer ?? "-"} />
              <Row label="GTİP" value={item.gtipCode ?? "-"} />
              <Row label="Min. Sipariş" value={item.minOrderQty ?? "-"} />
              <Row label="Termin" value={item.leadTimeDays ? `${item.leadTimeDays} gün` : "-"} />
              <Row label="Son Alış" value={item.lastPurchasePrice ? formatMoney(item.lastPurchasePrice, item.lastPurchaseCurrency ?? "TRY") : "-"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Tercih Edilen Tedarikçiler</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {prefSuppliers.length === 0 && <p className="text-muted-foreground">Tanımlı değil</p>}
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
