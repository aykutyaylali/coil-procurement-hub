import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { countryFlag } from "@/lib/country";
import { RFQ_STATUS_LABEL } from "../rfq-row-actions";
import { ConvertToOfferButton } from "./convert-button";

export default async function SalesRfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const canManage = userCan(user, PERMISSIONS.SALES_MANAGE);

  const rfq = await prisma.salesRFQ.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { customer: true, offers: { where: { deletedAt: null }, orderBy: { offerDate: "desc" } } },
  });
  if (!rfq) notFound();
  const rep = rfq.salesRepId ? await prisma.user.findUnique({ where: { id: rfq.salesRepId }, select: { name: true } }) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{rfq.number}</h1>
            <Badge tone={statusTone(rfq.status)}>{RFQ_STATUS_LABEL[rfq.status] ?? rfq.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{countryFlag(rfq.customer.country)} {rfq.customer.name} · {formatDate(rfq.requestDate)}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && rfq.status !== "CANCELLED" && rfq.status !== "REJECTED" && (
            <ConvertToOfferButton rfqId={rfq.id} />
          )}
          <Link href="/sales/rfqs" className="text-sm text-primary hover:underline">← Liste</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Talep Bilgileri</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Müşteri" value={`${countryFlag(rfq.customer.country)} ${rfq.customer.name}`} />
            <Row label="Sektör" value={rfq.industry ?? "—"} />
            <Row label="Bobin Tipi" value={rfq.coilType?.replace(/_/g, " ") ?? "—"} />
            <Row label="Satış Temsilcisi" value={rep?.name ?? "—"} />
            <Row label="Hedef Tarih" value={rfq.targetDate ? formatDate(rfq.targetDate) : "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Notlar</CardTitle></CardHeader>
          <CardContent className="text-sm">{rfq.notes ? <p className="whitespace-pre-wrap">{rfq.notes}</p> : <p className="text-muted-foreground">Not yok.</p>}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Teklifler ({rfq.offers.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rfq.offers.length === 0 ? <p className="text-muted-foreground">Bu talebe bağlı teklif yok.</p> : rfq.offers.map((o) => (
            <div key={o.id} className="flex items-center justify-between border-b pb-1">
              <Link href={`/sales/offers/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link>
              <span className="flex items-center gap-2"><Badge tone={statusTone(o.status)}>{o.status}</Badge><span className="text-muted-foreground">{Number(o.totalAmount).toLocaleString("tr-TR")} {o.currency}</span></span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
