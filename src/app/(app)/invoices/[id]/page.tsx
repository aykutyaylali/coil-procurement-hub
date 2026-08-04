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
import { translator, type Locale } from "@/lib/i18n";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const T = translator(user.locale as Locale);

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
            <StatusBadge status={invoice.status} locale={user.locale} />
            <StatusBadge status={invoice.paymentStatus} locale={user.locale} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.supplier.legalName}
            {invoice.order ? <> · {T("inv.order")}: <Link href={`/orders/${invoice.orderId}`} className="text-primary hover:underline">{invoice.order.number}</Link></> : null}
            {" "}· {formatDate(invoice.invoiceDate)}
          </p>
        </div>
        <Link href="/invoices" className="text-sm text-primary hover:underline">← {T("inv.backToList")}</Link>
      </div>

      {invoice.status === "BLOCKED" && invoice.blockReason && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <b>{T("inv.blocked")}:</b> {invoice.blockReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{T("inv.match.title")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!match ? (
                <p className="p-6 text-sm text-muted-foreground">{T("inv.match.noData")}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{T("inv.match.item")}</TH>
                      <TH className="text-right">{T("inv.match.orderedQtyPrice")}</TH>
                      <TH className="text-right">{T("inv.match.received")}</TH>
                      <TH className="text-right">{T("inv.match.prevInvoiced")}</TH>
                      <TH className="text-right">{T("inv.match.thisInvoice")}</TH>
                      <TH className="text-right">{T("inv.match.qtyDiff")}</TH>
                      <TH className="text-right">{T("inv.match.priceDiff")}</TH>
                      <TH>{T("inv.col.status")}</TH>
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
                        <TD><Badge tone={l.withinTolerance ? "success" : "danger"}>{l.withinTolerance ? T("inv.match.withinTolerance") : T("inv.match.outOfTolerance")}</Badge></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <div className="space-y-1 border-t p-4 text-sm">
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">{T("inv.net")}</span><span className="w-32 text-right">{formatMoney(invoice.netAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">{T("inv.vat")}</span><span className="w-32 text-right">{formatMoney(invoice.taxAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8"><span className="text-muted-foreground">{T("inv.withholding")}</span><span className="w-32 text-right">-{formatMoney(invoice.withholdingAmount, invoice.currency)}</span></div>
                <div className="flex justify-end gap-8 font-semibold"><span>{T("inv.payable")}</span><span className="w-32 text-right">{formatMoney(invoice.payableAmount, invoice.currency)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{T("inv.actions")}</CardTitle></CardHeader>
            <CardContent><InvoiceActions id={invoice.id} status={invoice.status} canApprove={canApprove} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{T("inv.summary")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={T("inv.currency")} value={invoice.currency} />
              <Row label={T("inv.col.due")} value={invoice.dueDate ? formatDate(invoice.dueDate) : "-"} />
              <Row label={T("inv.sourceLabel")} value={invoice.source} />
              <Row label={T("inv.grandTotal")} value={formatMoney(invoice.grandTotal, invoice.currency)} />
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
