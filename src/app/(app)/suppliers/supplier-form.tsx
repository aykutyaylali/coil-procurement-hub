"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createSupplier, updateSupplier } from "./actions";

export interface SupplierInitial {
  id?: string;
  legalName: string;
  shortName: string;
  supplierType: "DOMESTIC" | "FOREIGN";
  taxIdType: string;
  taxOffice: string;
  taxNumber: string;
  country: string;
  addressLine: string;
  city: string;
  stateRegion: string;
  postalCode: string;
  website: string;
  preferredLanguage: "tr" | "en";
  defaultCurrency: string;
  defaultIncoterm: string;
  defaultPaymentTermDays: string;
  operationTypes: string[];
  isManufacturer: boolean;
  isDistributor: boolean;
  isExporter: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

const OPS = [
  { v: "DOMESTIC_PURCHASE", l: "Yurt İçi Satınalma" },
  { v: "IMPORT_PURCHASE", l: "İthalat" },
  { v: "EXPORT_RELATED_PURCHASE", l: "İhracat Bağlantılı" },
];

const empty: SupplierInitial = {
  legalName: "", shortName: "", supplierType: "DOMESTIC", taxIdType: "VKN", taxOffice: "", taxNumber: "",
  country: "TR", addressLine: "", city: "", stateRegion: "", postalCode: "", website: "",
  preferredLanguage: "tr", defaultCurrency: "TRY", defaultIncoterm: "", defaultPaymentTermDays: "",
  operationTypes: ["DOMESTIC_PURCHASE"], isManufacturer: false, isDistributor: false, isExporter: false, riskLevel: "LOW",
  contactName: "", contactEmail: "", contactPhone: "",
};

export function SupplierForm({ currencies, initial, editMode }: { currencies: string[]; initial?: SupplierInitial; editMode?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<SupplierInitial>(initial ?? { ...empty, defaultCurrency: currencies[0] ?? "TRY" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SupplierInitial>) => setF((p) => ({ ...p, ...patch }));
  const toggleOp = (v: string) => set({ operationTypes: f.operationTypes.includes(v) ? f.operationTypes.filter((x) => x !== v) : [...f.operationTypes, v] });

  async function submit() {
    setBusy(true); setError("");
    const payload = {
      ...f,
      defaultPaymentTermDays: f.defaultPaymentTermDays ? Number(f.defaultPaymentTermDays) : undefined,
      contactEmail: f.contactEmail || "",
    };
    const res = editMode && f.id ? await updateSupplier({ ...payload, id: f.id }) : await createSupplier(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/suppliers/${res.data.id}`);
  }

  const foreign = f.supplierType === "FOREIGN";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Tedarikçi Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Ünvan *</Label><Input value={f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Kısa Ad</Label><Input value={f.shortName} onChange={(e) => set({ shortName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tür</Label>
            <Select value={f.supplierType} onChange={(e) => set({ supplierType: e.target.value as "DOMESTIC" | "FOREIGN", country: e.target.value === "FOREIGN" ? (f.country === "TR" ? "" : f.country) : "TR", defaultCurrency: e.target.value === "FOREIGN" ? (f.defaultCurrency === "TRY" ? "EUR" : f.defaultCurrency) : "TRY" })}>
              <option value="DOMESTIC">Yerli</option>
              <option value="FOREIGN">Yabancı</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Ülke (ISO)</Label><Input value={f.country} onChange={(e) => set({ country: e.target.value.toUpperCase() })} placeholder={foreign ? "DE" : "TR"} /></div>
          <div className="space-y-1.5"><Label>Vergi Kimlik Türü</Label>
            <Select value={f.taxIdType} onChange={(e) => set({ taxIdType: e.target.value })}>
              <option value="VKN">VKN</option><option value="TCKN">TCKN</option><option value="VAT">VAT (AB)</option><option value="EIN">EIN (ABD)</option><option value="OTHER">Diğer</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Vergi No</Label><Input value={f.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} /></div>
          {!foreign && <div className="space-y-1.5"><Label>Vergi Dairesi</Label><Input value={f.taxOffice} onChange={(e) => set({ taxOffice: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label>Web Sitesi</Label><Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Adres</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Adres</Label><Input value={f.addressLine} onChange={(e) => set({ addressLine: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Şehir</Label><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Eyalet / Bölge</Label><Input value={f.stateRegion} onChange={(e) => set({ stateRegion: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Posta Kodu</Label><Input value={f.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Ticari Varsayılanlar</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Para Birimi</Label>
            <Select value={f.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><Label>Tercih Dili</Label>
            <Select value={f.preferredLanguage} onChange={(e) => set({ preferredLanguage: e.target.value as "tr" | "en" })}><option value="tr">Türkçe</option><option value="en">English</option></Select>
          </div>
          <div className="space-y-1.5"><Label>Incoterm</Label><Input value={f.defaultIncoterm} onChange={(e) => set({ defaultIncoterm: e.target.value })} placeholder="EXW / FOB / CIF..." /></div>
          <div className="space-y-1.5"><Label>Ödeme Vadesi (gün)</Label><Input type="number" value={f.defaultPaymentTermDays} onChange={(e) => set({ defaultPaymentTermDays: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Risk Seviyesi</Label>
            <Select value={f.riskLevel} onChange={(e) => set({ riskLevel: e.target.value as "LOW" | "MEDIUM" | "HIGH" })}><option value="LOW">Düşük</option><option value="MEDIUM">Orta</option><option value="HIGH">Yüksek</option></Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Operasyon Türleri</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {OPS.map((o) => (
                <label key={o.v} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.operationTypes.includes(o.v)} onChange={() => toggleOp(o.v)} /> {o.l}</label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 sm:col-span-2 pt-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isManufacturer} onChange={(e) => set({ isManufacturer: e.target.checked })} /> Üretici</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isDistributor} onChange={(e) => set({ isDistributor: e.target.checked })} /> Distribütör</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isExporter} onChange={(e) => set({ isExporter: e.target.checked })} /> İhracatçı</label>
          </div>
        </CardContent>
      </Card>

      {!editMode && (
        <Card>
          <CardHeader><CardTitle>Birincil İletişim (opsiyonel)</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Ad Soyad</Label><Input value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>E-posta</Label><Input value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Telefon</Label><Input value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></div>
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : editMode ? "Güncelle" : "Tedarikçi Oluştur"}</Button>
      </div>
    </div>
  );
}
