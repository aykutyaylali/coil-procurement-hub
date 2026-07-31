import type { Metadata } from "next";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";
import { lmeUsdPerKg } from "@/domain/lme-pricing";
import { LmeForm, LmeRowActions } from "./lme-client";

export const metadata: Metadata = { title: "LME Bakır" };

const TONE: Record<string, "warning" | "success" | "default"> = {
  DRAFT: "warning", APPROVED: "success", ARCHIVED: "default",
};

export default async function LmePage() {
  const user = await requirePermission(PERMISSIONS.LME_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.LME_MANAGE);

  const records = await prisma.lmeRecord.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ priceDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const creatorIds = Array.from(new Set(records.map((r) => r.createdById)));
  const users = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } });
  const nameById = Object.fromEntries(users.map((u) => [u.id, u.name] as const));

  const statusLabel = (s: string) => T(`lme.status.${s}` as never) || s;

  return (
    <div>
      <PageHeader title={T("lme.title")} description={T("lme.subtitle")} />
      {canManage && <LmeForm />}
      <Card>
        {records.length === 0 ? (
          <EmptyState title={T("lme.empty")} hint={canManage ? T("lme.emptyHint") : undefined} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("lme.date")}</TH>
                <TH>{T("lme.kind")}</TH>
                <TH className="text-right">{T("lme.usdPerTon")}</TH>
                <TH className="text-right">{T("lme.usdPerKg")}</TH>
                <TH>{T("lme.source")}</TH>
                <TH>{T("lme.createdBy")}</TH>
                <TH>{T("lme.colStatus")}</TH>
                {canManage && <TH className="text-right">{T("lme.colActions")}</TH>}
              </TR>
            </THead>
            <TBody>
              {records.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{formatDate(r.priceDate)}</TD>
                  <TD>
                    <Badge tone={r.kind === "WEEKLY_AVG" ? "info" : "default"}>{T(`lme.kind.${r.kind}` as never) || r.kind}</Badge>
                    {r.kind === "WEEKLY_AVG" && r.periodStart && r.periodEnd && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</div>
                    )}
                  </TD>
                  <TD className="text-right font-mono">{Number(r.usdPerTon).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}</TD>
                  <TD className="text-right font-mono">{lmeUsdPerKg(r.usdPerTon)}</TD>
                  <TD className="text-sm text-muted-foreground">
                    <span className={`mr-1 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${r.isAutoFetched ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-border text-muted-foreground"}`}>{r.isAutoFetched ? T("lme.autoBadge") : T("lme.manualBadge")}</span>
                    {r.source ?? "—"}
                  </TD>
                  <TD className="text-sm">{nameById[r.createdById] ?? "—"}</TD>
                  <TD><Badge tone={TONE[r.status] ?? "default"}>{statusLabel(r.status)}</Badge></TD>
                  {canManage && <TD className="text-right"><LmeRowActions id={r.id} status={r.status} /></TD>}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
