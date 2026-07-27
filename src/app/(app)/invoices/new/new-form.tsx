"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { createInvoice } from "../actions";
import { add, lineNet, lineTax, formatMoney } from "@/lib/money";

interface OLine { id: string; description: string; uom: string | null; orderedQty: string; unitPrice: string; taxRate: string; receivedQty: string; invoicedQty: string; openToInvoice: string }
interface Order { id: string; number: string; supplierId: string; supplier: string; currency: string; lines: OLine[] }
interface LineState { include: boolean; quantity: string; unitPrice: string; taxRate: string }

export function NewInvoiceForm({ orders, preselectOrderId }: { orders: Order[]; preselectOrderId: string }) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(preselectOrderId || orders[0]?.id || "");
  const [number, setNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [withholding, setWithholding] = useState("0");
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const order = orders.find((o) => o.id === orderId);

  function get(l: OLine): LineState {
    return lines[l.id] ?? { include: true, quantity: l.openToInvoice, unitPrice: l.unitPrice, taxRate: l.taxRate };
  }
  function upd(l: OLine, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [l.id]: { ...get(l), ...patch } }));
  }

  const activeLines = order?.lines.filter((l) => get(l).include) ?? [];
  const net = add(...activeLines.map((l) => lineNet(get(l).quantity || "0", get(l).unitPrice || "0")));
  const tax = add(...activeLines.map((l) => { const s = get(l); return lineTax(lineNet(s.quantity || "0", s.unitPrice || "0"), s.taxRate || "0"); }));
  const grand = add(net, tax);

  async function submit() {
    if (!order) return;
    if (!number.trim()) { setError("Fatura numarasÄ± zorunlu."); return; }
    setBusy(true); setError("");
    const res = await createInvoice({
      supplierId: order.supplierId,
      orderId,
      number,
      invoiceDate,
      dueDate: dueDate || undefined,
      currency: order.currency,
      withholdingAmount: withholding || "0",
      lines: activeLines.map((l) => { const s = get(l); return { orderLineId: l.id, description: l.description, quantity: s.quantity || "0", unitPrice: s.unitPrice || "0", taxRate: s.taxRate || "0" }; }),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/invoices/${res.data.id}`);
  }

  if (orders.length === 0) {
    return <Card><EmptyState title="Faturalanabilir sipariÅŸ yok" hint="Mal kabul yapÄ±lmÄ±ÅŸ sipariÅŸler burada listelenir." /></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Fatura Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>SipariÅŸ *</Label>
            <Select value={orderId} onChange={(e) => { setOrderId(e.target.value); setLines({}); }}>
              {orders.map((o) => (<option key={o.id} value={o.id}>{o.number} Â· {o.supplier}</option>))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fatura No *</Label>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Ã–rn: FT2026000123" />
          </div>
          <div className="space-y-1.5">
            <Label>Fatura Tarihi *</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Vade Tarihi</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fatura Kalemleri (mal kabulden Ã¶nden dolu)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH></TH><TH>Kalem</TH><TH className="text-right">Sip.</TH><TH className="text-right">Teslim</TH><TH className="text-right">Fatura Miktar</TH><TH className="text-right">Birim Fiyat</TH><TH className="text-right">KDV%</TH><TH className="text-right">Net</TH></TR>
            </THead>
            <TBody>
              {order?.lines.map((l) => {
                const s = get(l);
                return (
                  <TR key={l.id}>
                    <TD><input type="checkbox" checked={s.include} onChange={(e) => upd(l, { include: e.target.checked })} /></TD>
                    <TD className="font-medium">{l.description}</TD>
                    <TD className="text-right text-muted-foreground">{l.orderedQty} {l.uom ?? ""}</TD>
                    <TD className="text-right">{l.receivedQty}</TD>
                    <TD><Input className="h-8 w-20 text-right" disabled={!s.include} value={s.quantity} onChange={(e) => upd(l, { quantity: e.target.value })} /></TD>
                    <TD><Input className="h-8 w-24 text-right" disabled={!s.include} value={s.unitPrice} onChange={(e) => upd(l, { unitPrice: e.target.value })} /></TD>
                    <TD><Input className="h-8 w-16 text-right" disabled={!s.include} value={s.taxRate} onChange={(e) => upd(l, { taxRate: e.target.value })} /></TD>
                    <TD className="text-right">{s.include ? formatMoney(lineNet(s.quantity || "0", s.unitPrice || "0"), order.currency) : "-"}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div className="space-y-1.5">
            <Label>Tevkifat TutarÄ±</Label>
            <Input value={withholding} onChange={(e) => setWithholding(e.target.value)} className="w-40" />
          </div>
          <div className="text-right text-sm">
            <div>Net: <b>{formatMoney(net, order?.currency ?? "TRY")}</b></div>
            <div>KDV: <b>{formatMoney(tax, order?.currency ?? "TRY")}</b></div>
            <div className="text-base">Genel Toplam: <b>{formatMoney(grand, order?.currency ?? "TRY")}</b></div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>Ä°ptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : "FaturayÄ± Kaydet ve EÅŸleÅŸtir"}</Button>
      </div>
    </div>
  );
}
