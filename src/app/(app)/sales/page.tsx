import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { countryFlag } from "@/lib/country";
import { add, d, toStr } from "@/lib/money";
import { RFQ_STATUS_LABEL } from "./rfqs/rfq-row-actions";

export const metadata: Metadata = { title: "Satış Paneli" };

export default async function SalesDashboardPage() {
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const t = user.tenantId;

  const [customerCount, rfqByStatus, openOffers, recentRfqs] = await Promise.all([
    prisma.customer.count({ where: { tenantId: t, isActive: true } }),
    prisma.salesRFQ.groupBy({ by: ["status"], where: { tenantId: t, deletedAt: null }, _count: { _all: true } }),
    prisma.salesOffer.findMany({ where: { tenantId: t, deletedAt: null, status: "OPEN" }, select: { currency: true, totalAmount: true } }),
    prisma.salesRFQ.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: { requestDate: "desc" }, take: 8, include: { customer: { select: { name: true, country: true } } } }),
  ]);

  const rfqCount = rfqByStatus.reduce((s, r) => s + r._count._all, 0);
  const statusMap = Object.fromEntries(rfqByStatus.map((r) => [r.status, r._count._all]));
  const openByCurrency = openOffers.reduce<Record<string, string>>((acc, o) => {
    acc[o.currency] = toStr(add(d(acc[o.currency] ?? "0"), d(String(o.totalAmount))));
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="Satış Paneli" description="Sales CRM & CPQ — müşteri talep ve tekliflerine genel bakış." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Aktif Müşteri" value={customerCount} href="/sales/customers" />
        <Kpi label="Toplam Talep" value={rfqCount} href="/sales/rfqs" />
        <Kpi label="İşlemde" value={statusMap["IN_PROCESS"] ?? 0} href="/sales/rfqs?status=IN_PROCESS" />
        <Kpi label="Açık Teklif" value={openOffers.length} href="/sales/offers" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Talep Durum Dağılımı</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rfqCount === 0 ? <p className="text-sm text-muted-foreground">Henüz talep yok.</p> : Object.entries(RFQ_STATUS_LABEL).map(([k, label]) => {
              const c = statusMap[k] ?? 0;
              const pct = rfqCount ? Math.round((c / rfqCount) * 100) : 0;
              return (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-28"><Badge tone={statusTone(k)}>{label}</Badge></span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{c}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Açık Teklif Tutarı (Para Birimi)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.keys(openByCurrency).length === 0 ? <p className="text-muted-foreground">Açık teklif yok.</p> : Object.entries(openByCurrency).map(([cur, amt]) => (
              <div key={cur} className="flex items-center justify-between border-b pb-1">
                <span className="font-medium">{cur}</span>
                <span className="tabular-nums">{Number(amt).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Son Talepler</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {recentRfqs.length === 0 ? <p className="text-muted-foreground">Henüz talep yok.</p> : recentRfqs.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b pb-1">
              <Link href={`/sales/rfqs/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link>
              <span className="flex items-center gap-3 text-muted-foreground"><span>{countryFlag(r.customer.country)} {r.customer.name}</span><span>{formatDate(r.requestDate)}</span><Badge tone={statusTone(r.status)}>{RFQ_STATUS_LABEL[r.status] ?? r.status}</Badge></span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
