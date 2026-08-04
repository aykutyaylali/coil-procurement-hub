"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { saveWorkOrder } from "../actions";
import { PRODUCTION_LINES, COIL_TYPES } from "../constants";

type Opt = { id: string; name: string };
export type WorkOrderInitial = {
  id?: string; number: string; customerId: string; customerName: string; salesOfferId: string;
  coilType: string; line: string; targetCoils: string; startDate: string; endDate: string; notes: string;
};

const EMPTY: WorkOrderInitial = {
  number: "", customerId: "", customerName: "", salesOfferId: "",
  coilType: "", line: "", targetCoils: "", startDate: "", endDate: "", notes: "",
};

export function WorkOrderForm({ initial, customers }: { initial?: WorkOrderInitial; customers: Opt[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [f, setF] = useState<WorkOrderInitial>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<WorkOrderInitial>) => setF((s) => ({ ...s, ...p }));
  const isEdit = Boolean(f.id);

  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    const res = await saveWorkOrder({
      id: f.id, number: f.number || undefined, customerId: f.customerId || undefined,
      customerName: f.customerName || undefined, salesOfferId: f.salesOfferId || undefined,
      coilType: f.coilType || undefined, line: f.line || undefined, targetCoils: f.targetCoils || undefined,
      startDate: f.startDate || undefined, endDate: f.endDate || undefined, notes: f.notes || undefined,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push(`/production/work-orders/${res.data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader><CardTitle className="text-base">{t("prodWo.formTitle")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldNumber")}</Label>
            <Input value={f.number} onChange={(e) => set({ number: e.target.value })} placeholder={isEdit ? undefined : t("prodWo.numberPlaceholder")} disabled={isEdit} className={isEdit ? "opacity-70" : ""} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldCustomerRegistered")}</Label>
            <Select value={f.customerId} onChange={(e) => set({ customerId: e.target.value })}>
              <option value="">{t("prodWo.useFreeText")}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldCustomerFreeText")}</Label>
            <Input value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} placeholder={t("prodWo.customerPlaceholder")} disabled={Boolean(f.customerId)} className={f.customerId ? "opacity-70" : ""} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldLine")}</Label>
            <Select value={f.line} onChange={(e) => set({ line: e.target.value })}>
              <option value="">-</option>
              {PRODUCTION_LINES.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldCoilType")}</Label>
            <Select value={f.coilType} onChange={(e) => set({ coilType: e.target.value })}>
              <option value="">-</option>
              {COIL_TYPES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldTargetCoils")}</Label>
            <Input type="number" min={0} value={f.targetCoils} onChange={(e) => set({ targetCoils: e.target.value })} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldStartDate")}</Label>
            <Input type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("prodWo.fieldEndDate")}</Label>
            <Input type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
            <Label>{t("prodWo.fieldNotes")}</Label>
            <Textarea value={f.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[52px]" placeholder={t("prodWo.notesPlaceholder")} />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button onClick={save} disabled={busy}>{busy ? t("prodWo.saving") : isEdit ? t("prodWo.update") : t("prodWo.create")}</Button>
        <Button variant="outline" onClick={() => router.push("/production/work-orders")} disabled={busy}>{t("prodWo.backButton")}</Button>
      </div>
    </div>
  );
}
