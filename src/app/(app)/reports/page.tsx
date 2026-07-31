import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, d } from "@/lib/money";
import { opLabel } from "@/domain/operations";
import { computeReports, type ReportFilters } from "@/domain/reports";
import { computeOperationalMetrics } from "@/domain/metrics-data";
import type { MetricResult } from "@/domain/metrics";

export const metadata: Metadata = { title: "Raporlar" };

function BarList({ items, currency = "TRY", max, hrefBase }: { items: { key: string; value: string; count?: number; id?: string }[]; currency?: string; max?: string; hrefBase?: (i: { key: string; id?: string }) => string | null }) {
  const top = max ?? (items[0]?.value ?? "1");
  return (
    <div className="space-y-1.5">
      {items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Veri yok</p>}
      {items.map((i) => {
        const pct = d(top).isZero() ? 0 : d(i.value).dividedBy(top).times(100).toNumber();
        const href = hrefBase?.(i);
        const label = <span className="truncate">{i.key}{i.count != null ? <span className="text-muted-foreground"> ({i.count})</span> : null}</span>;
        return (
          <div key={i.key} className="flex items-center gap-2 text-sm">
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted/40">
              <div className="absolute inset-y-0 left-0 bg-primary/20" style={{ width: `${Math.max(2, pct)}%` }} />
              <div className="absolute inset-0 flex items-center px-2">{href ? <Link href={href} className="truncate text-primary hover:underline">{i.key}</Link> : label}</div>
            </div>
            <span className="w-32 shrink-0 text-right font-medium">{formatMoney(i.value, currency)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-lg font-semibold ${ok ? "" : "text-muted-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <Card className={href ? "transition-shadow hover:shadow-md" : ""}>
      <CardContent className="p-4">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const sp = await searchParams;
  const f: ReportFilters = {
    dateFrom: sp.dateFrom, dateTo: sp.dateTo, categoryId: sp.categoryId,
    supplierId: sp.supplierId, operationType: sp.operationType, currency: sp.currency, status: sp.status,
  };

  const [data, metrics, categories, suppliers] = await Promise.all([
    computeReports(user.tenantId, f),
    computeOperationalMetrics(user.tenantId),
    prisma.category.findMany({ where: { tenantId: user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { tenantId: user.tenantId }, select: { id: true, legalName: true }, orderBy: { legalName: "asc" }, take: 300 }),
  ]);

  const metricDisplay = (m: MetricResult, suffix = "") =>
    m.sufficient ? (m.unit === "amount" ? formatMoney(m.value, "TRY") : `${m.value}${m.unit === "percent" ? "%" : m.unit === "days" ? " gün" : ""}${suffix}`) : `Veri yetersiz (${m.count})`;

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="Raporlar" description="Gerçek verilerden hesaplanan harcama ve performans analizleri." />
      <Link href="/reports/lme" className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50">
        <span className="font-medium text-amber-800 dark:text-amber-200">🟠 LME &amp; Sarcam Raporları — bakır (LME bazlı) alım trendleri ve fatura bakiye analizi</span>
        <span className="text-amber-700 dark:text-amber-300">→</span>
      </Link>

      {/* Filtreler */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" method="get">
            <div><label className="text-xs text-muted-foreground">Başlangıç</label><input type="date" name="dateFrom" defaultValue={f.dateFrom} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Bitiş</label><input type="date" name="dateTo" defaultValue={f.dateTo} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" /></div>
            <div><label className="text-xs text-muted-foreground">Kategori</label>
              <select name="categoryId" defaultValue={f.categoryId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Tümü</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label className="text-xs text-muted-foreground">Tedarikçi</label>
              <select name="supplierId" defaultValue={f.supplierId ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Tümü</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.legalName}</option>)}
              </select></div>
            <div><label className="text-xs text-muted-foreground">Operasyon</label>
              <select name="operationType" defaultValue={f.operationType ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Tümü</option>
                <option value="DOMESTIC_PURCHASE">Yurt İçi</option><option value="IMPORT_PURCHASE">İthalat</option><option value="EXPORT_RELATED_PURCHASE">İhracat Bağlantılı</option>
              </select></div>
            <div><label className="text-xs text-muted-foreground">Para Birimi</label>
              <select name="currency" defaultValue={f.currency ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Tümü</option><option value="TRY">TRY</option><option value="EUR">EUR</option><option value="USD">USD</option>
              </select></div>
            <div className="flex items-end gap-2">
              <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Filtrele</button>
              <Link href="/reports" className="flex h-9 items-center rounded-md border px-4 text-sm">Sıfırla</Link>
            </div>
            <div className="flex items-end gap-2">
              <a href={`/reports/export?${qs}`} className="flex h-9 items-center rounded-md border px-4 text-sm font-medium text-primary hover:bg-accent">CSV</a>
              <a href={`/reports/pdf?${qs}`} target="_blank" rel="noopener" className="flex h-9 items-center rounded-md border px-4 text-sm font-medium text-primary hover:bg-accent">PDF</a>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-6">
        <Card><CardContent className="p-4"><div className="text-xl font-semibold text-primary">{formatMoney(data.totalSpend, "TRY")}</div><div className="text-xs text-muted-foreground">Toplam Harcama (TL)</div></CardContent></Card>
        <Stat label="Sipariş" value={data.orderCount} href={`/orders`} />
        <Stat label="Kalem" value={data.lineCount} />
        <Stat label="Tedarikçi" value={data.supplierCount} href="/suppliers" />
        <Stat label="Açık Sipariş" value={data.openOrders} />
        <Stat label="Geciken" value={data.lateOrders} />
      </div>

      {/* Operasyonel metrikler (canlı veriden; yetersizse "veri yetersiz") */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Operasyonel Performans Metrikleri</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard label="OTIF (Zamanında & Tam)" value={metricDisplay(metrics.otif)} ok={metrics.otif.sufficient} />
            <MetricCard label="Onay Bekleme Süresi" value={metricDisplay(metrics.approvalWaiting)} ok={metrics.approvalWaiting.sufficient} />
            <MetricCard label="Talep→Sipariş Çevrim" value={metricDisplay(metrics.reqCycleTime)} ok={metrics.reqCycleTime.sufficient} />
            <MetricCard label="Tasarruf" value={metricDisplay(metrics.savings)} ok={metrics.savings.sufficient} />
            <MetricCard label="Tasarruf %" value={metricDisplay(metrics.savingsPct)} ok={metrics.savingsPct.sufficient} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Bu metrikler canlı işlem verisinden (mal kabul/onay/award zaman damgaları) hesaplanır. Geçmiş içe aktarımda bu adımlar bulunmadığından
            yeterli veri yoksa &quot;veri yetersiz&quot; gösterilir; yeni canlı akışlar biriktikçe otomatik hesaplanır.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Kategori Bazlı Harcama</CardTitle></CardHeader>
          <CardContent><BarList items={data.byCategory} hrefBase={(i) => { const c = categories.find((x) => x.name === i.key); return c ? `/reports?categoryId=${c.id}` : null; }} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tedarikçi Bazlı Harcama (İlk 20)</CardTitle></CardHeader>
          <CardContent><BarList items={data.bySupplier} hrefBase={(i) => i.id ? `/reports?supplierId=${i.id}` : null} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Operasyon Türü</CardTitle></CardHeader>
          <CardContent><BarList items={data.byOperationType.map((o) => ({ ...o, key: opLabel(o.key) }))} hrefBase={(i) => { const code = data.byOperationType.find((o) => opLabel(o.key) === i.key)?.key; return code ? `/reports?operationType=${code}` : null; }} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Para Birimi Dağılımı (TL karşılığı)</CardTitle></CardHeader>
          <CardContent><BarList items={data.byCurrency} hrefBase={(i) => `/reports?currency=${i.key}`} /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Aylık Harcama Trendi</CardTitle></CardHeader>
          <CardContent><BarList items={data.byMonth} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Talep Eden Bazlı Harcama</CardTitle></CardHeader>
          <CardContent><BarList items={data.byRequester} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Durum Dağılımı</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Detaylı liste ve durum filtreleri için <Link href="/orders" className="text-primary hover:underline">Siparişler</Link> sayfasını kullanın.</p>
            <p className="mt-2">Aktif filtre: {qs ? qs.replace(/&/g, " · ") : "yok"}</p>
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Not: OTIF, çevrim süresi, onay bekleme, teklif katılımı ve tasarruf metrikleri canlı işlem verisi biriktikçe otomatik hesaplanır; geçmiş içe aktarımda bu operasyonel adımlar bulunmadığından ilgili kartlar canlı akıştan beslenir. Harcama, kategori, tedarikçi, operasyon türü, para birimi, aylık trend ve talep eden kırılımları gerçek veriden hesaplanır.
      </p>
    </div>
  );
}
