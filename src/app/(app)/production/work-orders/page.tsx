import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { translator, type Locale } from "@/lib/i18n";
import { formatDate } from "@/lib/dates";
import { woProgressPct } from "@/domain/production";
import { WORK_ORDER_STATUS, WO_STATUS_LABEL, PRODUCTION_LINES } from "../constants";
import { WorkOrderRowActions } from "./wo-row-actions";

export const metadata: Metadata = { title: "İş Emirleri" };

export default async function WorkOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission(PERMISSIONS.PRODUCTION_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.PRODUCTION_MANAGE);
  const sp = await searchParams;

  const where: Record<string, unknown> = { tenantId: user.tenantId };
  if (sp.status) where.status = sp.status;
  if (sp.line) where.line = sp.line;
  if (sp.q) where.OR = [{ number: { contains: sp.q } }, { customerName: { contains: sp.q } }];

  const [orders, counts] = await Promise.all([
    prisma.workOrder.findMany({
      where, orderBy: { createdAt: "desc" }, take: 300,
      select: { id: true, number: true, customerName: true, line: true, coilType: true, targetCoils: true, completedCoils: true, endDate: true, status: true },
    }),
    prisma.workOrder.groupBy({ by: ["status"], where: { tenantId: user.tenantId }, _count: { _all: true } }),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div>
      <PageHeader title={T("prodWo.listTitle")} description={T("prodWo.listDescription")} action={canManage ? { label: T("prodWo.newWorkOrder"), href: "/production/work-orders/new" } : undefined} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {WORK_ORDER_STATUS.map((s) => (
          <Link key={s} href={`/production/work-orders?status=${s}`}>
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">{T(`prodWo.woStatus.${s}`)}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{countBy[s] ?? 0}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1"><label className="text-xs font-medium">{T("prodWo.searchLabel")}</label><input name="q" defaultValue={sp.q ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm" placeholder="WO-… / ABB" /></div>
            <div className="space-y-1"><label className="text-xs font-medium">{T("prodWo.filterStatus")}</label><select name="status" defaultValue={sp.status ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">{T("prodWo.filterAll")}</option>{WORK_ORDER_STATUS.map((s) => <option key={s} value={s}>{T(`prodWo.woStatus.${s}`)}</option>)}</select></div>
            <div className="space-y-1"><label className="text-xs font-medium">{T("prodWo.filterLine")}</label><select name="line" defaultValue={sp.line ?? ""} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">{T("prodWo.filterAll")}</option>{PRODUCTION_LINES.map((l) => <option key={l} value={l}>{l}</option>)}</select></div>
            <div className="flex items-end"><button className="h-9 w-full rounded-md bg-primary px-3 text-sm text-primary-foreground">{T("prodWo.filterSubmit")}</button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        {orders.length === 0 ? <EmptyState title={T("prodWo.emptyTitle")} hint={canManage ? T("prodWo.emptyHint") : undefined} /> : (
          <Table>
            <THead><TR><TH>{T("prodWo.thNumber")}</TH><TH>{T("prodWo.thCustomer")}</TH><TH>{T("prodWo.thLine")}</TH><TH>{T("prodWo.thCoil")}</TH><TH className="text-center">{T("prodWo.thTarget")}</TH><TH>{T("prodWo.thProgress")}</TH><TH>{T("prodWo.thDelivery")}</TH><TH>{T("prodWo.thStatus")}</TH><TH className="text-right">{T("prodWo.thAction")}</TH></TR></THead>
            <TBody>{orders.map((o) => {
              const pct = woProgressPct(o);
              return (
                <TR key={o.id}>
                  <TD><Link href={`/production/work-orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link></TD>
                  <TD>{o.customerName ?? "—"}</TD>
                  <TD className="text-xs">{o.line ? <Badge tone="neutral">{o.line}</Badge> : "—"}</TD>
                  <TD className="text-xs">{o.coilType?.replace(/_/g, " ") ?? "—"}</TD>
                  <TD className="text-center tabular-nums">{o.targetCoils}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      <span className="text-xs tabular-nums text-muted-foreground">{o.completedCoils}/{o.targetCoils}</span>
                    </div>
                  </TD>
                  <TD className="text-sm text-muted-foreground">{o.endDate ? formatDate(o.endDate) : "—"}</TD>
                  <TD><Badge tone={statusTone(o.status)}>{WO_STATUS_LABEL[o.status] ? T(`prodWo.woStatus.${o.status}`) : o.status}</Badge></TD>
                  <TD className="text-right"><WorkOrderRowActions id={o.id} status={o.status} canManage={canManage} /></TD>
                </TR>
              );
            })}</TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
