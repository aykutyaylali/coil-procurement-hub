"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { createContract, updateContract } from "./actions";

interface Item { description: string; unitPrice: string; uom: string }
export interface ContractInitial {
  id?: string;
  supplierId: string;
  title: string;
  type: string;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  noticeDate: string;
  currency: string;
  totalLimit: string;
  slaTerms: string;
}

const TYPES = [
  { v: "FRAMEWORK", l: "Çerçeve Sözleşme" },
  { v: "PRICE_LIST", l: "Fiyat Listesi" },
  { v: "SERVICE", l: "Hizmet Sözleşmesi" },
  { v: "NDA", l: "Gizlilik (NDA)" },
];

export function ContractForm({
  suppliers,
  currencies,
  initial,
  editMode,
}: {
  suppliers: { id: string; name: string }[];
  currencies: string[];
  initial?: ContractInitial;
  editMode?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [f, setF] = useState<ContractInitial>(
    initial ?? { supplierId: suppliers[0]?.id ?? "", title: "", type: "FRAMEWORK", startDate: "", endDate: "", autoRenew: false, noticeDate: "", currency: currencies[0] ?? "TRY", totalLimit: "", slaTerms: "" },
  );
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<ContractInitial>) => setF((p) => ({ ...p, ...patch }));

  async function submit() {
    setBusy(true); setError("");
    const payload = { ...f, totalLimit: f.totalLimit || undefined, startDate: f.startDate || undefined, endDate: f.endDate || undefined, noticeDate: f.noticeDate || undefined, slaTerms: f.slaTerms || undefined };
    const res = editMode && f.id
      ? await updateContract({ ...payload, id: f.id })
      : await createContract({ ...payload, items: items.filter((i) => i.description.trim()) });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/contracts/${res.data.id}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("con.form.info")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("con.form.supplier")}</Label>
            <Select value={f.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t("con.form.title")}</Label><Input value={f.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("con.field.type")}</Label>
            <Select value={f.type} onChange={(e) => set({ type: e.target.value })}>{TYPES.map((ty) => <option key={ty.v} value={ty.v}>{t(`con.type.${ty.v}` as never)}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><Label>{t("con.field.currency")}</Label>
            <Select value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
          </div>
          <div className="space-y-1.5"><Label>{t("con.field.start")}</Label><Input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("con.field.end")}</Label><Input type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("con.field.notice")}</Label><Input type="date" value={f.noticeDate} onChange={(e) => set({ noticeDate: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("con.field.totalLimit")}</Label><Input value={f.totalLimit} onChange={(e) => set({ totalLimit: e.target.value })} placeholder="0.00" /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.autoRenew} onChange={(e) => set({ autoRenew: e.target.checked })} /> {t("con.form.autoRenew")}</label>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>{t("con.form.sla")}</Label><Textarea value={f.slaTerms} onChange={(e) => set({ slaTerms: e.target.value })} placeholder={t("con.form.slaPlaceholder")} /></div>
        </CardContent>
      </Card>

      {!editMode && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("con.form.priceListItems")}</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((p) => [...p, { description: "", unitPrice: "0", uom: "" }])}><Plus className="size-4" /> {t("con.form.addItem")}</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 && <p className="text-sm text-muted-foreground">{t("con.form.itemsHint")}</p>}
            {items.map((it, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12">
                <Input className="sm:col-span-7" placeholder={t("con.item.description")} value={it.description} onChange={(e) => setItems((p) => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
                <Input className="sm:col-span-2" placeholder={t("con.item.pricePlaceholder")} value={it.unitPrice} onChange={(e) => setItems((p) => p.map((x, idx) => idx === i ? { ...x, unitPrice: e.target.value } : x))} />
                <Input className="sm:col-span-2" placeholder={t("con.item.uomPlaceholder")} value={it.uom} onChange={(e) => setItems((p) => p.map((x, idx) => idx === i ? { ...x, uom: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" className="sm:col-span-1" onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>{t("con.cancel")}</Button>
        <Button onClick={submit} disabled={busy}>{busy ? t("con.saving") : editMode ? t("con.update") : t("con.create")}</Button>
      </div>
    </div>
  );
}
