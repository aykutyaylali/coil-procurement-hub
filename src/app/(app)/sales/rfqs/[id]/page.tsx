import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { translator, type Locale } from "@/lib/i18n";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate } from "@/lib/dates";
import { countryFlag } from "@/lib/country";
import { ConvertToOfferButton } from "./convert-button";

export default async function SalesRfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const T = translator(user.locale as Locale);
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
            <Badge tone={statusTone(rfq.status)}>{T(`salesRfq.status.${rfq.status}`)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{countryFlag(rfq.customer.country)} {rfq.customer.name} · {formatDate(rfq.requestDate)}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && rfq.status !== "CANCELLED" && rfq.status !== "REJECTED" && (
            <ConvertToOfferButton rfqId={rfq.id} />
          )}
          <Link href="/sales/rfqs" className="text-sm text-primary hover:underline">← {T("salesRfq.detail.backToList")}</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{T("salesRfq.detail.info")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={T("salesRfq.detail.customer")} value={`${countryFlag(rfq.customer.country)} ${rfq.customer.name}`} />
            <Row label={T("salesRfq.detail.industry")} value={rfq.industry ?? "—"} />
            <Row label={T("salesRfq.detail.coilType")} value={rfq.coilType?.replace(/_/g, " ") ?? "—"} />
            <Row label={T("salesRfq.detail.salesRep")} value={rep?.name ?? "—"} />
            <Row label={T("salesRfq.detail.targetDate")} value={rfq.targetDate ? formatDate(rfq.targetDate) : "—"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{T("salesRfq.detail.notes")}</CardTitle></CardHeader>
          <CardContent className="text-sm">{rfq.notes ? <p className="whitespace-pre-wrap">{rfq.notes}</p> : <p className="text-muted-foreground">{T("salesRfq.detail.noNotes")}</p>}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">{T("salesRfq.detail.offers", { n: rfq.offers.length })}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {rfq.offers.length === 0 ? <p className="text-muted-foreground">{T("salesRfq.detail.noOffers")}</p> : rfq.offers.map((o) => (
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
