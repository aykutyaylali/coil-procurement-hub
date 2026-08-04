"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { createBudget, updateBudget } from "./actions";

interface Opt { id: string; name: string; companyId?: string }
export interface BudgetInitial {
  id?: string; companyId: string; costCenterId: string; projectId: string; categoryId: string;
  fiscalYear: string; period: string; currency: string; plannedAmount: string;
}

export function BudgetForm({
  companies, costCenters, projects, categories, currencies, initial, editMode,
}: {
  companies: Opt[]; costCenters: Opt[]; projects: Opt[]; categories: Opt[]; currencies: string[];
  initial?: BudgetInitial; editMode?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [f, setF] = useState<BudgetInitial>(
    initial ?? { companyId: companies[0]?.id ?? "", costCenterId: "", projectId: "", categoryId: "", fiscalYear: String(new Date().getFullYear()), period: "YEAR", currency: currencies[0] ?? "TRY", plannedAmount: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<BudgetInitial>) => setF((s) => ({ ...s, ...p }));
  const ccFiltered = costCenters.filter((c) => c.companyId === f.companyId);
  const prFiltered = projects.filter((p) => p.companyId === f.companyId);

  async function submit() {
    setBusy(true); setError("");
    const payload = { ...f, costCenterId: f.costCenterId || undefined, projectId: f.projectId || undefined, categoryId: f.categoryId || undefined };
    const res = editMode && f.id ? await updateBudget({ ...payload, id: f.id }) : await createBudget(payload);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(`/budgets/${res.data.id}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{t("bud.form.title")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{t("bud.form.company")}</Label><Select value={f.companyId} onChange={(e) => set({ companyId: e.target.value, costCenterId: "", projectId: "" })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.costCenter")}</Label><Select value={f.costCenterId} onChange={(e) => set({ costCenterId: e.target.value })}><option value="">{t("bud.form.companyWide")}</option>{ccFiltered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.project")}</Label><Select value={f.projectId} onChange={(e) => set({ projectId: e.target.value })}><option value="">-</option>{prFiltered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.category")}</Label><Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">-</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.fiscalYear")}</Label><Input type="number" value={f.fiscalYear} onChange={(e) => set({ fiscalYear: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("bud.form.period")}</Label><Select value={f.period} onChange={(e) => set({ period: e.target.value })}><option value="YEAR">{t("bud.period.YEAR")}</option><option value="MONTH">{t("bud.period.MONTH")}</option></Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.currency")}</Label><Select value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>{t("bud.form.plannedAmount")}</Label><Input value={f.plannedAmount} onChange={(e) => set({ plannedAmount: e.target.value })} placeholder="0.00" /></div>
        </CardContent>
      </Card>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>{t("bud.form.cancel")}</Button>
        <Button onClick={submit} disabled={busy}>{busy ? t("bud.form.saving") : editMode ? t("bud.form.update") : t("bud.form.create")}</Button>
      </div>
    </div>
  );
}
