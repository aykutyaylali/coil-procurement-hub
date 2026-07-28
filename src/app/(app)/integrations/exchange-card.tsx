"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { refreshTcmbRates } from "./exchange-actions";

export interface RateRow {
  quote: string;
  rate: string;
  rateDate: string; // görüntülenecek tarih (TR)
}

export function ExchangeRatesCard({ rates }: { rates: RateRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    const res = await refreshTcmbRates();
    setBusy(false);
    if (!res.ok) { toast({ type: "error", title: "Kurlar güncellenemedi.", description: res.error }); return; }
    toast({ type: "success", title: "TCMB kurları güncellendi.", description: `${res.data.count} döviz güncellendi.` });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Döviz Kurları (TCMB)</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Türkiye Cumhuriyet Merkez Bankası günlük kurları · 1 döviz = ? TL · otomatik güncellenir
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {busy ? "Güncelleniyor…" : "TCMB'den Güncelle"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rates.length === 0 ? (
          <EmptyState title="Kur kaydı yok" hint="“TCMB'den Güncelle” ile çekin." />
        ) : (
          <Table>
            <THead><TR><TH>Döviz</TH><TH className="text-right">1 Birim = TL</TH><TH>Tarih</TH></TR></THead>
            <TBody>
              {rates.map((r) => (
                <TR key={r.quote}>
                  <TD className="font-medium">{r.quote}</TD>
                  <TD className="text-right font-mono">{Number(r.rate).toLocaleString("tr-TR", { minimumFractionDigits: 4 })} ₺</TD>
                  <TD className="text-sm text-muted-foreground">{r.rateDate}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
