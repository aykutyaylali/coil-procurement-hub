import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { countryFlag } from "@/lib/country";
import { SalesRfqRowActions, RFQ_STATUS, RFQ_STATUS_LABEL } from "./rfq-row-actions";

export const metadata: Metadata = { title: "Müşteri Talepleri" };

export default async function SalesRfqsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const canManage = userCan(user, PERMISSIONS.SALES_MANAGE);
  const sp = await searchParams;

  const where: Record<string, unknown> = { tenantId: user.tenantId, deletedAt: null };
  if (sp.status) where.status = sp.status;
  if (sp.customerId) where.customerId = sp.customerId;
  if (sp.salesRepId) where.salesRepId = sp.salesRepId;
  if (sp.industry) where.industry = sp.industry;
  if (sp.from || sp.to) where.requestDate = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) };

  const [rfqs, customers, salesReps] = await Promise.all([
    prisma.salesRFQ.findMany({ where, orderBy: { requestDate: "desc" }, take: 300, include: { customer: { select: { name: true, country: true } }, offers: { select: { id: true } } } }),
    prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const repName = Object.fromEntries(salesReps.map((r) => [r.id, r.name] as const));

  return (
    <div>
      <PageHeader title="Müşteri Talepleri" description="Sales RFQ — müşteri taleplerini yönetin, teklife dönüştürün." action={canManage ? { label: "Yeni Talep", href: "/sales/rfqs/new" } : undefined} />

      <Card className="mb-4">
        <CardContent className="pt-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1"><label className="text-xs font-medium">Durum</label><select name="status" defaultValue={sp.status ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{RFQ_STATUS.map((s) => <option key={s} value={s}>{RFQ_STATUS_LABEL[s]}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Müşteri</label><select name="customerId" defaultValue={sp.customerId ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Satış Temsilcisi</label><select name="salesRepId" defaultValue={sp.salesRepId ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Sektör</label><select name="industry" defaultValue={sp.industry ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Tümü</option>{["OEM", "REPAIR", "UTILITY", "OTHER"].map((i) => <option key={i} value={i}>{i}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">Başlangıç</label><input type="date" name="from" defaultValue={sp.from ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">Bitiş</label><div className="flex gap-1"><input type="date" name="to" defaultValue={sp.to ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /><button className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground">Filtrele</button></div></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {rfqs.length === 0 ? <EmptyState title="Talep bulunamadı" hint={canManage ? "Yeni Talep ile ekleyin." : undefined} /> : (
          <Table>
            <THead><TR><TH>No</TH><TH>Müşteri</TH><TH>Sektör</TH><TH>Bobin</TH><TH>Satış Temsilcisi</TH><TH>Tarih</TH><TH>Teklif</TH><TH>Durum</TH><TH className="text-right">İşlem</TH></TR></THead>
            <TBody>{rfqs.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/sales/rfqs/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link></TD>
                <TD>{countryFlag(r.customer.country)} {r.customer.name}</TD>
                <TD className="text-sm text-muted-foreground">{r.industry ?? "—"}</TD>
                <TD className="text-xs">{r.coilType?.replace(/_/g, " ") ?? "—"}</TD>
                <TD className="text-sm">{r.salesRepId ? repName[r.salesRepId] ?? "—" : "—"}</TD>
                <TD className="text-sm text-muted-foreground">{formatDate(r.requestDate)}</TD>
                <TD className="text-center text-xs">{r.offers.length || "—"}</TD>
                <TD><Badge tone={statusTone(r.status)}>{RFQ_STATUS_LABEL[r.status] ?? r.status}</Badge></TD>
                <TD className="text-right"><SalesRfqRowActions id={r.id} status={r.status} canManage={canManage} /></TD>
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
