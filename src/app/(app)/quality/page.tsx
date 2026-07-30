import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Kalite" };

export default async function QualityPage() {
  const user = await requirePermission(PERMISSIONS.QUALITY_VIEW);
  const T = translator(user.locale as Locale);
  const inspections = await prisma.qualityInspection.findMany({
    where: { receipt: { order: { tenantId: user.tenantId } } },
    orderBy: { createdAt: "desc" },
    include: { receipt: { include: { order: { include: { supplier: true } } } }, _count: { select: { nonConformances: true } } },
    take: 100,
  });
  return (
    <div>
      <PageHeader title={T("quality.title")} description={T("quality.list.desc")} />
      <Card>
        {inspections.length === 0 ? (
          <EmptyState title={T("quality.list.empty")} hint={T("quality.list.emptyHint")} />
        ) : (
          <Table>
            <THead><TR><TH>{T("quality.order")}</TH><TH>{T("common.supplier")}</TH><TH className="text-center">{T("quality.ncrCount")}</TH><TH>{T("quality.result")}</TH><TH>{T("common.date")}</TH></TR></THead>
            <TBody>
              {inspections.map((q) => (
                <TR key={q.id}>
                  <TD><Link href={`/quality/${q.id}`} className="font-medium text-primary hover:underline">{q.receipt.order.number}</Link></TD>
                  <TD className="text-sm">{q.receipt.order.supplier.legalName}</TD>
                  <TD className="text-center">{q._count.nonConformances}</TD>
                  <TD><StatusBadge status={q.status} /></TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(q.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
