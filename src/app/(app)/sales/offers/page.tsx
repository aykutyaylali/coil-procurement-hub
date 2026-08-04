import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { add, d, toStr } from "@/lib/money";
import { countryFlag } from "@/lib/country";
import { OFFER_STATUS, OFFER_STATUS_LABEL, OFFER_CURRENCIES, revisionLabel } from "./status";

export const metadata: Metadata = { title: "Müşteri Teklifleri" };

type Sp = Record<string, string | undefined>;

export default async function SalesOffersPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const sp = await searchParams;

  const where: Record<string, unknown> = { tenantId: user.tenantId, deletedAt: null };
  if (sp.status) where.status = sp.status;
  if (sp.customerId) where.customerId = sp.customerId;
  if (sp.salesRepId) where.salesRepId = sp.salesRepId;
  if (sp.currency) where.currency = sp.currency;
  if (sp.industry) where.customer = { industry: sp.industry };
  if (sp.from || sp.to) where.offerDate = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) };

  const [offers, customers, salesReps, allForSummary] = await Promise.all([
    prisma.salesOffer.findMany({ where, orderBy: { offerDate: "desc" }, take: 300, include: { customer: { select: { name: true, country: true, industry: true } } } }),
    prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.salesOffer.findMany({ where: { tenantId: user.tenantId, deletedAt: null }, select: { status: true, currency: true, totalAmount: true } }),
  ]);
  const repName = Object.fromEntries(salesReps.map((r) => [r.id, r.name] as const));

  // Özet: durum × para birimi toplamları (decimal.js)
  type SumKey = "OPEN" | "ORDER" | "CLOSED";
  const summary: Record<SumKey, Record<string, string>> = {
    OPEN: Object.fromEntries(OFFER_CURRENCIES.map((c) => [c, "0"])),
    ORDER: Object.fromEntries(OFFER_CURRENCIES.map((c) => [c, "0"])),
    CLOSED: Object.fromEntries(OFFER_CURRENCIES.map((c) => [c, "0"])),
  };
  const isSumKey = (s: string): s is SumKey => s === "OPEN" || s === "ORDER" || s === "CLOSED";
  const isCur = (c: string): boolean => (OFFER_CURRENCIES as readonly string[]).includes(c);
  for (const o of allForSummary) {
    if (!isSumKey(o.status) || !isCur(o.currency)) continue;
    const row = summary[o.status];
    row[o.currency] = toStr(add(d(row[o.currency] ?? "0"), d(o.totalAmount || "0")));
  }

  const SUMMARY_CARDS: { key: "OPEN" | "ORDER" | "CLOSED"; label: string; tone: string }[] = [
    { key: "OPEN", label: "Açık Teklifler", tone: "border-blue-500/40" },
    { key: "ORDER", label: "Siparişe Dönüşen", tone: "border-green-500/40" },
    { key: "CLOSED", label: "Kapanan", tone: "border-muted" },
  ];

  return (
    <div>
      <PageHeader title="Müşteri Teklifleri" description="Sales Offer — teklif portföyü ve tutar özeti." />

      <div className="grid gap-4 sm:grid-cols-3">
        {SUMMARY_CARDS.map((c) => (
          <Card key={c.key} className={`border-l-4 ${c.tone}`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {OFFER_CURRENCIES.map((cur) => (
                <div key={cur} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{cur}</span>
                  <span className="font-medium tabular-nums">{formatMoney(summary[c.key][cur] ?? "0", cur)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="my-4">
        <CardContent className="pt-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1"><label className="text-xs font-medium">Durum</label><select name="status" defaultValue={sp.status ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{OFFER_STATUS.map((s) => <option key={s} value={s}>{OFFER_STATUS_LABEL[s]}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Müşteri</label><select name="customerId" defaultValue={sp.customerId ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Sektör</label><select name="industry" defaultValue={sp.industry ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{["OEM", "REPAIR", "UTILITY", "OTHER"].map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Satış Temsilcisi</label><select name="salesRepId" defaultValue={sp.salesRepId ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Para Birimi</label><select name="currency" defaultValue={sp.currency ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{OFFER_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-1">
              <div className="space-y-1"><label className="text-xs font-medium">Başlangıç</label><input type="date" name="from" defaultValue={sp.from ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Bitiş</label><input type="date" name="to" defaultValue={sp.to ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
            </div>
            <div className="flex items-end lg:col-span-6"><button className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">Filtrele</button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {offers.length === 0 ? <EmptyState title="Teklif bulunamadı" hint="RFQ detayından 'Teklife Dönüştür' ile teklif oluşturun." /> : (
          <Table>
            <THead><TR><TH>Teklif No</TH><TH>Müşteri</TH><TH>Sektör</TH><TH>Temsilci</TH><TH>Tarih</TH><TH>Rev</TH><TH className="text-right">Tutar</TH><TH>Durum</TH></TR></THead>
            <TBody>{offers.map((o) => (
              <TR key={o.id}>
                <TD><Link href={`/sales/offers/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link></TD>
                <TD>{countryFlag(o.customer.country)} {o.customer.name}</TD>
                <TD className="text-sm text-muted-foreground">{o.customer.industry ?? "—"}</TD>
                <TD className="text-sm">{o.salesRepId ? repName[o.salesRepId] ?? "—" : "—"}</TD>
                <TD className="text-sm text-muted-foreground">{formatDate(o.offerDate)}</TD>
                <TD className="text-xs text-muted-foreground">{revisionLabel(o.revisionNo)}</TD>
                <TD className="text-right font-medium tabular-nums">{formatMoney(o.totalAmount, o.currency)}</TD>
                <TD><Badge tone={statusTone(o.status)}>{OFFER_STATUS_LABEL[o.status] ?? o.status}</Badge>{o.invoiced && <span className="ml-1 text-xs text-green-600">✓ Faturalı</span>}</TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
