"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { createGoodsReceipt } from "../actions";
import { RECEIPT_DISPOSITIONS, label } from "@/domain/labels";

interface OLine { id: string; lineNo: number; description: string; uom: string | null; quantity: string; openQty: string }
interface Order { id: string; number: string; supplier: string; currency: string; lines: OLine[] }
interface LineState { acceptedQty: string; rejectedQty: string; disposition: string; lotNumber: string; binLocation: string; note: string }

export function NewReceiptForm({
  orders,
  warehouses,
  preselectOrderId,
}: {
  orders: Order[];
  warehouses: { id: string; name: string }[];
  preselectOrderId: string;
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState(preselectOrderId || orders[0]?.id || "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [waybillNo, setWaybillNo] = useState("");
  const [note, setNote] = useState("");
  const [qualityRequired, setQualityRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const order = orders.find((o) => o.id === orderId);
  const [lines, setLines] = useState<Record<string, LineState>>({});

  function getLine(id: string, openQty: string): LineState {
    return lines[id] ?? { acceptedQty: openQty, rejectedQty: "0", disposition: "ACCEPTED", lotNumber: "", binLocation: "", note: "" };
  }
  function update(id: string, patch: Partial<LineState>, openQty: string) {
    setLines((prev) => ({ ...prev, [id]: { ...getLine(id, openQty), ...patch } }));
  }

  async function submit() {
    if (!order) return;
    setError("");
    setBusy(true);
    const res = await createGoodsReceipt({
      orderId,
      warehouseId: warehouseId || undefined,
      waybillNo: waybillNo || undefined,
      note: note || undefined,
      qualityRequired,
      lines: order.lines.map((l) => {
        const s = getLine(l.id, l.openQty);
        return {
          orderLineId: l.id,
          acceptedQty: s.acceptedQty || "0",
          rejectedQty: s.rejectedQty || "0",
          disposition: s.disposition,
          lotNumber: s.lotNumber || undefined,
          binLocation: s.binLocation || undefined,
          note: s.note || undefined,
        };
      }),
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/receipts/${res.data.id}`);
  }

  if (orders.length === 0) {
    return (
      <Card>
        <EmptyState title="Açık sipariş yok" hint="Mal kabul için açık miktarı olan onaylı/gönderilmiş sipariş gerekir." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Sipariş ve Teslimat Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>Sipariş *</Label>
            <Select value={orderId} onChange={(e) => { setOrderId(e.target.value); setLines({}); }}>
              {orders.map((o) => (<option key={o.id} value={o.id}>{o.number} · {o.supplier}</option>))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ambar</Label>
            <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">Seçiniz</option>
              {warehouses.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>İrsaliye No</Label>
            <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="Örn: A-123456" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={qualityRequired} onChange={(e) => setQualityRequired(e.target.checked)} />
              Kalite kontrolü gerekli
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Kabul Kalemleri</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Kalem</TH>
                <TH className="text-right">Sip. Miktar</TH>
                <TH className="text-right">Açık</TH>
                <TH className="text-right">Kabul</TH>
                <TH className="text-right">Ret</TH>
                <TH>Durum</TH>
                <TH>Lot/Seri</TH>
                <TH>Raf</TH>
              </TR>
            </THead>
            <TBody>
              {order?.lines.map((l) => {
                const s = getLine(l.id, l.openQty);
                return (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.description}</TD>
                    <TD className="text-right">{l.quantity} {l.uom ?? ""}</TD>
                    <TD className="text-right text-muted-foreground">{l.openQty}</TD>
                    <TD><Input className="h-8 w-20 text-right" value={s.acceptedQty} onChange={(e) => update(l.id, { acceptedQty: e.target.value }, l.openQty)} /></TD>
                    <TD><Input className="h-8 w-20 text-right" value={s.rejectedQty} onChange={(e) => update(l.id, { rejectedQty: e.target.value }, l.openQty)} /></TD>
                    <TD>
                      <Select className="h-8" value={s.disposition} onChange={(e) => update(l.id, { disposition: e.target.value }, l.openQty)}>
                        {RECEIPT_DISPOSITIONS.map((code) => (<option key={code} value={code}>{label(code, "tr")}</option>))}
                      </Select>
                    </TD>
                    <TD><Input className="h-8 w-24" value={s.lotNumber} onChange={(e) => update(l.id, { lotNumber: e.target.value }, l.openQty)} /></TD>
                    <TD><Input className="h-8 w-20" value={s.binLocation} onChange={(e) => update(l.id, { binLocation: e.target.value }, l.openQty)} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Label>Açıklama</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mal kabul açıklaması" />
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : "Mal Kabulü Kaydet"}</Button>
      </div>
    </div>
  );
}
