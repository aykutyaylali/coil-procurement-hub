"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
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
        <CardHeader><CardTitle>Bütçe Tanımı</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Şirket *</Label><Select value={f.companyId} onChange={(e) => set({ companyId: e.target.value, costCenterId: "", projectId: "" })}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Maliyet Merkezi</Label><Select value={f.costCenterId} onChange={(e) => set({ costCenterId: e.target.value })}><option value="">Şirket geneli</option>{ccFiltered.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Proje</Label><Select value={f.projectId} onChange={(e) => set({ projectId: e.target.value })}><option value="">-</option>{prFiltered.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Kategori</Label><Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">-</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Mali Yıl *</Label><Input type="number" value={f.fiscalYear} onChange={(e) => set({ fiscalYear: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Dönem</Label><Select value={f.period} onChange={(e) => set({ period: e.target.value })}><option value="YEAR">Yıllık</option><option value="MONTH">Aylık</option></Select></div>
          <div className="space-y-1.5"><Label>Para Birimi</Label><Select value={f.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
          <div className="space-y-1.5"><Label>Planlanan Tutar *</Label><Input value={f.plannedAmount} onChange={(e) => set({ plannedAmount: e.target.value })} placeholder="0.00" /></div>
        </CardContent>
      </Card>
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={busy}>İptal</Button>
        <Button onClick={submit} disabled={busy}>{busy ? "Kaydediliyor..." : editMode ? "Güncelle" : "Bütçe Oluştur"}</Button>
      </div>
    </div>
  );
}
