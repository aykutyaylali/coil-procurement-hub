"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveSalesRfq } from "../actions";

type Opt = { id: string; name: string };
export const COIL_TYPES = ["STATOR_COIL", "ROTOR_COIL", "POLE", "OTHER"];
export const INDUSTRIES = ["OEM", "REPAIR", "UTILITY", "OTHER"];

export function SalesRfqForm({ customers, salesReps, initial }: { customers: Opt[]; salesReps: Opt[]; initial?: { id?: string; customerId: string; industry?: string; targetDate?: string; salesRepId?: string; coilType?: string; notes?: string } }) {
  const router = useRouter();
  const [f, setF] = useState({ customerId: initial?.customerId ?? (customers[0]?.id ?? ""), industry: initial?.industry ?? "", targetDate: initial?.targetDate ?? "", salesRepId: initial?.salesRepId ?? "", coilType: initial?.coilType ?? "", notes: initial?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    const res = await saveSalesRfq({ id: initial?.id, customerId: f.customerId, industry: f.industry || undefined, targetDate: f.targetDate || undefined, salesRepId: f.salesRepId || undefined, coilType: f.coilType || undefined, notes: f.notes || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/sales/rfqs/${res.data.id}`);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Müşteri Talebi</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label>Müşteri *</Label><Select value={f.customerId} onChange={(e) => set({ customerId: e.target.value })}>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Sektör</Label><Select value={f.industry} onChange={(e) => set({ industry: e.target.value })}><option value="">-</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Bobin Tipi</Label><Select value={f.coilType} onChange={(e) => set({ coilType: e.target.value })}><option value="">-</option>{COIL_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Satış Temsilcisi</Label><Select value={f.salesRepId} onChange={(e) => set({ salesRepId: e.target.value })}><option value="">-</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Hedef Tarih</Label><Input type="date" value={f.targetDate} onChange={(e) => set({ targetDate: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Notlar</Label><Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[60px]" /></div>
        <div className="flex gap-2"><Button size="sm" onClick={save} disabled={busy}>{busy ? "Kaydediliyor…" : "Kaydet"}</Button><Button size="sm" variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button></div>
      </CardContent>
    </Card>
  );
}
