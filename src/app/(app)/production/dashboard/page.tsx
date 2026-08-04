import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import {
  activeOperatorCount, activeLines, producedSince, scrapRatePct, elapsedMinutes,
  liveStatus, stationProgress, lineSummary,
  type ProdLogRow, type WorkOrderRow, type StationRow,
} from "@/domain/production";
import { WO_STATUS_LABEL, LOG_STATUS_BADGE, MILESTONE_STATIONS } from "../constants";
import { getActiveStations } from "../data";

export const metadata: Metadata = { title: "Üretim Panosu" };

export default async function ProductionDashboardPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_VIEW);
  const t = user.tenantId;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [workOrders, stations, logsRaw] = await Promise.all([
    prisma.workOrder.findMany({
      where: { tenantId: t, status: { not: "CANCELLED" } }, take: 2000,
      select: { id: true, number: true, customerName: true, line: true, targetCoils: true, completedCoils: true, status: true },
    }),
    getActiveStations(t),
    prisma.productionLog.findMany({
      where: { tenantId: t, OR: [{ checkOutAt: null }, { checkInAt: { gte: startOfToday } }] },
      orderBy: { checkInAt: "desc" }, take: 3000,
      select: {
        id: true, operatorId: true, stationId: true, workOrderId: true, producedQty: true, scrapQty: true,
        status: true, checkInAt: true, checkOutAt: true,
        station: { select: { code: true } }, operator: { select: { name: true } }, workOrder: { select: { number: true, line: true } },
      },
    }),
  ]);

  const stationRows: StationRow[] = stations.map((s) => ({ id: s.id, code: s.code, name: s.name, sequence: s.sequence }));
  const logRows: ProdLogRow[] = logsRaw.map((l) => ({ operatorId: l.operatorId, stationId: l.stationId, workOrderId: l.workOrderId, producedQty: l.producedQty, scrapQty: l.scrapQty, status: l.status, checkInAt: l.checkInAt, checkOutAt: l.checkOutAt }));
  const woRows: WorkOrderRow[] = workOrders.map((w) => ({ id: w.id, line: w.line, targetCoils: w.targetCoils, completedCoils: w.completedCoils, status: w.status }));

  // KPI'lar
  const activeOps = activeOperatorCount(logRows);
  const lines = activeLines(woRows);
  const dailyCoils = producedSince(logRows, startOfToday);
  const scrapPct = scrapRatePct(logRows.filter((l) => l.checkInAt.getTime() >= startOfToday.getTime()));

  // Hat özeti
  const lineRows = lineSummary(woRows);

  // Aktif iş emirleri — kilometre taşı istasyon ilerlemesi (LO→PRO→SPR→TEST)
  const activeWOs = workOrders.filter((w) => w.status === "IN_PROGRESS").slice(0, 12);
  const milestoneSet = new Set<string>(MILESTONE_STATIONS);
  const woProgress = activeWOs.map((w) => {
    const prog = stationProgress({ id: w.id, line: w.line, targetCoils: w.targetCoils, completedCoils: w.completedCoils, status: w.status }, logRows, stationRows)
      .filter((p) => milestoneSet.has(p.code));
    return { wo: w, prog };
  });

  // Operatör zaman akışı (açık oturumlar)
  const openSessions = logsRaw.filter((l) => !l.checkOutAt);

  return (
    <div>
      <PageHeader title="Üretim Panosu" description="MES / Shop Floor — canlı saha durumu, hat ve istasyon ilerlemesi." />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Aktif Çalışan" value={String(activeOps)} sub="açık oturum" />
        <Kpi label="Aktif Hatlar" value={String(lines.length)} sub={lines.join(", ") || "—"} />
        <Kpi label="Günlük Çıkan Bobin" value={String(dailyCoils)} sub="bugün üretilen" />
        <Kpi label="Fire / Hata Oranı" value={`%${scrapPct}`} sub="bugün" tone={scrapPct >= 5 ? "danger" : undefined} />
      </div>

      {/* Hat bazlı ilerleme */}
      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base">Hat Bazlı İlerleme</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {lineRows.length === 0 ? <p className="text-sm text-muted-foreground">Henüz iş emri yok.</p> : lineRows.map((l) => (
            <div key={l.line} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-sm font-medium">{l.line}</div>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${l.pct}%` }} /></div>
              <div className="w-40 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{l.completed}/{l.target} · {l.activeWos} aktif İE</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* İş emri istasyon ilerlemesi */}
      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base">Aktif İş Emirleri — İstasyon İlerlemesi (LO → PRO → SPR → TEST)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {woProgress.length === 0 ? <EmptyState title="Üretimde iş emri yok" /> : (
            <Table>
              <THead><TR><TH>İş Emri</TH><TH>Müşteri</TH><TH>Hat</TH>{MILESTONE_STATIONS.map((s) => <TH key={s} className="text-center">{s}</TH>)}<TH className="text-center">Toplam</TH></TR></THead>
              <TBody>{woProgress.map(({ wo, prog }) => (
                <TR key={wo.id}>
                  <TD><Link href={`/production/work-orders/${wo.id}`} className="font-medium text-primary hover:underline">{wo.number}</Link></TD>
                  <TD className="text-sm">{wo.customerName ?? "—"}</TD>
                  <TD className="text-xs">{wo.line ? <Badge tone="neutral">{wo.line}</Badge> : "—"}</TD>
                  {MILESTONE_STATIONS.map((code) => {
                    const p = prog.find((x) => x.code === code);
                    return <TD key={code} className="text-center text-xs tabular-nums">{p ? `%${p.pct}` : "—"}</TD>;
                  })}
                  <TD className="text-center text-xs tabular-nums font-medium">{wo.completedCoils}/{wo.targetCoils}</TD>
                </TR>
              ))}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Operatör zaman akışı */}
      <Card className="mt-8">
        <CardHeader><CardTitle className="text-base">Operatör Zaman Akışı (Canlı)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {openSessions.length === 0 ? <EmptyState title="Açık oturum yok" hint="Saha terminalinden operatör giriş yaptıkça burada görünür." /> : (
            <Table>
              <THead><TR><TH>Operatör</TH><TH>İş Emri</TH><TH>İstasyon</TH><TH>Hat</TH><TH className="text-center">Üretim</TH><TH className="text-center">Süre</TH><TH>Durum</TH></TR></THead>
              <TBody>{openSessions.map((l) => {
                const st = liveStatus(l);
                const badge = LOG_STATUS_BADGE[st]!;
                const mins = elapsedMinutes(l.checkInAt, now);
                return (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.operator.name}</TD>
                    <TD className="text-sm"><Link href={`/production/work-orders/${l.workOrderId}`} className="text-primary hover:underline">{l.workOrder.number}</Link></TD>
                    <TD className="text-sm">{l.station.code}</TD>
                    <TD className="text-xs">{l.workOrder.line ? <Badge tone="neutral">{l.workOrder.line}</Badge> : "—"}</TD>
                    <TD className="text-center tabular-nums">{l.producedQty}</TD>
                    <TD className="text-center text-xs tabular-nums text-muted-foreground">{Math.floor(mins / 60)}s {mins % 60}dk</TD>
                    <TD className="text-sm">{badge.dot} {badge.label}</TD>
                  </TR>
                );
              })}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value}</p>
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
