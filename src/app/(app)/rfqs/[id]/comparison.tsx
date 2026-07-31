"use client";
import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, X, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { lineNet, lineTax, add, mul, formatMoney, formatQty, d, toStr } from "@/lib/money";
import { moveRfqToEvaluation } from "../actions";
import { awardRfqAndCreateOrders } from "../award-actions";

interface Line { id: string; lineNo: number; description: string; quantity: string; uom: string | null }
interface BidLine {
  rfqLineId: string; willQuote: boolean; unitPrice: string; discountPct: string; taxRate: string;
  leadTimeDays: number | null; currency: string | null; brand: string | null; model: string | null; note: string | null;
}
interface Bid {
  id: string; supplierId: string; supplierName: string; currency: string; status: string;
  source: string; paymentTermDays: number | null; incoterm: string | null; validUntil: string | null;
  freightAmount: string; note: string | null; submittedAt: string | null; lines: BidLine[];
}

const SOURCE_LABEL: Record<string, string> = { PORTAL: "Tedarikçi portalı", MANUAL: "Satınalma manuel", EMAIL: "E-posta" };

export function Comparison({
  rfqId, rfqStatus, lines, bids, rateMap, canEvaluate, canAward, awarded,
}: {
  rfqId: string; rfqStatus: string; lines: Line[]; bids: Bid[]; rateMap: Record<string, string>;
  canEvaluate: boolean; canAward: boolean; awarded: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string>>({}); // rfqLineId -> bidId
  const [justification, setJustification] = useState("");
  const [lowestReason, setLowestReason] = useState("");
  const [singleReason, setSingleReason] = useState("");
  const [stage, setStage] = useState<1 | 2>(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailBidId, setDetailBidId] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const toTL = useCallback((amount: string, currency: string) => mul(amount, rateMap[currency] ?? "1"), [rateMap]);

  function lineTotal(line: Line, bl: BidLine): string {
    const net = lineNet(line.quantity, bl.unitPrice, bl.discountPct);
    return toStr(add(net, lineTax(net, bl.taxRate)), 2);
  }
  function findBL(bid: Bid, lineId: string) { return bid.lines.find((x) => x.rfqLineId === lineId && x.willQuote) ?? null; }

  // Teklif TL genel toplam + para birimi toplam
  const totals = useMemo(() => {
    const map: Record<string, { grand: string; grandTL: string; maxLead: number | null; missing: number }> = {};
    for (const bid of bids) {
      let grand = add("0"); let grandTL = add("0"); let maxLead: number | null = null; let missing = 0;
      for (const line of lines) {
        const bl = findBL(bid, line.id);
        if (!bl) { missing++; continue; }
        const cur = bl.currency ?? bid.currency;
        const lt = lineTotal(line, bl);
        grand = add(grand, lt);
        grandTL = add(grandTL, toTL(lt, cur));
        if (bl.leadTimeDays != null) maxLead = maxLead == null ? bl.leadTimeDays : Math.max(maxLead, bl.leadTimeDays);
      }
      grand = add(grand, bid.freightAmount || "0");
      grandTL = add(grandTL, toTL(bid.freightAmount || "0", bid.currency));
      map[bid.id] = { grand: toStr(grand, 2), grandTL: toStr(grandTL, 2), maxLead, missing };
    }
    return map;
  }, [bids, lines, toTL]);

  // Rozetler: en düşük TL, en kısa termin
  const lowestBidId = useMemo(() => {
    let best: { id: string; tl: string } | null = null;
    for (const b of bids) { const tl = totals[b.id]!.grandTL; if (!best || d(tl).lessThan(best.tl)) best = { id: b.id, tl }; }
    return best?.id ?? null;
  }, [bids, totals]);
  const shortestLeadBidId = useMemo(() => {
    let best: { id: string; lead: number } | null = null;
    for (const b of bids) { const l = totals[b.id]!.maxLead; if (l != null && (!best || l < best.lead)) best = { id: b.id, lead: l }; }
    return best?.id ?? null;
  }, [bids, totals]);

  // Kalem bazlı en düşük (TL)
  const bestPerLine = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of lines) {
      let best: { bidId: string; tl: string } | null = null;
      for (const bid of bids) {
        const bl = findBL(bid, line.id); if (!bl) continue;
        const tl = toStr(toTL(lineTotal(line, bl), bl.currency ?? bid.currency), 2);
        if (!best || d(tl).lessThan(best.tl)) best = { bidId: bid.id, tl };
      }
      if (best) map[line.id] = best.bidId;
    }
    return map;
  }, [bids, lines, toTL]);

  const canSelect = canAward && !awarded && ["EVALUATION", "NEGOTIATION", "OPEN"].includes(rfqStatus);
  function select(lineId: string, bidId: string) { setSelection((p) => ({ ...p, [lineId]: p[lineId] === bidId ? "" : bidId })); }

  const selectedLines = lines.filter((l) => selection[l.id]);
  const chosenNotLowest = selectedLines.some((l) => bestPerLine[l.id] && bestPerLine[l.id] !== selection[l.id]);
  const isSingleBid = bids.length === 1;
  const distinctSuppliers = new Set(selectedLines.map((l) => bids.find((b) => b.id === selection[l.id])!.supplierId));
  const orderCount = distinctSuppliers.size;

  // Karar özeti satırları
  const summaryRows = selectedLines.map((l) => {
    const bid = bids.find((b) => b.id === selection[l.id])!;
    const bl = findBL(bid, l.id)!;
    const cur = bl.currency ?? bid.currency;
    const lt = lineTotal(l, bl);
    return { line: l, supplierName: bid.supplierName, qty: l.quantity, unitPrice: bl.unitPrice, currency: cur, total: lt, totalTL: toStr(toTL(lt, cur), 2), lead: bl.leadTimeDays };
  });
  const summaryTL = summaryRows.reduce((acc, r) => add(acc, r.totalTL), add("0"));

  function toStage2() {
    setError("");
    if (selectedLines.length === 0) return setError("En az bir kalem için tedarikçi seçin.");
    if (!justification.trim()) return setError("Seçim gerekçesi zorunludur.");
    if (chosenNotLowest && !lowestReason.trim()) return setError("En düşük fiyat seçilmediği için açıklama zorunludur.");
    if (isSingleBid && !singleReason.trim()) return setError("Tek teklif alındığı için açıklama zorunludur.");
    setStage(2);
  }

  async function confirmAward() {
    if (busy) return;
    setBusy(true); setError("");
    const awards = selectedLines.map((l) => {
      const bid = bids.find((b) => b.id === selection[l.id])!;
      return { rfqLineId: l.id, bidId: bid.id, supplierId: bid.supplierId, quantity: l.quantity };
    });
    const reasons = [justification, chosenNotLowest ? `En düşük değil: ${lowestReason}` : "", isSingleBid ? `Tek teklif: ${singleReason}` : ""].filter(Boolean).join(" | ");
    const res = await awardRfqAndCreateOrders({ rfqId, justification: reasons, lowestNotChosenReason: lowestReason || undefined, awards });
    setBusy(false); setConfirming(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(res.data.orderIds);
  }

  async function evaluate() {
    setBusy(true); setError("");
    const res = await moveRfqToEvaluation(rfqId);
    setBusy(false);
    if (!res.ok) setError(res.error); else router.refresh();
  }

  if (bids.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Teklif Karşılaştırma</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Henüz gönderilmiş teklif bulunmuyor.</p></CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-2xl text-success">✓</div>
          <h3 className="text-lg font-semibold">Karar onaylandı, {done.length} sipariş oluşturuldu</h3>
          <div className="flex flex-wrap justify-center gap-2">
            {done.map((id) => <Link key={id} href={`/orders/${id}`} className="rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-accent">Siparişi Aç →</Link>)}
          </div>
          <Link href="/orders" className="block text-sm text-primary hover:underline">Tüm siparişler</Link>
        </CardContent>
      </Card>
    );
  }

  const detailBid = detailBidId ? bids.find((b) => b.id === detailBidId) : null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Teklif Karşılaştırma</CardTitle>
        {canEvaluate && rfqStatus === "OPEN" && (
          <Button size="sm" variant="outline" onClick={evaluate} disabled={busy}>Değerlendirmeye Al</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isSingleBid && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" /> Yalnızca bir tedarikçiden teklif alındı (<b>Tek Teklif</b>). Sipariş kararından önce gerekçe girilmelidir.
          </div>
        )}

        {/* Sütun bazlı karşılaştırma — ilk sütun sabit */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="sticky left-0 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left font-medium">Kriter \ Tedarikçi</th>
                {bids.map((b) => {
                  const t = totals[b.id]!;
                  return (
                    <th key={b.id} className="min-w-[180px] px-3 py-2 text-left align-top">
                      <button onClick={() => setDetailBidId(b.id)} className="block text-left hover:underline">
                        <span className="font-semibold">{b.supplierName}</span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {b.id === lowestBidId && <Badge tone="success">En Düşük Fiyat</Badge>}
                        {b.id === shortestLeadBidId && <Badge tone="info">En Kısa Termin</Badge>}
                        {isSingleBid && <Badge tone="warning">Tek Teklif</Badge>}
                        {t.missing > 0 && <Badge tone="danger">Eksik Bilgi</Badge>}
                      </div>
                      <div className="mt-1 text-[11px] font-normal text-muted-foreground">{SOURCE_LABEL[b.source] ?? b.source}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Kalem satırları — seçilebilir */}
              {lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2">
                    <div className="font-medium">{line.description}</div>
                    <div className="text-xs text-muted-foreground">{formatQty(line.quantity)} {line.uom ?? ""}</div>
                  </td>
                  {bids.map((bid) => {
                    const bl = findBL(bid, line.id);
                    if (!bl) return <td key={bid.id} className="px-3 py-2 text-center text-muted-foreground">—</td>;
                    const cur = bl.currency ?? bid.currency;
                    const lt = lineTotal(line, bl);
                    const isBest = bestPerLine[line.id] === bid.id;
                    const isSel = selection[line.id] === bid.id;
                    return (
                      <td key={bid.id} className={`px-2 py-1.5 ${isSel ? "ring-2 ring-primary ring-inset" : isBest ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                        <button disabled={!canSelect} onClick={() => select(line.id, bid.id)} className="w-full rounded p-1 text-left disabled:cursor-default" title={canSelect ? "Bu tedarikçiyi bu kalem için seç" : ""}>
                          <div className="font-medium">{formatMoney(lt, cur)}</div>
                          <div className="text-[11px] text-muted-foreground">Birim {formatMoney(bl.unitPrice, cur)}{bl.leadTimeDays ? ` · ${bl.leadTimeDays}g` : ""}{bl.brand ? ` · ${bl.brand}` : ""}</div>
                          {isBest && <div className="text-[10px] font-semibold text-emerald-600">EN DÜŞÜK</div>}
                          {isSel && <div className="text-[10px] font-semibold text-primary">✓ SEÇİLDİ</div>}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Tedarikçi seviyesi kriterler */}
              <CriteriaRow label="Genel Toplam" bids={bids} render={(b) => <span className="font-semibold">{formatMoney(totals[b.id]!.grand, b.currency)}</span>} />
              <CriteriaRow label="TL Karşılığı" bids={bids} render={(b) => <span className={b.id === lowestBidId ? "font-semibold text-emerald-600" : ""}>{formatMoney(totals[b.id]!.grandTL, "TRY")}</span>} />
              <CriteriaRow label="En Uzun Termin" bids={bids} render={(b) => totals[b.id]!.maxLead != null ? `${totals[b.id]!.maxLead} gün` : "—"} />
              <CriteriaRow label="Ödeme Vadesi" bids={bids} render={(b) => b.paymentTermDays != null ? (b.paymentTermDays === 0 ? "Peşin" : `${b.paymentTermDays} gün`) : "—"} />
              <CriteriaRow label="Incoterm" bids={bids} render={(b) => b.incoterm || "—"} />
              <CriteriaRow label="Navlun/Ek Masraf" bids={bids} render={(b) => Number(b.freightAmount) > 0 ? formatMoney(b.freightAmount, b.currency) : "—"} />
              <CriteriaRow label="Geçerlilik" bids={bids} render={(b) => b.validUntil ? new Date(b.validUntil).toLocaleDateString("tr-TR") : "—"} />
            </tbody>
          </table>
        </div>

        {awarded && <p className="rounded bg-success/10 px-3 py-2 text-sm text-success">Bu RFQ karara bağlanmış ve sipariş(ler) oluşturulmuştur.</p>}

        {/* KARAR — 2 aşamalı */}
        {canSelect && stage === 1 && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">Her kalem için bir tedarikçi seçin (farklı kalemler farklı tedarikçilere verilebilir — split award). Seçili: <b>{selectedLines.length}/{lines.length}</b> kalem · <b>{orderCount}</b> sipariş oluşacak.</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Seçim Gerekçesi *</label>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Neden bu tedarikçi(ler)?" />
            </div>
            {chosenNotLowest && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-amber-600">En düşük fiyat seçilmedi — Açıklama *</label>
                <Textarea value={lowestReason} onChange={(e) => setLowestReason(e.target.value)} placeholder="En düşük teklifin seçilmeme nedeni" />
              </div>
            )}
            {isSingleBid && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-amber-600">Tek teklif — Açıklama *</label>
                <Textarea value={singleReason} onChange={(e) => setSingleReason(e.target.value)} placeholder="Tek teklifle devam gerekçesi (rekabet, aciliyet, tek kaynak...)" />
              </div>
            )}
            {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button onClick={toStage2} disabled={busy}>Karar Özetine Geç →</Button>
          </div>
        )}

        {canSelect && stage === 2 && (
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-semibold">Karar Özeti</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-left"><th className="px-3 py-2">Kalem</th><th className="px-3 py-2">Tedarikçi</th><th className="px-3 py-2 text-right">Miktar</th><th className="px-3 py-2 text-right">Birim</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-right">TL</th><th className="px-3 py-2 text-right">Termin</th></tr></thead>
                <tbody>
                  {summaryRows.map((r) => (
                    <tr key={r.line.id} className="border-b">
                      <td className="px-3 py-2">{r.line.description}</td>
                      <td className="px-3 py-2 font-medium">{r.supplierName}</td>
                      <td className="px-3 py-2 text-right">{r.qty} {r.line.uom ?? ""}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.unitPrice, r.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.total, r.currency)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(r.totalTL, "TRY")}</td>
                      <td className="px-3 py-2 text-right">{r.lead != null ? `${r.lead}g` : "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold"><td className="px-3 py-2" colSpan={5}>Toplam (TL) · {orderCount} sipariş</td><td className="px-3 py-2 text-right">{formatMoney(toStr(summaryTL, 2), "TRY")}</td><td /></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
              <div className="font-medium">Gerekçe:</div> {justification}
              {chosenNotLowest && <div className="mt-1 text-amber-600">En düşük değil: {lowestReason}</div>}
              {isSingleBid && <div className="mt-1 text-amber-600">Tek teklif: {singleReason}</div>}
            </div>
            {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage(1)} disabled={busy}>← Geri</Button>
              <Button onClick={() => setConfirming(true)} disabled={busy}>Kararı Onayla ve {orderCount} Sipariş Oluştur</Button>
            </div>
          </div>
        )}

        {/* Onay modalı */}
        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setConfirming(false)}>
            <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <CardHeader><CardTitle className="text-base">Kararı Onayla</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{orderCount} tedarikçiye toplam <b>{formatMoney(toStr(summaryTL, 2), "TRY")}</b> tutarında <b>{orderCount} sipariş</b> oluşturulacak. Onaylıyor musunuz?</p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy}>Vazgeç</Button>
                  <Button onClick={confirmAward} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? "Oluşturuluyor…" : "Onayla ve Oluştur"}</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>

      {/* Teklif detay drawer */}
      {detailBid && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetailBidId(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{detailBid.supplierName}</h3>
              <button onClick={() => setDetailBidId(null)} className="rounded p-1 hover:bg-accent"><X className="size-5" /></button>
            </div>
            <div className="space-y-1.5 text-sm">
              <DetailRow label="Kaynak" value={SOURCE_LABEL[detailBid.source] ?? detailBid.source} />
              <DetailRow label="Para Birimi" value={detailBid.currency} />
              <DetailRow label="Genel Toplam" value={formatMoney(totals[detailBid.id]!.grand, detailBid.currency)} />
              <DetailRow label="TL Karşılığı" value={formatMoney(totals[detailBid.id]!.grandTL, "TRY")} />
              <DetailRow label="Ödeme Vadesi" value={detailBid.paymentTermDays != null ? (detailBid.paymentTermDays === 0 ? "Peşin" : `${detailBid.paymentTermDays} gün`) : "—"} />
              <DetailRow label="Incoterm" value={detailBid.incoterm || "—"} />
              <DetailRow label="Navlun/Ek" value={Number(detailBid.freightAmount) > 0 ? formatMoney(detailBid.freightAmount, detailBid.currency) : "—"} />
              <DetailRow label="Geçerlilik" value={detailBid.validUntil ? new Date(detailBid.validUntil).toLocaleDateString("tr-TR") : "—"} />
              <DetailRow label="Gönderim" value={detailBid.submittedAt ? new Date(detailBid.submittedAt).toLocaleString("tr-TR") : "—"} />
              {detailBid.note && <div className="border-t pt-2"><div className="text-xs font-medium text-muted-foreground">Not</div><p>{detailBid.note}</p></div>}
            </div>
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">KALEMLER</div>
              {lines.map((line) => {
                const bl = findBL(detailBid, line.id);
                return (
                  <div key={line.id} className="mb-2 rounded border p-2 text-sm">
                    <div className="font-medium">{line.description}</div>
                    {bl ? (
                      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>Birim: {formatMoney(bl.unitPrice, bl.currency ?? detailBid.currency)}</span>
                        <span>İsk.: %{bl.discountPct}</span>
                        <span>KDV: %{bl.taxRate}</span>
                        <span>Termin: {bl.leadTimeDays != null ? `${bl.leadTimeDays}g` : "—"}</span>
                        {bl.brand && <span>Marka: {bl.brand}</span>}
                        {bl.model && <span>Model: {bl.model}</span>}
                        <span className="col-span-2 font-medium text-foreground">Satır: {formatMoney(lineTotal(line, bl), bl.currency ?? detailBid.currency)}</span>
                        {bl.note && <span className="col-span-2">Not: {bl.note}</span>}
                      </div>
                    ) : <div className="mt-1 text-xs text-destructive">Bu kalem için teklif verilmedi</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function CriteriaRow({ label, bids, render }: { label: string; bids: Bid[]; render: (b: Bid) => React.ReactNode }) {
  return (
    <tr className="border-b">
      <td className="sticky left-0 z-10 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">{label}</td>
      {bids.map((b) => <td key={b.id} className="px-3 py-2">{render(b)}</td>)}
    </tr>
  );
}
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
