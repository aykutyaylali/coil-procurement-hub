"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { completeInspection, createNonConformance } from "../actions";
import { QUALITY_RESULTS, NCR_SEVERITIES, label } from "@/domain/labels";

export function InspectionPanel({
  inspectionId,
  status,
  supplierId,
  users,
}: {
  inspectionId: string;
  status: string;
  supplierId: string;
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [result, setResult] = useState("PASS");
  const [sampleSize, setSampleSize] = useState("");
  const [sampleResult, setSampleResult] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // NCR formu
  const [showNcr, setShowNcr] = useState(false);
  const [ncrTitle, setNcrTitle] = useState("");
  const [ncrSeverity, setNcrSeverity] = useState("MINOR");
  const [ncrType, setNcrType] = useState("QUALITY");
  const [ncrDesc, setNcrDesc] = useState("");
  const [ncrDisp, setNcrDisp] = useState("");
  const [ncrCost, setNcrCost] = useState("");
  const [ncrResp, setNcrResp] = useState("");
  const [ncrDue, setNcrDue] = useState("");

  async function complete() {
    setBusy(true); setError("");
    const res = await completeInspection({ inspectionId, result, sampleSize: sampleSize || undefined, sampleResult: sampleResult || undefined, note: note || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      if (result !== "PASS") setShowNcr(true);
      router.refresh();
    }
  }

  async function addNcr() {
    if (!ncrTitle.trim()) { setError("NCR başlığı zorunlu."); return; }
    setBusy(true); setError("");
    const res = await createNonConformance({
      inspectionId, supplierId: supplierId || undefined, title: ncrTitle, type: ncrType, severity: ncrSeverity,
      description: ncrDesc || undefined, disposition: ncrDisp || undefined, cost: ncrCost || undefined,
      responsibleUserId: ncrResp || undefined, dueDate: ncrDue || undefined,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else { setShowNcr(false); setNcrTitle(""); setNcrDesc(""); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {status === "PENDING" && (
        <Card>
          <CardHeader><CardTitle>Kalite Kontrolü Tamamla</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Sonuç</Label>
                <Select value={result} onChange={(e) => setResult(e.target.value)}>
                  {QUALITY_RESULTS.map((r) => (<option key={r} value={r}>{label(r)}</option>))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Numune Adedı</Label>
                <Input value={sampleSize} onChange={(e) => setSampleSize(e.target.value)} placeholder="Örn: 8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ölçüm / Numune Sonuçları</Label>
              <Textarea value={sampleResult} onChange={(e) => setSampleResult(e.target.value)} placeholder="Ölçüm sonuçları, kontrol planı notları..." />
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button onClick={complete} disabled={busy}>{busy ? "Kaydediliyor..." : "Kontrolü Tamamla"}</Button>
          </CardContent>
        </Card>
      )}

      {(showNcr || status === "FAIL" || status === "CONDITIONAL") && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Uygunsuzluk (NCR) Oluştur</CardTitle>
            {!showNcr && <Button size="sm" variant="outline" onClick={() => setShowNcr(true)}>NCR Ekle</Button>}
          </CardHeader>
          {showNcr && (
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Başlık *</Label>
                  <Input value={ncrTitle} onChange={(e) => setNcrTitle(e.target.value)} placeholder="Uygunsuzluğun kısa tanımı" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Şiddet</Label>
                    <Select value={ncrSeverity} onChange={(e) => setNcrSeverity(e.target.value)}>
                      {NCR_SEVERITIES.map((s) => (<option key={s} value={s}>{label(s)}</option>))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tür</Label>
                    <Select value={ncrType} onChange={(e) => setNcrType(e.target.value)}>
                      <option value="QUALITY">Kalite</option>
                      <option value="SUPPLIER_COMPLAINT">Tedarikçi Şikâyeti</option>
                      <option value="PROCESS">Süreç</option>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Açıklama</Label>
                <Textarea value={ncrDesc} onChange={(e) => setNcrDesc(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Disposition</Label>
                  <Input value={ncrDisp} onChange={(e) => setNcrDisp(e.target.value)} placeholder="iade / hurda / şartlı kabul" />
                </div>
                <div className="space-y-1.5">
                  <Label>Maliyet</Label>
                  <Input value={ncrCost} onChange={(e) => setNcrCost(e.target.value)} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Sorumlu</Label>
                  <Select value={ncrResp} onChange={(e) => setNcrResp(e.target.value)}>
                    <option value="">Seçiniz</option>
                    {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Hedef Tarih</Label>
                  <Input type="date" value={ncrDue} onChange={(e) => setNcrDue(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowNcr(false)} disabled={busy}>Vazgeç</Button>
                <Button onClick={addNcr} disabled={busy}>{busy ? "..." : "NCR Oluştur"}</Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
