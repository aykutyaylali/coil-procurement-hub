import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { add, sub, toStr, formatMoney } from "@/lib/money";
import { lmeUsdPerKg } from "@/domain/lme-pricing";
import { aggregateSarcamSummary, aggregateByMaterial, aggregateByOrder, type CopperLineRow } from "@/domain/lme-reports";

export const metadata: Metadata = { title: "LME & Sarcam Raporları" };

export default async function LmeReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const sp = await searchParams;

  const from = sp.from ? new Date(sp.from) : new Date(new Date().getFullYear(), 0, 1);
  const to = sp.to ? new Date(sp.to + "T23:59:59") : new Date();
  const supplierId = sp.supplierId || "";
  const status = sp.status || "";
  const q = (sp.q || "").trim().toLocaleLowerCase("tr-TR");

  const suppliers = await prisma.supplier.findMany({ where: { tenantId: user.tenantId }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" } });

  // Onaylı LME kayıtları (a)
  const lmeRecords = await prisma.lmeRecord.findMany({
    where: { tenantId: user.tenantId, priceDate: { gte: from, lte: to } },
    orderBy: { priceDate: "desc" }, take: 100,
  });

  // Bakır PO satırları (b/c/d/e)
  const poLines = await prisma.purchaseOrderLine.findMany({
    where: {
      pricingType: "LME_COPPER",
      order: {
        tenantId: user.tenantId, orderDate: { gte: from, lte: to },
        ...(supplierId ? { supplierId } : {}), ...(status ? { status } : {}),
      },
    },
    include: { order: { include: { supplier: { select: { legalName: true } } } } },
  });

  const rows: CopperLineRow[] = poLines
    .filter((l) => (q ? l.description.toLocaleLowerCase("tr-TR").includes(q) : true))
    .map((l) => ({
      orderId: l.orderId, orderNumber: l.order.number, supplierName: l.order.supplier.legalName,
      orderDate: l.order.orderDate, status: l.order.status, description: l.description,
      qtyKg: l.quantity ?? "0", unitUsdPerKg: l.unitPrice ?? "0", usdTryRate: l.usdTryRate ?? "0",
      lmeUsdPerTon: l.lmeUsdPerTon ?? "0", lmeCoefficient: l.lmeCoefficient ?? "1",
      premiumUsdPerKg: l.premiumUsdPerKg ?? "0", extraCostUsdPerKg: l.extraCostUsdPerKg ?? "0", lmePriceDate: l.lmePriceDate,
    }));

  const summary = aggregateSarcamSummary(rows);
  const byMaterial = aggregateByMaterial(rows);
  const byOrder = aggregateByOrder(rows);

  // Fatura bakiyesi (d): sipariş başına faturalanan kg + TL
  const orderIds = [...new Set(rows.map((r) => r.orderId))];
  const invoices = orderIds.length
    ? await prisma.invoice.findMany({ where: { tenantId: user.tenantId, orderId: { in: orderIds }, deletedAt: null }, select: { orderId: true, invoicedQtyKg: true, grandTotal: true } })
    : [];
  const invByOrder = new Map<string, { kg: string; tl: string }>();
  for (const i of invoices) {
    const cur = invByOrder.get(i.orderId!) ?? { kg: "0", tl: "0" };
    invByOrder.set(i.orderId!, { kg: toStr(add(cur.kg, i.invoicedQtyKg ?? "0"), 3), tl: toStr(add(cur.tl, i.grandTotal), 2) });
  }

  return (
    <div>
      <PageHeader title="LME & Sarcam Raporları" description="Bakır (LME bazlı) alımlar için trend ve bakiye analizleri." />

      {/* Filtreler */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1"><label className="text-xs font-medium">Başlangıç</label><input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Bitiş</label><input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Tedarikçi</label>
              <select name="supplierId" defaultValue={supplierId} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}</select>
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">PO Durumu</label>
              <select name="status" defaultValue={status} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{["APPROVED", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "INVOICED", "CLOSED"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </div>
            <div className="space-y-1"><label className="text-xs font-medium">Malzeme (ara)</label>
              <div className="flex gap-1"><input name="q" defaultValue={sp.q ?? ""} placeholder="bakır tel…" className="h-9 w-full rounded-md border bg-background px-2 text-sm" /><button className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground">Uygula</button></div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* (e) Sarcam toplam özeti */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Toplam KG" main={`${Number(summary.totalKg).toLocaleString("tr-TR")} kg`} sub={`${summary.lineCount} satır`} />
        <Metric label="Toplam Tutar" main={formatMoney(summary.totalTry, "TRY")} sub={`${formatMoney(summary.totalUsd, "USD")}`} />
        <Metric label="Ort. USD/kg" main={summary.avgUsdPerKg} sub="net tel fiyatı" />
        <Metric label="Ort. TL/kg" main={summary.avgTryPerKg} sub="net tel fiyatı" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* (a) LME Bakır Geçmişi */}
        <Card>
          <CardHeader><CardTitle className="text-base">LME Bakır Geçmişi (Spot & Haftalık Ort.)</CardTitle></CardHeader>
          <CardContent className="p-0">
            {lmeRecords.length === 0 ? <EmptyState title="Kayıt yok" /> : (
              <Table>
                <THead><TR><TH>Tarih</TH><TH>Tip</TH><TH className="text-right">USD/ton</TH><TH className="text-right">USD/kg</TH></TR></THead>
                <TBody>{lmeRecords.map((r) => (
                  <TR key={r.id}><TD>{formatDate(r.priceDate)}</TD><TD><Badge tone={r.kind === "WEEKLY_AVG" ? "info" : "default"}>{r.kind === "WEEKLY_AVG" ? "Haftalık" : "Spot"}</Badge></TD><TD className="text-right font-mono">{Number(r.usdPerTon).toLocaleString("tr-TR")}</TD><TD className="text-right font-mono">{lmeUsdPerKg(r.usdPerTon)}</TD></TR>
                ))}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* (b) Sarcam Prim/İşçilik Değişim Geçmişi */}
        <Card>
          <CardHeader><CardTitle className="text-base">İşçilik / Prim Değişim Geçmişi</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? <EmptyState title="Veri yok" /> : (
              <Table>
                <THead><TR><TH>Sipariş Tarihi</TH><TH>PO</TH><TH>Malzeme</TH><TH className="text-right">İşçilik/Prim USD/kg</TH><TH className="text-right">Ek USD/kg</TH></TR></THead>
                <TBody>{[...rows].sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime()).slice(0, 30).map((r, i) => (
                  <TR key={i}><TD>{formatDate(r.orderDate)}</TD><TD className="font-medium">{r.orderNumber}</TD><TD className="text-xs">{r.description}</TD><TD className="text-right font-mono">{r.premiumUsdPerKg}</TD><TD className="text-right font-mono">{r.extraCostUsdPerKg}</TD></TR>
                ))}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* (c) Malzeme Bazında Trend */}
        <Card>
          <CardHeader><CardTitle className="text-base">Malzeme Bazında (Ort. LME / Prim / TL-kg)</CardTitle></CardHeader>
          <CardContent className="p-0">
            {byMaterial.length === 0 ? <EmptyState title="Veri yok" /> : (
              <Table>
                <THead><TR><TH>Malzeme</TH><TH className="text-right">Adet</TH><TH className="text-right">Ort. LME $/t</TH><TH className="text-right">Ort. İşçilik</TH><TH className="text-right">Ort. USD/kg</TH><TH className="text-right">Ort. TL/kg</TH></TR></THead>
                <TBody>{byMaterial.map((m) => (
                  <TR key={m.description}><TD className="font-medium">{m.description}</TD><TD className="text-right">{m.count}</TD><TD className="text-right font-mono">{Number(m.avgLmeUsdTon).toLocaleString("tr-TR")}</TD><TD className="text-right font-mono">{m.avgPremium}</TD><TD className="text-right font-mono">{m.avgUsdKg}</TD><TD className="text-right font-mono font-medium">{m.avgTlKg}</TD></TR>
                ))}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* (d) PO Bazında LME & Fatura Bakiye */}
        <Card>
          <CardHeader><CardTitle className="text-base">PO Bazında LME & Fatura Bakiye</CardTitle></CardHeader>
          <CardContent className="p-0">
            {byOrder.length === 0 ? <EmptyState title="Veri yok" /> : (
              <Table>
                <THead><TR><TH>PO</TH><TH>Tedarikçi</TH><TH className="text-right">LME $/t</TH><TH className="text-right">Sip. KG</TH><TH className="text-right">Fatura KG</TH><TH className="text-right">Bakiye TL</TH></TR></THead>
                <TBody>{byOrder.map((o) => {
                  const inv = invByOrder.get(o.orderId) ?? { kg: "0", tl: "0" };
                  const balTl = toStr(sub(o.netTry, inv.tl), 2);
                  return <TR key={o.orderId}><TD className="font-medium">{o.orderNumber}</TD><TD className="text-xs">{o.supplierName}</TD><TD className="text-right font-mono">{Number(o.lmeUsdPerTon).toLocaleString("tr-TR")}</TD><TD className="text-right font-mono">{Number(o.orderedKg).toLocaleString("tr-TR")}</TD><TD className="text-right font-mono">{Number(inv.kg).toLocaleString("tr-TR")}</TD><TD className={`text-right font-mono ${Number(balTl) < 0 ? "text-destructive" : ""}`}>{formatMoney(balTl, "TRY")}</TD></TR>;
                })}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{main}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
