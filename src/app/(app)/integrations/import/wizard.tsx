"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { analyzeImport, runImport, type AnalyzeResult } from "./actions";
import { formatNumber } from "@/lib/i18n";
import { KALEM_SHEET } from "@/domain/import/historical";

const MAPPING: [string, string][] = [
  ["Sipariş No", "PurchaseOrder.number"],
  ["Tarih", "orderDate"],
  ["Tedarikçi", "Supplier (normalize eşleştir)"],
  ["Talep Eden", "requesterName (geçmiş)"],
  ["Talep No", "requisitionNumber"],
  ["Durum", "status (map)"],
  ["Kategori", "Category"],
  ["Kalem #", "line.lineNo"],
  ["Ürün / Açıklama", "line.description"],
  ["Miktar", "line.quantity"],
  ["Birim", "line.uom"],
  ["Birim Fiyat", "line.unitPrice (boşsa null)"],
  ["PB", "line.currency (TL→TRY)"],
  ["KDV", "line.taxRate (%20→20)"],
  ["Kalem Tutarı (PB)", "line.originalLineTotal"],
  ["Kalem Tutarı (TL)", "line.historicalTryTotal"],
  ["Teslimat", "line.neededBy"],
  ["Not", "line.note"],
];

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-xl font-semibold ${tone ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState(KALEM_SHEET);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<null | { orders: number; lines: number; suppliers: number; reconcileOk: boolean; diff: string }>(null);

  async function analyze() {
    if (!file) { setError("Lütfen bir .xlsx dosyası seçin."); return; }
    setBusy(true); setError(""); setImported(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("sheet", sheet);
    const res = await analyzeImport(fd);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setAnalysis(res.data);
  }

  async function doImport() {
    if (!analysis) return;
    setBusy(true); setError("");
    const res = await runImport({ fileKey: analysis.fileKey, fileName: analysis.fileName, sheet });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setImported({
      orders: res.data.result.ordersCreated,
      lines: res.data.result.linesCreated,
      suppliers: res.data.result.suppliersCreated,
      reconcileOk: res.data.reconcile.ok,
      diff: res.data.reconcile.diff,
    });
    setAnalysis(null);
    router.refresh();
  }

  function downloadErrors() {
    if (!analysis) return;
    const rows = [["Satır", "Sipariş No", "Hata"], ...analysis.errorSample.map((e) => [e.row, e.order, e.error])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "import-hatalari.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const s = analysis?.summary;
  const dry = analysis?.dry;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>1) Dosya Yükleme</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Excel dosyası (.xlsx)</label>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Sayfa</label>
            <input value={sheet} onChange={(e) => setSheet(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <Button onClick={analyze} disabled={busy || !file}>{busy ? "Analiz ediliyor..." : "Analiz Et (Dry-run)"}</Button>
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {imported && (
        <Card>
          <CardHeader><CardTitle>✓ İçe Aktarma Tamamlandı</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Sipariş oluşturuldu" value={imported.orders} tone="text-success" />
              <Stat label="Kalem oluşturuldu" value={imported.lines} tone="text-success" />
              <Stat label="Yeni tedarikçi" value={imported.suppliers} />
              <Stat label="Mutabakat" value={imported.reconcileOk ? "✓ Uyumlu" : `Fark: ${imported.diff}`} tone={imported.reconcileOk ? "text-success" : "text-destructive"} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">Dashboard, sipariş listesi ve raporlar artık bu verilerle çalışıyor.</p>
          </CardContent>
        </Card>
      )}

      {analysis && s && dry && (
        <>
          <Card>
            <CardHeader><CardTitle>2) Sütun Eşleştirme</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {MAPPING.map(([src, dst]) => (
                  <div key={src} className="flex justify-between border-b py-1">
                    <span className="text-muted-foreground">{src}</span>
                    <span className="font-medium">{dst}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Bulunan sayfalar: {analysis.sheets.join(", ")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3) İçe Aktarma Öncesi Özet</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Toplam sipariş" value={s.totalOrders} />
                <Stat label="Toplam kalem" value={s.totalLines} />
                <Stat label="Yeni tedarikçi" value={dry.newSuppliers} tone="text-primary" />
                <Stat label="Eşleşen tedarikçi" value={dry.matchedSuppliers} />
                <Stat label="Yeni kategori" value={dry.newCategories} tone="text-primary" />
                <Stat label="Eşleşen kategori" value={dry.matchedCategories} />
                <Stat label="Mükerrer sipariş (atlanır)" value={dry.duplicateOrders} tone={dry.duplicateOrders ? "text-warning" : ""} />
                <Stat label="Hatalı satır" value={s.errorRows} tone={s.errorRows ? "text-destructive" : ""} />
                <Stat label="Eksik fiyat" value={s.missingPrice} tone="text-warning" />
                <Stat label="Eksik KDV" value={s.missingKdv} tone="text-warning" />
                <Stat label="Eksik teslim" value={s.missingDelivery} tone="text-warning" />
                <Stat label="Hatalı tarih" value={s.badDate} tone={s.badDate ? "text-destructive" : ""} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">Para Birimi Dağılımı</div>
                  {Object.entries(s.currencies).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{k}</span><span>{v}</span></div>)}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="mb-2 text-sm font-medium">Durum Dağılımı</div>
                  {Object.entries(s.statuses).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span>{k}</span><span>{v}</span></div>)}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div><div className="text-xs text-muted-foreground">Kaynak toplam TL</div><div className="text-lg font-semibold">{formatNumber(Number(s.sourceTotalTry), "tr")} ₺</div></div>
                  <div><div className="text-xs text-muted-foreground">İçe aktarılacak TL</div><div className="text-lg font-semibold">{formatNumber(Number(dry.importTotalTry), "tr")} ₺</div></div>
                  <div><div className="text-xs text-muted-foreground">Fark</div><div className={`text-lg font-semibold ${Math.abs(Number(s.sourceTotalTry) - Number(dry.importTotalTry)) < 0.01 ? "text-success" : "text-destructive"}`}>{formatNumber(Number(s.sourceTotalTry) - Number(dry.importTotalTry), "tr")} ₺</div></div>
                </div>
              </div>

              {s.errorRows > 0 && (
                <Button variant="outline" size="sm" onClick={downloadErrors}>Hatalı satırları CSV indir ({s.errorRows})</Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>4) Onay ve Gerçek İçe Aktarma</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Dry-run yazma yapmadı. Onayladığınızda {dry.newOrders} yeni sipariş, {s.totalLines} kalem ve {dry.newSuppliers} yeni tedarikçi
                transaction içinde oluşturulacak. Mevcut {dry.duplicateOrders} sipariş atlanacak (idempotent). İşlem öncesi otomatik yedek alınır.
              </p>
              <Button onClick={doImport} disabled={busy}>{busy ? "İçe aktarılıyor..." : "Onayla ve İçe Aktar"}</Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
