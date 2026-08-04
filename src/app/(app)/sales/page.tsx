import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { translator, type Locale } from "@/lib/i18n";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import {
  computePipeline, computeConversion, topByWinRate, repBreakdown, monthlyTrend,
  type OfferRow, type RfqRow,
} from "@/domain/sales-analytics";
import { FunnelChart, TrendChart, MoneyChips } from "./dashboard-widgets";

export const metadata: Metadata = { title: "Satış Paneli" };

export default async function SalesDashboardPage() {
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const T = translator(user.locale as Locale);
  const t = user.tenantId;

  const [customerCount, rfqsRaw, offersRaw, users] = await Promise.all([
    prisma.customer.count({ where: { tenantId: t, isActive: true } }),
    prisma.salesRFQ.findMany({ where: { tenantId: t, deletedAt: null }, take: 5000, select: { status: true, customerId: true, industry: true, offers: { where: { deletedAt: null }, select: { id: true } } } }),
    prisma.salesOffer.findMany({ where: { tenantId: t, deletedAt: null }, take: 5000, select: { status: true, currency: true, totalAmount: true, salesRepId: true, customerId: true, offerDate: true } }),
    prisma.user.findMany({ where: { tenantId: t }, select: { id: true, name: true } }),
  ]);

  const customers = await prisma.customer.findMany({ where: { tenantId: t }, select: { id: true, name: true, industry: true } });
  const customerName = Object.fromEntries(customers.map((c) => [c.id, c.name] as const));
  const customerIndustry = Object.fromEntries(customers.map((c) => [c.id, c.industry] as const));
  const repName = Object.fromEntries(users.map((u) => [u.id, u.name] as const));

  const rfqRows: RfqRow[] = rfqsRaw.map((r) => ({ status: r.status, customerId: r.customerId, industry: r.industry, hasOffer: r.offers.length > 0 }));
  const offerRows: OfferRow[] = offersRaw.map((o) => ({ status: o.status, currency: o.currency, totalAmount: o.totalAmount, salesRepId: o.salesRepId, customerId: o.customerId, offerDate: o.offerDate }));

  const pipeline = computePipeline(rfqRows, offerRows);
  const conv = computeConversion(rfqRows, offerRows);
  const topCustomers = topByWinRate(offerRows, (o) => o.customerId, 5);
  const topIndustries = topByWinRate(offerRows, (o) => customerIndustry[o.customerId] ?? null, 5);
  const reps = repBreakdown(offerRows).filter((r) => r.openCount + r.orderCount > 0).sort((a, b) => b.orderCount - a.orderCount);
  const trendEUR = monthlyTrend(offerRows, "EUR", 6);
  const trendUSD = monthlyTrend(offerRows, "USD", 6);
  const trendTRY = monthlyTrend(offerRows, "TRY", 6);

  return (
    <div>
      <PageHeader title={T("salesDash.title")} description={T("salesDash.description")} />

      {/* Dönüşüm & kazanma oranları */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={T("salesDash.kpi.activeCustomers")} value={String(customerCount)} href="/sales/customers" />
        <Kpi label={T("salesDash.kpi.rfqConversion")} value={`%${conv.rfqToOfferRate}`} sub={T("salesDash.kpi.rfqConvSub", { withOffer: conv.rfqWithOffer, total: conv.rfqTotal })} href="/sales/rfqs" />
        <Kpi label={T("salesDash.kpi.winRate")} value={`%${conv.winRate}`} sub={T("salesDash.kpi.winRateSub", { orders: conv.orderCount, total: conv.offerTotal })} href="/sales/offers" />
        <Kpi label={T("salesDash.kpi.decidedWinRate")} value={`%${conv.decidedWinRate}`} sub={T("salesDash.kpi.decidedWinRateSub", { orders: conv.orderCount, total: conv.decidedCount })} href="/sales/offers?status=ORDER" />
      </div>

      {/* Pipeline / Huni */}
      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base">{T("salesDash.funnel.title")}</CardTitle></CardHeader>
        <CardContent>
          {offerRows.length === 0 && conv.rfqTotal === 0 ? <p className="text-sm text-muted-foreground">{T("salesDash.noDataYet")}</p> : <FunnelChart stages={pipeline} />}
        </CardContent>
      </Card>

      {/* Top 5 müşteri & sektör */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <TopTable title={T("salesDash.top.customers")} rows={topCustomers} nameOf={(k) => customerName[k] ?? k} locale={user.locale as Locale} />
        <TopTable title={T("salesDash.top.industries")} rows={topIndustries} nameOf={(k) => k} locale={user.locale as Locale} />
      </div>

      {/* Satış temsilcisi performansı */}
      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base">{T("salesDash.rep.title")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {reps.length === 0 ? <EmptyState title={T("salesDash.noOffers")} /> : (
            <Table>
              <THead><TR><TH>{T("salesDash.rep.col.rep")}</TH><TH className="text-center">{T("salesDash.rep.col.open")}</TH><TH>{T("salesDash.rep.col.openAmount")}</TH><TH className="text-center">{T("salesDash.rep.col.order")}</TH><TH>{T("salesDash.rep.col.orderAmount")}</TH></TR></THead>
              <TBody>{reps.map((r) => (
                <TR key={r.key}>
                  <TD className="font-medium">{r.key === "__none__" ? T("salesDash.rep.unassigned") : repName[r.key] ?? r.key}</TD>
                  <TD className="text-center tabular-nums">{r.openCount}</TD>
                  <TD><MoneyChips amount={r.openAmount} /></TD>
                  <TD className="text-center tabular-nums">{r.orderCount}</TD>
                  <TD><MoneyChips amount={r.orderAmount} /></TD>
                </TR>
              ))}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Aylık trend */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{T("salesDash.trend.title")}</CardTitle>
            {/* Tek global lejant — para birimi başına tekrar edilmez. */}
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-blue-500/70" /> {T("salesDash.legend.offer")}</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-green-500/70" /> {T("salesDash.legend.order")}</span>
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-3">
          {[["EUR", trendEUR], ["USD", trendUSD], ["TRY", trendTRY]].map(([cur, pts]) => {
            const points = pts as typeof trendEUR;
            return points.length === 0
              ? <div key={cur as string} className="text-sm text-muted-foreground">{T("salesDash.currencyNoData", { currency: cur as string })}</div>
              : <TrendChart key={cur as string} currency={cur as string} points={points} locale={user.locale as Locale} />;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, href }: { label: string; value: string; sub?: string; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:border-primary/50">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function TopTable({ title, rows, nameOf, locale }: { title: string; rows: { key: string; offers: number; orders: number; winRate: number }[]; nameOf: (k: string) => string; locale: Locale }) {
  const T = translator(locale);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? <EmptyState title={T("salesDash.noOffers")} /> : (
          <Table>
            <THead><TR><TH>{T("salesDash.top.col.name")}</TH><TH className="text-center">{T("salesDash.top.col.offer")}</TH><TH className="text-center">{T("salesDash.top.col.order")}</TH><TH className="text-right">{T("salesDash.top.col.winPct")}</TH></TR></THead>
            <TBody>{rows.map((r) => (
              <TR key={r.key}>
                <TD className="font-medium">{nameOf(r.key)}</TD>
                <TD className="text-center tabular-nums">{r.offers}</TD>
                <TD className="text-center tabular-nums">{r.orders}</TD>
                <TD className="text-right tabular-nums">
                  <span className={r.winRate >= 50 ? "text-green-600" : r.winRate > 0 ? "text-amber-600" : "text-muted-foreground"}>%{r.winRate}</span>
                </TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
