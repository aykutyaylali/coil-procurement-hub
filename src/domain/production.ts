/**
 * Üretim Saha (MES) — saf metrik/aggregation yardımcıları.
 * FX/DB yok; yalnız düz satır tipleri. Tam birim-test edilebilir.
 * Zaman bağımlı fonksiyonlar `now` parametresi alır (determinist test için).
 */

export type ProdLogRow = {
  operatorId: string;
  stationId: string;
  workOrderId: string;
  producedQty: number;
  scrapQty: number;
  status: string; // ACTIVE | PAUSED | DONE
  checkInAt: Date;
  checkOutAt: Date | null;
};

export type WorkOrderRow = {
  id: string;
  line: string | null;
  targetCoils: number;
  completedCoils: number;
  status: string;
};

export type StationRow = { id: string; code: string; name: string; sequence: number };

/** İki zaman arası tam dakika (negatifse 0). */
export function elapsedMinutes(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 60000);
}

/** Bir kaydın canlı durumu: çıkış yapıldıysa DONE, aksi halde kayıt durumu. */
export function liveStatus(log: Pick<ProdLogRow, "status" | "checkOutAt">): "ACTIVE" | "PAUSED" | "DONE" {
  if (log.checkOutAt) return "DONE";
  return log.status === "PAUSED" ? "PAUSED" : "ACTIVE";
}

export function totalProduced(logs: ProdLogRow[]): number {
  return logs.reduce((s, l) => s + l.producedQty, 0);
}

export function totalScrap(logs: ProdLogRow[]): number {
  return logs.reduce((s, l) => s + l.scrapQty, 0);
}

/** Fire/hata oranı yüzdesi: scrap / (üretim + scrap) * 100, 1 ondalık. */
export function scrapRatePct(logs: ProdLogRow[]): number {
  const produced = totalProduced(logs);
  const scrap = totalScrap(logs);
  const denom = produced + scrap;
  if (denom === 0) return 0;
  return Math.round((scrap / denom) * 1000) / 10;
}

/** Açık oturumu (çıkış yapılmamış, DONE olmayan) olan benzersiz operatör sayısı. */
export function activeOperatorCount(logs: ProdLogRow[]): number {
  const set = new Set<string>();
  for (const l of logs) if (liveStatus(l) !== "DONE") set.add(l.operatorId);
  return set.size;
}

/** IN_PROGRESS iş emirlerinde kullanılan benzersiz hatlar. */
export function activeLines(wos: WorkOrderRow[]): string[] {
  const set = new Set<string>();
  for (const w of wos) if (w.status === "IN_PROGRESS" && w.line) set.add(w.line);
  return [...set].sort();
}

/** Verilen andan (ör. gün başı) itibaren check-in yapılmış kayıtların ürettiği bobin. */
export function producedSince(logs: ProdLogRow[], since: Date): number {
  return logs.filter((l) => l.checkInAt.getTime() >= since.getTime()).reduce((s, l) => s + l.producedQty, 0);
}

/** Bir iş emrinin istasyon bazlı ilerlemesi: her istasyonda üretilen vs hedef (%). */
export function stationProgress(
  wo: WorkOrderRow,
  logs: ProdLogRow[],
  stations: StationRow[],
): { code: string; name: string; sequence: number; produced: number; target: number; pct: number }[] {
  const woLogs = logs.filter((l) => l.workOrderId === wo.id);
  return [...stations]
    .sort((a, b) => a.sequence - b.sequence)
    .map((st) => {
      const produced = woLogs.filter((l) => l.stationId === st.id).reduce((s, l) => s + l.producedQty, 0);
      const target = wo.targetCoils;
      const pct = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
      return { code: st.code, name: st.name, sequence: st.sequence, produced, target, pct };
    });
}

/** Hat bazlı özet: aktif iş emri sayısı, toplam hedef/tamamlanan. */
export function lineSummary(
  wos: WorkOrderRow[],
): { line: string; activeWos: number; target: number; completed: number; pct: number }[] {
  const map = new Map<string, { activeWos: number; target: number; completed: number }>();
  for (const w of wos) {
    const line = w.line ?? "—";
    const cur = map.get(line) ?? { activeWos: 0, target: 0, completed: 0 };
    if (w.status === "IN_PROGRESS" || w.status === "PLANNED") cur.activeWos += 1;
    cur.target += w.targetCoils;
    cur.completed += w.completedCoils;
    map.set(line, cur);
  }
  return [...map.entries()]
    .map(([line, v]) => ({ line, ...v, pct: v.target > 0 ? Math.min(100, Math.round((v.completed / v.target) * 100)) : 0 }))
    .sort((a, b) => a.line.localeCompare(b.line));
}

/** İş emri tamamlanma yüzdesi. */
export function woProgressPct(wo: Pick<WorkOrderRow, "targetCoils" | "completedCoils">): number {
  if (wo.targetCoils <= 0) return 0;
  return Math.min(100, Math.round((wo.completedCoils / wo.targetCoils) * 100));
}
