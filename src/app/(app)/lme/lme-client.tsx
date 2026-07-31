"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Archive, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { lmeUsdPerKg } from "@/domain/lme-pricing";
import { parseTrNumber } from "@/lib/money";
import { saveLmeRecord, setLmeStatus } from "./actions";

/** Yeni LME Bakır kaydı formu — canlı USD/kg önizlemeli, Türkçe sayı formatı destekli. */
export function LmeForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [priceDate, setPriceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState("DAILY_SPOT");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [usdPerTon, setUsdPerTon] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const preview = usdPerTon.trim() ? lmeUsdPerKg(parseTrNumber(usdPerTon)) : "—";

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await saveLmeRecord({ priceDate, usdPerTon, kind, periodStart: periodStart || undefined, periodEnd: periodEnd || undefined, source: source || undefined, note: note || undefined });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setUsdPerTon(""); setSource(""); setNote(""); setPeriodStart(""); setPeriodEnd(""); setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="mb-4">
        <Plus className="size-4" /> {t("lme.new")}
      </Button>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle className="text-base">{t("lme.new")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t("lme.kind")}</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="DAILY_SPOT">{t("lme.kind.DAILY_SPOT")}</option>
              <option value="WEEKLY_AVG">{t("lme.kind.WEEKLY_AVG")}</option>
            </Select>
          </div>
          {kind === "WEEKLY_AVG" && (
            <>
              <div className="space-y-1.5"><Label>{t("lme.periodStart")}</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{t("lme.periodEnd")}</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>{t("lme.date")}</Label>
            <Input type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("lme.usdPerTon")}</Label>
            <Input inputMode="decimal" value={usdPerTon} onChange={(e) => setUsdPerTon(e.target.value)} placeholder="örn. 9.000,00 veya 9000" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><Calculator className="size-3.5" /> {t("lme.usdPerKg")}</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium">{preview}</div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("lme.source")}</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("lme.sourcePh")} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("lme.note")}</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[48px]" />
        </div>
        <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">{t("lme.help")}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>{busy ? t("lme.saving") : t("action.save")}</Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>{t("action.cancel")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Satır aksiyonları: DRAFT → Onayla / Arşivle. */
export function LmeRowActions({ id, status }: { id: string; status: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(s: "APPROVED" | "ARCHIVED") {
    if (busy) return;
    setBusy(true);
    const res = await setLmeStatus(id, s);
    setBusy(false);
    if (res.ok) router.refresh();
  }
  if (status === "ARCHIVED") return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex justify-end gap-1">
      {status === "DRAFT" && (
        <Button size="sm" variant="outline" onClick={() => act("APPROVED")} disabled={busy} title={t("lme.approve")}>
          <Check className="size-3.5" /> {t("lme.approve")}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => act("ARCHIVED")} disabled={busy} title={t("lme.archive")}>
        <Archive className="size-3.5" />
      </Button>
    </div>
  );
}
