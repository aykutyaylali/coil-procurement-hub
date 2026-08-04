"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { createSupplier, updateSupplier } from "./actions";
import { useI18n } from "@/components/i18n-provider";

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
  { v: "DOMESTIC_PURCHASE", k: "supp.op.domesticPurchase" },
  { v: "IMPORT_PURCHASE", k: "supp.op.import" },
  { v: "EXPORT_RELATED_PURCHASE", k: "supp.op.exportRelated" },
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
  const { t } = useI18n();
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
        <CardHeader><CardTitle>{t("supp.form.supplierInfo")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("supp.field.legalName")} *</Label><Input value={f.legalName} onChange={(e) => set({ legalName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.shortName")}</Label><Input value={f.shortName} onChange={(e) => set({ shortName: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.type")}</Label>
            <Select value={f.supplierType} onChange={(e) => set({ supplierType: e.target.value as "DOMESTIC" | "FOREIGN", country: e.target.value === "FOREIGN" ? (f.country === "TR" ? "" : f.country) : "TR", defaultCurrency: e.target.value === "FOREIGN" ? (f.defaultCurrency === "TRY" ? "EUR" : f.defaultCurrency) : "TRY" })}>
              <option value="DOMESTIC">{t("supp.type.domestic")}</option>
              <option value="FOREIGN">{t("supp.type.foreign")}</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("supp.field.countryIso")}</Label><Input value={f.country} onChange={(e) => set({ country: e.target.value.toUpperCase() })} placeholder={foreign ? "DE" : "TR"} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.taxIdType")}</Label>
            <Select value={f.taxIdType} onChange={(e) => set({ taxIdType: e.target.value })}>
              <option value="VKN">VKN</option><option value="TCKN">TCKN</option><option value="VAT">{t("supp.taxId.vat")}</option><option value="EIN">{t("supp.taxId.ein")}</option><option value="OTHER">{t("supp.taxId.other")}</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("supp.field.taxNumber")}</Label><Input value={f.taxNumber} onChange={(e) => set({ taxNumber: e.target.value })} /></div>
          {!foreign && <div className="space-y-1.5"><Label>{t("supp.field.taxOffice")}</Label><Input value={f.taxOffice} onChange={(e) => set({ taxOffice: e.target.value })} /></div>}
          <div className="space-y-1.5"><Label>{t("supp.field.website")}</Label><Input value={f.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("supp.form.address")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("supp.field.address")}</Label><Input value={f.addressLine} onChange={(e) => set({ addressLine: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.city")}</Label><Input value={f.city} onChange={(e) => set({ city: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.stateRegion")}</Label><Input value={f.stateRegion} onChange={(e) => set({ stateRegion: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.postalCode")}</Label><Input value={f.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("supp.form.commercialDefaults")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("supp.field.currency")}</Label>
            <Select value={f.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><Label>{t("supp.field.preferredLang")}</Label>
            <Select value={f.preferredLanguage} onChange={(e) => set({ preferredLanguage: e.target.value as "tr" | "en" })}><option value="tr">Türkçe</option><option value="en">English</option></Select>
          </div>
          <div className="space-y-1.5"><Label>{t("supp.field.incoterm")}</Label><Input value={f.defaultIncoterm} onChange={(e) => set({ defaultIncoterm: e.target.value })} placeholder="EXW / FOB / CIF..." /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.paymentTermDays")}</Label><Input type="number" value={f.defaultPaymentTermDays} onChange={(e) => set({ defaultPaymentTermDays: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("supp.field.riskLevel")}</Label>
            <Select value={f.riskLevel} onChange={(e) => set({ riskLevel: e.target.value as "LOW" | "MEDIUM" | "HIGH" })}><option value="LOW">{t("supp.risk.low")}</option><option value="MEDIUM">{t("supp.risk.medium")}</option><option value="HIGH">{t("supp.risk.high")}</option></Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("supp.field.operationTypes")}</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {OPS.map((o) => (
                <label key={o.v} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.operationTypes.includes(o.v)} onChange={() => toggleOp(o.v)} /> {t(o.k)}</label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 sm:col-span-2 pt-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isManufacturer} onChange={(e) => set({ isManufacturer: e.target.checked })} /> {t("supp.flag.manufacturer")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isDistributor} onChange={(e) => set({ isDistributor: e.target.checked })} /> {t("supp.flag.distributor")}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.isExporter} onChange={(e) => set({ isExporter: e.target.checked })} /> {t("supp.flag.exporter")}</label>
          </div>
        </CardContent>
      </Card>

      {!editMode && (
        <Card>
          <CardHeader><CardTitle>{t("supp.form.primaryContact")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>{t("supp.field.contactName")}</Label><Input value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("supp.field.contactEmail")}</Label><Input value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>{t("supp.field.contactPhone")}</Label><Input value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} /></div>
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>{t("supp.form.cancel")}</Button>
        <Button onClick={submit} disabled={busy}>{busy ? t("supp.form.saving") : editMode ? t("supp.form.update") : t("supp.form.create")}</Button>
      </div>
    </div>
  );
}
