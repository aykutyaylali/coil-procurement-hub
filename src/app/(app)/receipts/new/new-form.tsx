"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { createGoodsReceipt } from "../actions";
import { RECEIPT_DISPOSITIONS, label } from "@/domain/labels";
import { formatQty, parseTrNumber } from "@/lib/money";

interface OLine { id: string; lineNo: number; description: string; uom: string | null; quantity: string; openQty: string }
interface Order { id: string; number: string; supplier: string; currency: string; lines: OLine[] }
interface LineState { acceptedQty: string; rejectedQty: string; disposition: string; lotNumber: string; binLocation: string; note: string }

const TOLERANCE_PCT = 3; // KG bazlı teslimatta ±%3 tolerans (kantar sapması)
/** Bu sevkiyat sonrası toplam teslim alınan miktarın sipariş miktarına sapması (%). */
function deviationPct(l: OLine, acceptedQty: string): number {
  const ordered = Number(parseTrNumber(l.quantity));
  if (!(ordered > 0)) return 0;
  const receivedSoFar = ordered - Number(parseTrNumber(l.openQty));
  const after = receivedSoFar + Number(parseTrNumber(acceptedQty || "0"));
  return ((after - ordered) / ordered) * 100;
}

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
  const [tolConfirmed, setTolConfirmed] = useState(false);

  const order = orders.find((o) => o.id === orderId);
  const [lines, setLines] = useState<Record<string, LineState>>({});

  function getLine(id: string, openQty: string): LineState {
    return lines[id] ?? { acceptedQty: openQty, rejectedQty: "0", disposition: "ACCEPTED", lotNumber: "", binLocation: "", note: "" };
  }
  function update(id: string, patch: Partial<LineState>, openQty: string) {
    setLines((prev) => ({ ...prev, [id]: { ...getLine(id, openQty), ...patch } }));
  }

  const outOfTol = (order?.lines ?? []).filter((l) => Math.abs(deviationPct(l, getLine(l.id, l.openQty).acceptedQty)) > TOLERANCE_PCT);

  async function submit() {
    if (!order) return;
    if (outOfTol.length > 0 && !tolConfirmed) {
      setError(`${outOfTol.length} kalemde teslim miktarı ±%${TOLERANCE_PCT} tolerans dışında. Onaylamak için aşağıdaki kutuyu işaretleyin.`);
      return;
    }
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
                    <TD className="text-right">{formatQty(l.quantity)} {l.uom ?? ""}</TD>
                    <TD className="text-right text-muted-foreground">
                      <div>{l.openQty}</div>
                      <div className="text-[10px]">alınan: {formatQty(Number(parseTrNumber(l.quantity)) - Number(parseTrNumber(l.openQty)))}</div>
                    </TD>
                    <TD>
                      <Input className="h-8 w-20 text-right" value={s.acceptedQty} onChange={(e) => update(l.id, { acceptedQty: e.target.value }, l.openQty)} />
                      {(() => { const dv = deviationPct(l, s.acceptedQty); return Math.abs(dv) > TOLERANCE_PCT ? <div className="mt-0.5 text-[10px] font-semibold text-amber-600">⚠ %{dv > 0 ? "+" : ""}{dv.toFixed(1)}</div> : null; })()}
                    </TD>
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

      {outOfTol.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="font-medium">⚠ Tolerans uyarısı (±%{TOLERANCE_PCT})</div>
          <div className="mt-0.5 text-xs">{outOfTol.length} kalemde teslim alınan miktar sipariş miktarından ±%{TOLERANCE_PCT}'ten fazla sapıyor (kantar farkı olabilir). Devam etmek için onaylayın.</div>
          <label className="mt-1.5 flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={tolConfirmed} onChange={(e) => { setTolConfirmed(e.target.checked); if (e.target.checked) setError(""); }} />
            Tolerans dışı teslimatı onaylıyorum
          </label>
        </div>
      )}
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy || (outOfTol.length > 0 && !tolConfirmed)}>{busy ? "Kaydediliyor..." : "Mal Kabulü Kaydet"}</Button>
      </div>
    </div>
  );
}
