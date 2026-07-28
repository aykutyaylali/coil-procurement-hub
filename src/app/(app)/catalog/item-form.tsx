"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { createItem, updateItem } from "./actions";

interface Opt { id: string; name: string }
interface Conv { fromUom: string; toUom: string; factor: string }
export interface ItemInitial {
  id?: string; code: string; name: string; description: string; categoryId: string; brand: string;
  manufacturer: string; manufacturerCode: string; gtipCode: string; baseUomId: string; minOrderQty: string;
  leadTimeDays: string; specs: string; isService: boolean; isActive: boolean;
  preferredSuppliers: string[]; unitConversions: Conv[];
}

export function ItemForm({
  categories, uoms, suppliers, initial, editMode,
}: {
  categories: Opt[]; uoms: { id: string; code: string }[]; suppliers: Opt[]; initial?: ItemInitial; editMode?: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState<ItemInitial>(
    initial ?? { code: "", name: "", description: "", categoryId: "", brand: "", manufacturer: "", manufacturerCode: "", gtipCode: "", baseUomId: uoms[0]?.id ?? "", minOrderQty: "", leadTimeDays: "", specs: "", isService: false, isActive: true, preferredSuppliers: [], unitConversions: [] },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ItemInitial>) => setF((s) => ({ ...s, ...p }));
  const toggleSup = (id: string) => set({ preferredSuppliers: f.preferredSuppliers.includes(id) ? f.preferredSuppliers.filter((x) => x !== id) : [...f.preferredSuppliers, id] });

  async function submit() {
    setBusy(true); setError("");
    const payload = { ...f, minOrderQty: f.minOrderQty || undefined, leadTimeDays: f.leadTimeDays || undefined };
    const res = editMode && f.id ? await updateItem({ ...payload, id: f.id }) : await createItem(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/catalog/${res.data.id}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Ürün / Hizmet Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Ürün Kodu *</Label><Input value={f.code} onChange={(e) => set({ code: e.target.value })} disabled={editMode} /></div>
          <div className="space-y-1.5"><Label>Ad *</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Kategori</Label><Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">-</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Ölçü Birimi</Label><Select value={f.baseUomId} onChange={(e) => set({ baseUomId: e.target.value })}><option value="">-</option>{uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Marka</Label><Input value={f.brand} onChange={(e) => set({ brand: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Üretici</Label><Input value={f.manufacturer} onChange={(e) => set({ manufacturer: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Üretici Kodu</Label><Input value={f.manufacturerCode} onChange={(e) => set({ manufacturerCode: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>GTİP / HS Kodu</Label><Input value={f.gtipCode} onChange={(e) => set({ gtipCode: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Min. Sipariş Miktarı</Label><Input value={f.minOrderQty} onChange={(e) => set({ minOrderQty: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Termin (gün)</Label><Input value={f.leadTimeDays} onChange={(e) => set({ leadTimeDays: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Teknik Özellikler</Label><Textarea value={f.specs} onChange={(e) => set({ specs: e.target.value })} /></div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isService} onChange={(e) => set({ isService: e.target.checked })} /> Hizmet</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Aktif</label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tercih Edilen Tedarikçiler</CardTitle></CardHeader>
        <CardContent>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
            {suppliers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                <input type="checkbox" checked={f.preferredSuppliers.includes(s.id)} onChange={() => toggleSup(s.id)} /> <span className="truncate">{s.name}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Birim Dönüşümleri</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => set({ unitConversions: [...f.unitConversions, { fromUom: "", toUom: "", factor: "1" }] })}><Plus className="size-4" /> Ekle</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {f.unitConversions.length === 0 && <p className="text-sm text-muted-foreground">Örn: 1 KOLİ = 12 ADET</p>}
          {f.unitConversions.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12">
              <Input className="sm:col-span-4" placeholder="Kaynak birim (KOLİ)" value={c.fromUom} onChange={(e) => set({ unitConversions: f.unitConversions.map((x, idx) => idx === i ? { ...x, fromUom: e.target.value } : x) })} />
              <Input className="sm:col-span-4" placeholder="Hedef birim (ADET)" value={c.toUom} onChange={(e) => set({ unitConversions: f.unitConversions.map((x, idx) => idx === i ? { ...x, toUom: e.target.value } : x) })} />
              <Input className="sm:col-span-3" placeholder="Katsayı" value={c.factor} onChange={(e) => set({ unitConversions: f.unitConversions.map((x, idx) => idx === i ? { ...x, factor: e.target.value } : x) })} />
              <Button type="button" variant="ghost" size="icon" className="sm:col-span-1" onClick={() => set({ unitConversions: f.unitConversions.filter((_, idx) => idx !== i) })}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : editMode ? "Güncelle" : "Ürün Oluştur"}</Button>
      </div>
    </div>
  );
}
