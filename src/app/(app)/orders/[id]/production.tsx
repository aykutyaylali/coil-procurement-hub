"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { PRODUCTION_STAGES } from "@/domain/state-machines";
import { updateProductionStage } from "./production-actions";

/**
 * Üretim ilerlemesi: görsel stepper + (yetkiliyse) aşama güncelleme formu.
 * Aşama etiketleri sunucudan çevrili gelir (stageLabels); enum kodu DB'de saklanır.
 */
export function ProductionPanel({
  orderId,
  currentStage,
  allowedNext,
  canUpdate,
  stageLabels,
}: {
  orderId: string;
  currentStage: string | null;
  allowedNext: string[];
  canUpdate: boolean;
  stageLabels: Record<string, string>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(allowedNext[0] ?? "");
  const [note, setNote] = useState("");
  const [estDate, setEstDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentIdx = currentStage ? PRODUCTION_STAGES.indexOf(currentStage as (typeof PRODUCTION_STAGES)[number]) : -1;

  async function save() {
    if (!stage || busy) return;
    setBusy(true);
    setError("");
    const res = await updateProductionStage({ orderId, stage, note: note || undefined, estDate: estDate || undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOpen(false);
    setNote("");
    setEstDate("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <div className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 py-1">
          {PRODUCTION_STAGES.map((st, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            const tone = current
              ? "border-primary bg-primary text-primary-foreground"
              : done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border bg-muted text-muted-foreground";
            return (
              <li key={st} className="flex items-center">
                <div className="flex flex-col items-center gap-1" title={stageLabels[st]}>
                  <span className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${tone}`}>
                    {done ? <Check className="size-4" /> : i + 1}
                  </span>
                  <span className={`max-w-[80px] whitespace-normal text-center text-[10px] leading-tight ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {stageLabels[st]}
                  </span>
                </div>
                {i < PRODUCTION_STAGES.length - 1 && <span className={`mx-1 h-0.5 w-6 ${i < currentIdx ? "bg-emerald-500" : "bg-border"}`} />}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Factory className="size-4 text-primary" />
          {currentStage ? (
            <span>{t("po.production.currentStage")}: <b>{stageLabels[currentStage]}</b></span>
          ) : (
            <span className="text-muted-foreground">{t("po.production.notStarted")}</span>
          )}
        </span>
        {canUpdate && allowedNext.length > 0 && (
          <Button size="sm" variant={open ? "secondary" : "outline"} onClick={() => setOpen((v) => !v)}>
            {currentStage ? t("po.production.update") : t("po.production.start")}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border p-3">
          {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("po.production.selectStage")}</Label>
              <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                {allowedNext.map((s) => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("po.production.estDate")}</Label>
              <Input type="date" value={estDate} onChange={(e) => setEstDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("po.production.note")}</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[56px]" />
          </div>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? t("po.production.saving") : t("action.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
