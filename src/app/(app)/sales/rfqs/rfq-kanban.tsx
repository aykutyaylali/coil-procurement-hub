"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setSalesRfqStatus } from "../actions";
import { useI18n } from "@/components/i18n-provider";
import { countryFlag } from "@/lib/country";

export type KanbanCard = {
  id: string; number: string; customerName: string; country: string;
  status: string; salesRepName: string | null; industry: string | null; offersCount: number;
};

const COLUMNS: { key: string; accent: string }[] = [
  { key: "REQUEST", accent: "border-t-sky-500" },
  { key: "IN_PROCESS", accent: "border-t-amber-500" },
  { key: "OFFERED", accent: "border-t-green-500" },
  { key: "REJECTED", accent: "border-t-red-500" },
];
const NEXT: Record<string, string | null> = { REQUEST: "IN_PROCESS", IN_PROCESS: "OFFERED", OFFERED: null, REJECTED: null };

export function RfqKanban({ cards: initial, canManage }: { cards: KanbanCard[]; canManage: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function move(id: string, status: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    const res = await setSalesRfqStatus(id, status);
    if (!res.ok) { setError(res.error); setCards(prev); return; }
    setError("");
    router.refresh();
  }

  return (
    <div>
      {error && <p className="mb-3 rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.status === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (canManage && dragId) { e.preventDefault(); setOverCol(col.key); } }}
              onDragLeave={() => setOverCol((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOverCol(null); if (canManage && dragId) move(dragId, col.key); setDragId(null); }}
              className={`rounded-lg border border-t-4 ${col.accent} bg-muted/20 p-2 transition-colors ${overCol === col.key ? "ring-2 ring-primary/40" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{t(`salesRfq.status.${col.key}`)}</span>
                <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">{colCards.length}</span>
              </div>
              <div className="space-y-2">
                {colCards.map((c) => (
                  <div
                    key={c.id}
                    draggable={canManage}
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    className={`rounded-md border bg-background p-2.5 text-sm shadow-sm ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <Link href={`/sales/rfqs/${c.id}`} className="font-medium text-primary hover:underline">{c.number}</Link>
                      {c.offersCount > 0 && <span className="text-xs text-green-600">{t("salesRfq.kanban.offers", { n: c.offersCount })}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-foreground/80">{countryFlag(c.country)} {c.customerName}</p>
                    <p className="text-xs text-muted-foreground">{[c.industry, c.salesRepName].filter(Boolean).join(" · ") || "—"}</p>
                    {canManage && NEXT[col.key] && (
                      <button onClick={() => move(c.id, NEXT[col.key]!)} className="mt-1.5 text-xs text-primary hover:underline">
                        → {t(`salesRfq.status.${NEXT[col.key]!}`)}
                      </button>
                    )}
                  </div>
                ))}
                {colCards.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t("salesRfq.kanban.empty")}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {canManage && <p className="mt-3 text-xs text-muted-foreground">{t("salesRfq.kanban.hint")}</p>}
    </div>
  );
}
