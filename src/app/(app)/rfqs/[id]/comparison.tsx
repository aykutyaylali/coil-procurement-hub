"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { lineNet, lineTax, add, formatMoney, d } from "@/lib/money";
import { moveRfqToEvaluation } from "../actions";
import { awardRfqAndCreateOrders } from "../award-actions";

interface Line {
  id: string;
  lineNo: number;
  description: string;
  quantity: string;
  uom: string | null;
}
interface Bid {
  id: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  status: string;
  lines: {
    rfqLineId: string;
    willQuote: boolean;
    unitPrice: string;
    discountPct: string;
    taxRate: string;
    leadTimeDays: number | null;
  }[];
}

function lineTotalInclTax(qty: string, unitPrice: string, discountPct: string, taxRate: string): string {
  const net = lineNet(qty, unitPrice, discountPct);
  return add(net, lineTax(net, taxRate)).toString();
}

export function Comparison({
  rfqId,
  rfqStatus,
  lines,
  bids,
  canEvaluate,
  canAward,
  awarded,
}: {
  rfqId: string;
  rfqStatus: string;
  lines: Line[];
  bids: Bid[];
  canEvaluate: boolean;
  canAward: boolean;
  awarded: boolean;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, string>>({}); // rfqLineId -> bidId
  const [justification, setJustification] = useState("");
  const [lowestReason, setLowestReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Her satır için en düşük teklifi bul
  const bestPerLine = useMemo(() => {
    const map: Record<string, { bidId: string; total: string }> = {};
    for (const line of lines) {
      let best: { bidId: string; total: string } | null = null;
      for (const bid of bids) {
        const bl = bid.lines.find((x) => x.rfqLineId === line.id && x.willQuote);
        if (!bl) continue;
        const total = lineTotalInclTax(line.quantity, bl.unitPrice, bl.discountPct, bl.taxRate);
        if (!best || d(total).lessThan(best.total)) best = { bidId: bid.id, total };
      }
      if (best) map[line.id] = best;
    }
    return map;
  }, [lines, bids]);

  // Teklif başına genel toplam
  const bidTotals = useMemo(() => {
    const map: Record<string, string> = {};
    for (const bid of bids) {
      let t = add(0);
      for (const line of lines) {
        const bl = bid.lines.find((x) => x.rfqLineId === line.id && x.willQuote);
        if (bl) t = add(t, lineTotalInclTax(line.quantity, bl.unitPrice, bl.discountPct, bl.taxRate));
      }
      map[bid.id] = t.toString();
    }
    return map;
  }, [lines, bids]);

  function select(lineId: string, bidId: string) {
    setSelection((p) => ({ ...p, [lineId]: p[lineId] === bidId ? "" : bidId }));
  }

  // Seçimde en düşük dışı var mı?
  const chosenNotLowest = useMemo(
    () =>
      Object.entries(selection).some(
        ([lineId, bidId]) => bidId && bestPerLine[lineId] && bestPerLine[lineId]!.bidId !== bidId,
      ),
    [selection, bestPerLine],
  );

  async function evaluate() {
    setBusy(true);
    setError("");
    const res = await moveRfqToEvaluation(rfqId);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function award() {
    const awards = lines
      .filter((l) => selection[l.id])
      .map((l) => {
        const bidId = selection[l.id]!;
        const bid = bids.find((b) => b.id === bidId)!;
        return { rfqLineId: l.id, bidId, supplierId: bid.supplierId, quantity: l.quantity };
      });
    if (awards.length === 0) {
      setError("Her satır için bir tedarikçi seçin.");
      return;
    }
    if (!justification.trim()) {
      setError("Seçim gerekçesi zorunludur.");
      return;
    }
    if (chosenNotLowest && !lowestReason.trim()) {
      setError("En düşük fiyat seçilmediği için ek açıklama zorunludur.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await awardRfqAndCreateOrders({
      rfqId,
      justification,
      lowestNotChosenReason: lowestReason || undefined,
      awards,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/orders`);
  }

  if (bids.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Teklif Karşılaştırma</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Henüz gönderilmiş teklif bulunmuyor.</p>
        </CardContent>
      </Card>
    );
  }

  const canSelect = canAward && !awarded && ["EVALUATION", "NEGOTIATION", "OPEN"].includes(rfqStatus);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Teklif Karşılaştırma (Bid Analysis)</CardTitle>
        {canEvaluate && rfqStatus === "OPEN" && (
          <Button size="sm" variant="outline" onClick={evaluate} disabled={busy}>
            Değerlendirmeye Al
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Kalem</TH>
                {bids.map((b) => (
                  <TH key={b.id} className="text-right">
                    {b.supplierName}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {lines.map((line) => (
                <TR key={line.id}>
                  <TD>
                    <div className="font-medium">{line.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.quantity} {line.uom ?? ""}
                    </div>
                  </TD>
                  {bids.map((bid) => {
                    const bl = bid.lines.find((x) => x.rfqLineId === line.id && x.willQuote);
                    if (!bl) return <TD key={bid.id} className="text-right text-muted-foreground">—</TD>;
                    const total = lineTotalInclTax(line.quantity, bl.unitPrice, bl.discountPct, bl.taxRate);
                    const isBest = bestPerLine[line.id]?.bidId === bid.id;
                    const isSelected = selection[line.id] === bid.id;
                    return (
                      <TD
                        key={bid.id}
                        className={`text-right ${isBest ? "bg-success/10" : ""} ${isSelected ? "ring-2 ring-primary ring-inset" : ""}`}
                      >
                        <button
                          disabled={!canSelect}
                          onClick={() => select(line.id, bid.id)}
                          className="w-full text-right disabled:cursor-default"
                          title={canSelect ? "Bu tedarikçiyi seç" : ""}
                        >
                          <div className="font-medium">{formatMoney(total, bid.currency)}</div>
                          <div className="text-xs text-muted-foreground">
                            Birim: {formatMoney(bl.unitPrice, bid.currency)}
                            {bl.leadTimeDays ? ` · ${bl.leadTimeDays}g` : ""}
                          </div>
                          {isBest && <div className="text-[10px] font-semibold text-success">EN DÜŞÜK</div>}
                        </button>
                      </TD>
                    );
                  })}
                </TR>
              ))}
              <TR className="bg-muted/40 font-semibold">
                <TD>Genel Toplam</TD>
                {bids.map((b) => (
                  <TD key={b.id} className="text-right">
                    {formatMoney(bidTotals[b.id] ?? "0", b.currency)}
                  </TD>
                ))}
              </TR>
            </TBody>
          </Table>
        </div>

        {awarded && (
          <p className="rounded bg-success/10 px-3 py-2 text-sm text-success">
            Bu RFQ karara bağlanmış ve sipariş(ler) oluşturulmuştur. Siparişler bölümüne bakınız.
          </p>
        )}

        {canSelect && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Her satır için bir tedarikçi seçin (farklı satırlarda farklı tedarikçi seçilebilir — split award).
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Seçim Gerekçesi *</label>
              <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Neden bu tedarikçi(ler) seçildi?" />
            </div>
            {chosenNotLowest && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-warning">En düşük fiyat seçilmedi — Açıklama *</label>
                <Textarea value={lowestReason} onChange={(e) => setLowestReason(e.target.value)} placeholder="En düşük teklifin seçilmeme nedeni" />
              </div>
            )}
            {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button onClick={award} disabled={busy}>
              {busy ? "İşleniyor..." : "Kararı Onayla ve Sipariş Oluştur"}
            </Button>
          </div>
        )}
        {!canSelect && error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
