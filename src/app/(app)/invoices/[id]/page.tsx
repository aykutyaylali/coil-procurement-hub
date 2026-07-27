import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney, d } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { InvoiceActions } from "./panel";
import type { MatchResult } from "@/domain/invoice/matching";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { supplier: true, order: true, matches: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!invoice) notFound();

  let match: MatchResult | null = null;
  try { if (invoice.matches[0]) match = JSON.parse(invoice.matches[0].result); } catch { match = null; }

  const canApprove = userCan(user, PERMISSIONS.INVOICE_APPROVE);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{invoice.number}</h1>
            <StatusBadge status={invoice.status} />
            <StatusBadge status={invoice.paymentStatus} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.supplier.legalName}
            {invoice.order ? <> · Sipariş: <Link href={`/orders/${invoice.orderId}`} className="text-primary hover:underline">{invoice.order.number}</Link></> : null}
            {" "}· {formatDate(invoice.invoiceDate)}
          </p>
        </div>
        <Link href="/invoices" className="text-sm text-primary hover:underline">â† Listeye dön</Link>
      </div>

      {invoice.status === "BLOCKED" && invoice.blockReason && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <b>Fatura bloke:</b> {invoice.blockReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Üçlü Eşleştirme (PO–Mal Kabul–Fatura)</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!match ? (
                <p className="p-6 text-sm text-muted-foreground">Eşleştirme verisi yok.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Kalem</TH>
                      <TH className="text-right">Sip. Mik/Fiyat</TH>
                      <TH className="text-right">Teslim</TH>
                      <TH className="text-right">Önce Fat.</TH>
                      <TH className="text-right">Bu Fatura</TH>
                      <TH className="text-right">Mik. Fark</TH>
                      <TH className="text-right">Fiyat Fark</TH>
                      <TH>Durum</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {match.lines.map((l, i) => (
                      <TR key={i}>
                        <TD className="font-medium">{l.description}</TD>
                        <TD className="text-right text-sm">{l.orderedQty} / {formatMoney(l.orderedPrice, invoice.currency)}</TD>
                        <TD className="text-right">{l.receivedQty}</TD>
                        <TD className="text-right">{l.prevInvoicedQty}</TD>
                        <TD className="text-right">{l.thisQty} / {formatMoney(l.thisPrice, invoice.currency)}</TD>
                        <TD className={`text-right ${d(l.qtyDiff).greaterThan(0) ? "text-destructive" : ""}`}>{l.qtyDiff}</TD>
                        <TD className={`text-right ${!d(l.priceDiff).isZero() ? "text-warning" : ""}`}>{formatMoney(l.priceDiff, invoice.currency)}</TD>
                        <TD><Badge tone={l.withinTolerance ? "success" : "danger"}>{l.withinTolerance ? "Uygun" : "Tolerans Dışı"}</Badge></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <div className="space-y-1 border-t p-4 text-sm">
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">Net</span><span className="w-32 text-right">{formatMoney(invoice.netAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">KDV</span><span className="w-32 text-right">{formatMoney(invoice.taxAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">Tevkifat</span><span className="w-32 text-right">-{formatMoney(invoice.withholdingAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8 font-semibold"><span>Ödenecek</span><span className="w-32 text-right">{formatMoney(invoice.payableAmount, invoice.currency)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>İşlemler</CardTitle></CardHeader>
            <CardContent><InvoiceActions id={invoice.id} status={invoice.status} canApprove={canApprove} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Para Birimi" value={invoice.currency} />
              <Row label="Vade" value={invoice.dueDate ? formatDate(invoice.dueDate) : "-"} />
              <Row label="Kaynak" value={invoice.source} />
              <Row label="Genel Toplam" value={formatMoney(invoice.grandTotal, invoice.currency)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
