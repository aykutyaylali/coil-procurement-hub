import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { translator, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { stationProgress, woProgressPct, liveStatus, type ProdLogRow, type StationRow } from "@/domain/production";
import { WO_STATUS_LABEL, LOG_STATUS_BADGE } from "../../constants";
import { getActiveStations } from "../../data";
import { WorkOrderForm, type WorkOrderInitial } from "../wo-form";

export const metadata: Metadata = { title: "İş Emri" };

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.PRODUCTION_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.PRODUCTION_MANAGE);

  const wo = await prisma.workOrder.findFirst({ where: { id, tenantId: user.tenantId } });
  if (!wo) notFound();

  const [stations, logs, customers] = await Promise.all([
    getActiveStations(user.tenantId),
    prisma.productionLog.findMany({
      where: { tenantId: user.tenantId, workOrderId: wo.id }, orderBy: { checkInAt: "desc" }, take: 100,
      select: {
        id: true, operatorId: true, stationId: true, workOrderId: true, producedQty: true, scrapQty: true,
        status: true, checkInAt: true, checkOutAt: true, elapsedMinutes: true,
        station: { select: { code: true, name: true } }, operator: { select: { name: true } },
      },
    }),
    canManage ? prisma.customer.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  const stationRows: StationRow[] = stations.map((s) => ({ id: s.id, code: s.code, name: s.name, sequence: s.sequence }));
  const logRows: ProdLogRow[] = logs.map((l) => ({ operatorId: l.operatorId, stationId: l.stationId, workOrderId: l.workOrderId, producedQty: l.producedQty, scrapQty: l.scrapQty, status: l.status, checkInAt: l.checkInAt, checkOutAt: l.checkOutAt }));
  const progress = stationProgress({ id: wo.id, line: wo.line, targetCoils: wo.targetCoils, completedCoils: wo.completedCoils, status: wo.status }, logRows, stationRows);
  const overallPct = woProgressPct(wo);

  const initial: WorkOrderInitial = {
    id: wo.id, number: wo.number, customerId: wo.customerId ?? "", customerName: wo.customerName ?? "", salesOfferId: wo.salesOfferId ?? "",
    coilType: wo.coilType ?? "", line: wo.line ?? "", targetCoils: String(wo.targetCoils), startDate: ymd(wo.startDate), endDate: ymd(wo.endDate), notes: wo.notes ?? "",
  };

  return (
    <div>
      <PageHeader
        title={T("prodWo.detailTitle", { n: wo.number })}
        description={`${wo.customerName ?? "—"} · ${wo.coilType?.replace(/_/g, " ") ?? "—"}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={statusTone(wo.status)}>{WO_STATUS_LABEL[wo.status] ? T(`prodWo.woStatus.${wo.status}`) : wo.status}</Badge>
        {wo.line && <Badge tone="neutral">{wo.line}</Badge>}
        <span className="text-sm text-muted-foreground">{T("prodWo.completedLabel")} <b className="tabular-nums text-foreground">{wo.completedCoils}/{wo.targetCoils}</b> (%{overallPct})</span>
        <div className="ml-auto flex gap-2">
          <a href={`/production/work-orders/${wo.id}/label?lang=tr`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"><Printer className="size-4" /> {T("prodWo.barcodeTr")}</a>
          <a href={`/production/work-orders/${wo.id}/label?lang=en`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"><Printer className="size-4" /> {T("prodWo.barcodeEn")}</a>
        </div>
      </div>

      {/* İstasyon bazlı ilerleme */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">{T("prodWo.stationProgressTitle")}</CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          {progress.map((p) => (
            <div key={p.code} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-xs"><span className="font-medium">{p.code}</span> <span className="text-muted-foreground">· {p.sequence}</span></div>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} /></div>
              <div className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{p.produced}/{p.target}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Üretim kayıtları */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-base">{T("prodWo.logsTitle")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? <EmptyState title={T("prodWo.logsEmptyTitle")} hint={T("prodWo.logsEmptyHint")} /> : (
            <Table>
              <THead><TR><TH>{T("prodWo.thOperator")}</TH><TH>{T("prodWo.thStation")}</TH><TH className="text-center">{T("prodWo.thProduction")}</TH><TH className="text-center">{T("prodWo.thScrap")}</TH><TH>{T("prodWo.thCheckIn")}</TH><TH>{T("prodWo.thCheckOut")}</TH><TH className="text-center">{T("prodWo.thDurationMin")}</TH><TH>{T("prodWo.thStatus")}</TH></TR></THead>
              <TBody>{logs.map((l) => {
                const st = liveStatus(l);
                const badge = LOG_STATUS_BADGE[st]!;
                return (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.operator.name}</TD>
                    <TD className="text-sm">{l.station.code} · {l.station.name}</TD>
                    <TD className="text-center tabular-nums">{l.producedQty}</TD>
                    <TD className="text-center tabular-nums text-destructive">{l.scrapQty || "—"}</TD>
                    <TD className="text-sm text-muted-foreground">{formatDate(l.checkInAt, undefined, "dd.MM HH:mm")}</TD>
                    <TD className="text-sm text-muted-foreground">{l.checkOutAt ? formatDate(l.checkOutAt, undefined, "dd.MM HH:mm") : "—"}</TD>
                    <TD className="text-center tabular-nums">{l.elapsedMinutes ?? "—"}</TD>
                    <TD className="text-sm">{badge.dot} {T(`prodWo.logStatus.${st}`)}</TD>
                  </TR>
                );
              })}</TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Düzenleme (yalnız yönetim) */}
      {canManage ? (
        <>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{T("prodWo.editTitle")}</h2>
          <WorkOrderForm initial={initial} customers={customers} />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{T("prodWo.notesLabel")} {wo.notes ?? "—"}</p>
      )}
      <div className="mt-4">
        <Link href="/production/work-orders" className="text-sm text-primary hover:underline">{T("prodWo.backToList")}</Link>
      </div>
    </div>
  );
}
