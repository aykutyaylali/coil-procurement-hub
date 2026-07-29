import Link from "next/link";
import { Check } from "lucide-react";
import { CASE_STAGES, CASE_STAGE_LABELS, type CaseStage } from "@/domain/procurement-case";

const STAGE_TAB: Record<CaseStage, string> = {
  REQUEST: "genel",
  REVIEW: "kalemler",
  RFQ: "teklif",
  AWAITING_BIDS: "teklif",
  EVALUATION: "karsilastirma",
  ORDER: "siparis",
  DELIVERY: "teslimat",
  INVOICE: "fatura",
  DONE: "genel",
};

export function ProcessStepper({ id, stage, problem }: { id: string; stage: CaseStage; problem?: boolean }) {
  const currentIdx = CASE_STAGES.indexOf(stage);
  return (
    <nav aria-label="Süreç adımları" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1 py-2">
        {CASE_STAGES.map((st, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const tone = current
            ? problem
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-primary bg-primary text-primary-foreground"
            : done
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-muted text-muted-foreground";
          return (
            <li key={st} className="flex items-center">
              <Link
                href={`/islem-merkezi/${id}?tab=${STAGE_TAB[st]}`}
                className="group flex flex-col items-center gap-1"
                title={CASE_STAGE_LABELS[st]}
              >
                <span className={`flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition ${tone}`}>
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={`whitespace-nowrap text-[11px] ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {CASE_STAGE_LABELS[st]}
                </span>
              </Link>
              {i < CASE_STAGES.length - 1 && (
                <span className={`mx-1 h-0.5 w-6 ${i < currentIdx ? "bg-emerald-500" : "bg-border"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
