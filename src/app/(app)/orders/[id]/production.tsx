"use client";
import { useEffect, useState } from "react";
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
  promisedDate,
}: {
  orderId: string;
  currentStage: string | null;
  allowedNext: string[];
  canUpdate: boolean;
  stageLabels: Record<string, string>;
  promisedDate?: string | null; // ISO; proje öngörülen teslim tarihi (varsa)
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(allowedNext[0] ?? "");
  const [note, setNote] = useState("");
  const [estDate, setEstDate] = useState("");
  const [dateOpen, setDateOpen] = useState(false); // tarih alanını göster/gizle
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Sunucudan yeni aşama gelince (router.refresh sonrası) seçimi geçerli varsayılana
  // sıfırla — aksi halde eski `stage` state'i kalır ve aynı aşama tekrar kaydedilir.
  useEffect(() => {
    setStage(allowedNext[0] ?? "");
    setError("");
    // allowedNext, currentStage'den türetilir; tek stabil bağımlılık currentStage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStage]);

  const currentIdx = currentStage ? PRODUCTION_STAGES.indexOf(currentStage as (typeof PRODUCTION_STAGES)[number]) : -1;
  // Görsel dropdown ile state'in ayrışmasına karşı savunma: her zaman geçerli bir hedef gönder.
  const effectiveStage = allowedNext.includes(stage) ? stage : allowedNext[0] ?? "";
  const promisedInput = promisedDate ? promisedDate.slice(0, 10) : ""; // yyyy-mm-dd (tz kaymasız)
  const promisedLabel = promisedDate ? new Date(promisedDate).toLocaleDateString("tr-TR") : "";

  function toggleForm() {
    setOpen((v) => {
      const next = !v;
      if (next) {
        setNote("");
        setEstDate("");
        setError("");
        // Tarih daha önce girilmemişse alanı açık başlat; girilmişse gizle (opsiyonel değiştir).
        setDateOpen(!promisedDate);
      }
      return next;
    });
  }

  async function save() {
    if (!effectiveStage || busy) return;
    setBusy(true);
    setError("");
    const res = await updateProductionStage({ orderId, stage: effectiveStage, note: note || undefined, estDate: estDate || undefined });
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

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Factory className="size-4 shrink-0 text-primary" />
          {currentStage ? (
            <span>{t("po.production.currentStage")}: <b>{stageLabels[currentStage]}</b></span>
          ) : (
            <span className="text-muted-foreground">{t("po.production.notStarted")}</span>
          )}
          {promisedDate && (
            <span className="text-muted-foreground">· {t("po.production.promised")}: <b className="text-foreground">{promisedLabel}</b></span>
          )}
        </span>
        {canUpdate && allowedNext.length > 0 && (
          <Button size="sm" variant={open ? "secondary" : "outline"} className="shrink-0" onClick={toggleForm}>
            {currentStage ? t("po.production.update") : t("po.production.start")}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border p-3">
          {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
          {/* Sade akış: yeni aşama + (opsiyonel) not. Tarih ilk seferde girilir, sonra taşınır. */}
          <div className="space-y-1.5">
            <Label>{t("po.production.selectStage")}</Label>
            <Select value={effectiveStage} onChange={(e) => setStage(e.target.value)}>
              {allowedNext.map((s) => (
                <option key={s} value={s}>{stageLabels[s]}</option>
              ))}
            </Select>
          </div>

          {/* Tarih: girilmişse küçük satır + "Değiştir"; girilmemişse alan inline (opsiyonel) */}
          {promisedDate && !dateOpen ? (
            <div className="text-xs text-muted-foreground">
              {t("po.production.promised")}: <b className="text-foreground">{promisedLabel}</b>
              <button type="button" className="ml-2 text-primary hover:underline" onClick={() => { setEstDate(promisedInput); setDateOpen(true); }}>
                {t("po.production.change")}
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("po.production.estDate")}</Label>
              <Input type="date" value={estDate} onChange={(e) => setEstDate(e.target.value)} />
              {promisedDate ? (
                <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => { setEstDate(""); setDateOpen(false); }}>
                  {t("action.cancel")}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">{t("po.production.dateOnceHint")}</p>
              )}
            </div>
          )}

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
