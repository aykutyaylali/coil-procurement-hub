"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { countryFlag } from "@/lib/country";
import { useI18n } from "@/components/i18n-provider";
import { saveCustomer } from "../actions";

export interface CustomerRow {
  id: string; code: string; name: string; country: string; industry: string | null;
  contactName: string | null; contactEmail: string | null; contactPhone: string | null;
  salesRepId: string | null; salesRepName?: string | null; defaultCurrency: string; notes: string | null;
}
type Opt = { id: string; name: string };

const INDUSTRIES = ["OEM", "REPAIR", "UTILITY", "OTHER"];
const CURRENCIES = ["EUR", "USD", "TRY"];

export function CustomerManager({ customers, salesReps, canManage }: { customers: CustomerRow[]; salesReps: Opt[]; canManage: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const empty: CustomerRow = { id: "", code: "", name: "", country: "TR", industry: "", contactName: "", contactEmail: "", contactPhone: "", salesRepId: "", defaultCurrency: "EUR", notes: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<CustomerRow>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p: Partial<CustomerRow>) => setF((s) => ({ ...s, ...p }));

  function edit(c: CustomerRow) { setF({ ...c, industry: c.industry ?? "", contactName: c.contactName ?? "", contactEmail: c.contactEmail ?? "", contactPhone: c.contactPhone ?? "", salesRepId: c.salesRepId ?? "", notes: c.notes ?? "" }); setOpen(true); setError(""); }
  function add() { setF(empty); setOpen(true); setError(""); }

  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    const res = await saveCustomer({ ...f, id: f.id || undefined, industry: f.industry || undefined, contactEmail: f.contactEmail || undefined, salesRepId: f.salesRepId || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setOpen(false); router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage && !open && <Button onClick={add}><Plus className="size-4" /> {t("salesCust.new")}</Button>}
      {open && (
        <Card>
          <CardHeader><CardTitle className="text-base">{f.id ? t("salesCust.edit") : t("salesCust.new")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5"><Label>{t("salesCust.field.name")}</Label><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.country")}</Label><Input value={f.country} onChange={(e) => set({ country: e.target.value.toUpperCase().slice(0, 2) })} placeholder={t("salesCust.field.countryPlaceholder")} /></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.industry")}</Label><Select value={f.industry ?? ""} onChange={(e) => set({ industry: e.target.value })}><option value="">-</option>{INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}</Select></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.contactName")}</Label><Input value={f.contactName ?? ""} onChange={(e) => set({ contactName: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.email")}</Label><Input value={f.contactEmail ?? ""} onChange={(e) => set({ contactEmail: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.phone")}</Label><Input value={f.contactPhone ?? ""} onChange={(e) => set({ contactPhone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.salesRep")}</Label><Select value={f.salesRepId ?? ""} onChange={(e) => set({ salesRepId: e.target.value })}><option value="">-</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></div>
              <div className="space-y-1.5"><Label>{t("salesCust.field.defaultCurrency")}</Label><Select value={f.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
            </div>
            <div className="space-y-1.5"><Label>{t("salesCust.field.notes")}</Label><Textarea value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} className="min-h-[48px]" /></div>
            <div className="flex gap-2"><Button size="sm" onClick={save} disabled={busy}>{busy ? t("salesCust.saving") : t("salesCust.save")}</Button><Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t("salesCust.cancel")}</Button></div>
          </CardContent>
        </Card>
      )}
      <Card>
        {customers.length === 0 ? <EmptyState title={t("salesCust.empty.title")} hint={canManage ? t("salesCust.empty.hint") : undefined} /> : (
          <Table>
            <THead><TR><TH>{t("salesCust.col.code")}</TH><TH>{t("salesCust.col.name")}</TH><TH>{t("salesCust.col.country")}</TH><TH>{t("salesCust.col.industry")}</TH><TH>{t("salesCust.col.salesRep")}</TH><TH>{t("salesCust.col.currency")}</TH>{canManage && <TH></TH>}</TR></THead>
            <TBody>{customers.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs">{c.code}</TD>
                <TD className="font-medium">{c.name}</TD>
                <TD>{countryFlag(c.country)} {c.country}</TD>
                <TD className="text-sm text-muted-foreground">{c.industry ?? "—"}</TD>
                <TD className="text-sm">{c.salesRepName ?? "—"}</TD>
                <TD>{c.defaultCurrency}</TD>
                {canManage && <TD className="text-right"><Button size="sm" variant="ghost" onClick={() => edit(c)}><Pencil className="size-3.5" /></Button></TD>}
              </TR>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
