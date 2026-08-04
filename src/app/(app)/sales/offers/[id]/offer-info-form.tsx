"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { div, d, formatMoney } from "@/lib/money";
import { saveOfferInfo } from "../../actions";
import { OFFER_STATUS, OFFER_STATUS_LABEL } from "../status";

type Opt = { id: string; name: string };
type LmeOpt = { id: string; label: string; usdPerTon: string };
const CURRENCIES = ["EUR", "USD", "TRY"];
const COIL_TYPES = ["STATOR_COIL", "ROTOR_COIL", "POLE", "OTHER"];

export type OfferInfoInitial = {
  id: string; number: string; status: string; currency: string; totalAmount: string;
  offerDate: string; validUntil: string; deliveryDate: string; invoiced: boolean; reason: string; salesRepId: string;
  tech: {
    manufacturer: string; type: string; power: string; voltage: string;
    numberOfPole: string; numberOfCoils: string; numberOfSlot: string; numberOfSet: string; numberOfTurns: string;
    insulationType: string; typeOfCoil: string; wireWidth: string; wireThickness: string; lmeRecordId: string;
  };
};

export function OfferInfoForm({ initial, salesReps, lmeOptions }: { initial: OfferInfoInitial; salesReps: Opt[]; lmeOptions: LmeOpt[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const set = (p: Partial<OfferInfoInitial>) => setF((s) => ({ ...s, ...p }));
  const setTech = (p: Partial<OfferInfoInitial["tech"]>) => setF((s) => ({ ...s, tech: { ...s.tech, ...p } }));

  const selectedLme = lmeOptions.find((l) => l.id === f.tech.lmeRecordId);
  const lmeUsdPerKg = selectedLme ? div(d(selectedLme.usdPerTon), 1000) : null;

  async function save() {
    if (busy) return;
    setBusy(true); setError(""); setOkMsg("");
    const res = await saveOfferInfo({
      id: f.id, status: f.status, currency: f.currency, totalAmount: f.totalAmount,
      offerDate: f.offerDate || undefined, validUntil: f.validUntil || undefined, deliveryDate: f.deliveryDate || undefined,
      invoiced: f.invoiced, reason: f.reason || undefined, salesRepId: f.salesRepId || undefined,
      ...f.tech,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOkMsg("Kaydedildi.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {okMsg && <p className="rounded bg-green-500/10 px-3 py-2 text-sm text-green-600">{okMsg}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Genel Bilgiler</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label>Teklif No</Label><Input value={f.number} disabled className="opacity-70" /></div>
          <div className="space-y-1.5"><Label>Teklif Tarihi</Label><Input type="date" value={f.offerDate} onChange={(e) => set({ offerDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Durum</Label><Select value={f.status} onChange={(e) => set({ status: e.target.value })}>{OFFER_STATUS.map((s) => <option key={s} value={s}>{OFFER_STATUS_LABEL[s]}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Satış Temsilcisi</Label><Select value={f.salesRepId} onChange={(e) => set({ salesRepId: e.target.value })}><option value="">-</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Para Birimi</Label><Select value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Teklif Tutarı</Label><Input aria-label="Teklif Tutarı" value={f.totalAmount} onChange={(e) => set({ totalAmount: e.target.value })} placeholder="0,00" inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label>Geçerlilik Tarihi</Label><Input type="date" value={f.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Teslim Tarihi</Label><Input type="date" value={f.deliveryDate} onChange={(e) => set({ deliveryDate: e.target.value })} /></div>
          <div className="flex items-end gap-2 pb-1"><input id="invoiced" type="checkbox" checked={f.invoiced} onChange={(e) => set({ invoiced: e.target.checked })} className="size-4" /><Label htmlFor="invoiced" className="!mb-0">Faturalandı</Label></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>Gerekçe / Not (kapanış / red)</Label><Textarea value={f.reason} onChange={(e) => set({ reason: e.target.value })} className="min-h-[52px]" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bobin & Motor Teknik Parametreleri</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Manufacturer" value={f.tech.manufacturer} onChange={(v) => setTech({ manufacturer: v })} />
          <Field label="Type" value={f.tech.type} onChange={(v) => setTech({ type: v })} />
          <Field label="Power (kW/MW)" value={f.tech.power} onChange={(v) => setTech({ power: v })} />
          <Field label="Voltage (V)" value={f.tech.voltage} onChange={(v) => setTech({ voltage: v })} />
          <Field label="Number of Pole" value={f.tech.numberOfPole} onChange={(v) => setTech({ numberOfPole: v })} type="number" />
          <Field label="Number of Coils" value={f.tech.numberOfCoils} onChange={(v) => setTech({ numberOfCoils: v })} type="number" />
          <Field label="Number of Slot" value={f.tech.numberOfSlot} onChange={(v) => setTech({ numberOfSlot: v })} type="number" />
          <Field label="Number of Set" value={f.tech.numberOfSet} onChange={(v) => setTech({ numberOfSet: v })} type="number" />
          <Field label="Number of Turns" value={f.tech.numberOfTurns} onChange={(v) => setTech({ numberOfTurns: v })} type="number" />
          <Field label="Insulation Type" value={f.tech.insulationType} onChange={(v) => setTech({ insulationType: v })} />
          <div className="space-y-1.5"><Label>Type of Coil</Label><Select value={f.tech.typeOfCoil} onChange={(e) => setTech({ typeOfCoil: e.target.value })}><option value="">-</option>{COIL_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</Select></div>
          <Field label="Wire Width (Wire W, mm)" value={f.tech.wireWidth} onChange={(v) => setTech({ wireWidth: v })} />
          <Field label="Wire Thickness (Wire T, mm)" value={f.tech.wireThickness} onChange={(v) => setTech({ wireThickness: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">LME Bakır Referansı</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">İmalatta kullanılacak bakır için en son onaylı LME verisini referans maliyet olarak seçin. Snapshot değil, referanstır.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Onaylı LME Kaydı</Label>
              <Select aria-label="Onaylı LME Kaydı" value={f.tech.lmeRecordId} onChange={(e) => setTech({ lmeRecordId: e.target.value })}>
                <option value="">Referans yok</option>
                {lmeOptions.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </Select>
            </div>
            {selectedLme && lmeUsdPerKg && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">LME (USD/ton)</span><span className="font-medium tabular-nums">{formatMoney(selectedLme.usdPerTon, "USD")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Referans (USD/kg)</span><span className="font-medium tabular-nums">{formatMoney(lmeUsdPerKg, "USD")}</span></div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button>
        <Button variant="outline" onClick={() => router.push("/sales/offers")} disabled={busy}>Listeye Dön</Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input aria-label={label} type={type} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
