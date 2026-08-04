import { formatMoney } from "@/lib/money";
import type { PipelineStage, TrendPoint, MoneyByCurrency } from "@/domain/sales-analytics";

const STAGE_COLOR: Record<string, string> = {
  REQUEST: "bg-sky-500/70",
  IN_PROCESS: "bg-amber-500/70",
  OPEN: "bg-blue-500/70",
  ORDER: "bg-green-500/70",
  CLOSED: "bg-muted-foreground/40",
};

export function MoneyChips({ amount, className = "" }: { amount: MoneyByCurrency; className?: string }) {
  const entries = Object.entries(amount).filter(([, v]) => Number(v) !== 0);
  if (entries.length === 0) return <span className={`text-xs text-muted-foreground ${className}`}>—</span>;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {entries.map(([cur, v]) => (
        <span key={cur} className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums">{formatMoney(v, cur)}</span>
      ))}
    </span>
  );
}

/** Yatay huni: genişlik aşama adedine orantılı. */
export function FunnelChart({ stages }: { stages: PipelineStage[] }) {
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const w = Math.max(6, Math.round((s.count / maxCount) * 100));
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-sm text-muted-foreground">{s.label}</div>
            <div className="flex-1">
              <div className={`flex h-8 items-center rounded ${STAGE_COLOR[s.key] ?? "bg-primary/60"} px-2 text-sm font-medium text-foreground`} style={{ width: `${w}%` }}>
                {s.count}
              </div>
            </div>
            <div className="w-40 shrink-0 text-right"><MoneyChips amount={s.amount} className="justify-end" /></div>
          </div>
        );
      })}
    </div>
  );
}

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${mm}/${(y ?? "").slice(2)}`;
};

/** Aylık teklif vs sipariş hacmi — gruplu dikey çubuk grafiği (tek para birimi). */
export function TrendChart({ currency, points }: { currency: string; points: TrendPoint[] }) {
  const max = Math.max(1, ...points.flatMap((p) => [Number(p.offered), Number(p.ordered)]));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{currency}</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-blue-500/70" /> Teklif</span>
          <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-green-500/70" /> Sipariş</span>
        </span>
      </div>
      <div className="flex items-end gap-3 border-b pb-1" style={{ height: "140px" }}>
        {points.map((p) => (
          <div key={p.month} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: "110px" }}>
              <div className="w-1/2 rounded-t bg-blue-500/70" style={{ height: `${(Number(p.offered) / max) * 100}%` }} title={`Teklif: ${formatMoney(p.offered, currency)}`} />
              <div className="w-1/2 rounded-t bg-green-500/70" style={{ height: `${(Number(p.ordered) / max) * 100}%` }} title={`Sipariş: ${formatMoney(p.ordered, currency)}`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{monthLabel(p.month)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
