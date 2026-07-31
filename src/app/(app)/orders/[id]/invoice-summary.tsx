import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { add, sub, toStr, formatMoney, formatQty } from "@/lib/money";
import { formatDate } from "@/lib/dates";

interface Receipt { id: string; number: string; waybillNo: string | null; receivedAt: Date; lines: { acceptedQty: string; rejectedQty: string }[] }
interface Invoice { id: string; number: string; invoiceDate: Date; currency: string; netAmount: string; grandTotal: string; invoicedQtyKg: string | null; lmeMode: string | null; lmeRecordId: string | null; invoiceUsdTryRate: string | null; lines: { quantity: string }[] }

/**
 * PO "Kısmi Fatura & Teslimat Özeti" — KG bazlı bakiye + parça teslimat/fatura takibi.
 * Tüm KG/TL toplamları decimal.js ile hesaplanır.
 */
export function PoInvoiceSummary({
  orderedKg, currency, grandTotal, receipts, invoices,
}: {
  orderedKg: string; currency: string; grandTotal: string; receipts: Receipt[]; invoices: Invoice[];
}) {
  const receiptKg = (r: Receipt) => r.lines.reduce((acc, l) => add(acc, l.acceptedQty), add(0));
  const invoiceKg = (inv: Invoice) => (inv.invoicedQtyKg && Number(inv.invoicedQtyKg) > 0 ? add(inv.invoicedQtyKg) : inv.lines.reduce((acc, l) => add(acc, l.quantity), add(0)));

  const receivedKg = receipts.reduce((acc, r) => add(acc, receiptKg(r)), add(0));
  const invoicedKg = invoices.reduce((acc, i) => add(acc, invoiceKg(i)), add(0));
  const invoicedTl = invoices.reduce((acc, i) => add(acc, i.grandTotal), add(0));
  const remainingKg = sub(orderedKg, receivedKg.toString());
  const remainingTl = sub(grandTotal, invoicedTl.toString());

  const modeLabel = (m: string | null) => (m === "INVOICE_PERIOD" ? "Fatura Dönemi LME/Kur" : m === "ORDER" ? "Sipariş LME/Kuru" : "—");

  return (
    <div className="space-y-4">
      {/* Bakiye kartları */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Sipariş Edilen" main={`${formatQty(orderedKg)} kg`} sub={formatMoney(grandTotal, currency)} />
        <Metric label="Teslim Alınan / Faturalanan" main={`${formatQty(toStr(receivedKg, 3))} kg`} sub={`${formatMoney(toStr(invoicedTl, 2), currency)} fatura`} />
        <Metric label="Kalan Bakiye" main={`${formatQty(toStr(remainingKg, 3))} kg`} sub={formatMoney(toStr(remainingTl, 2), currency)} tone={Number(remainingKg.toString()) < 0 ? "danger" : "default"} />
      </div>

      {/* Teslimatlar (GRN) */}
      <Card>
        <CardHeader><CardTitle className="text-base">Teslimatlar (Mal Kabul)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {receipts.length === 0 ? <EmptyState title="Henüz mal kabul yok." /> : (
            <Table>
              <THead><TR><TH>Tarih</TH><TH>Mal Kabul No</TH><TH>İrsaliye</TH><TH className="text-right">Teslim Alınan (kg)</TH></TR></THead>
              <TBody>
                {receipts.map((r) => (
                  <TR key={r.id}><TD>{formatDate(r.receivedAt)}</TD><TD className="font-medium">{r.number}</TD><TD className="text-muted-foreground">{r.waybillNo ?? "—"}</TD><TD className="text-right font-mono">{formatQty(toStr(receiptKg(r), 3))}</TD></TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Kısmi Faturalar */}
      <Card>
        <CardHeader><CardTitle className="text-base">Kısmi Faturalar (3-Yönlü Eşleştirme)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? <EmptyState title="Henüz fatura yok." /> : (
            <Table>
              <THead><TR><TH>Fatura Tarihi/No</TH><TH className="text-right">Fatura Edilen (kg)</TH><TH>LME/Kur Modu</TH><TH className="text-right">Fatura Kuru</TH><TH className="text-right">Net Tutar</TH><TH className="text-right">Genel Toplam</TH></TR></THead>
              <TBody>
                {invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD><div className="font-medium">{inv.number}</div><div className="text-xs text-muted-foreground">{formatDate(inv.invoiceDate)}</div></TD>
                    <TD className="text-right font-mono">{formatQty(toStr(invoiceKg(inv), 3))}</TD>
                    <TD>{inv.lmeMode ? <Badge tone={inv.lmeMode === "INVOICE_PERIOD" ? "info" : "default"}>{modeLabel(inv.lmeMode)}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                    <TD className="text-right font-mono">{inv.invoiceUsdTryRate ?? "—"}</TD>
                    <TD className="text-right">{formatMoney(inv.netAmount, inv.currency)}</TD>
                    <TD className="text-right font-medium">{formatMoney(inv.grandTotal, inv.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, main, sub, tone = "default" }: { label: string; main: string; sub: string; tone?: "default" | "danger" }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${tone === "danger" ? "text-destructive" : ""}`}>{main}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
