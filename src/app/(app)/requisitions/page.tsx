import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination, parsePage, pageArgs } from "@/components/ui/pagination";
import { formatMoneyOrDash } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { statusLabel } from "@/lib/enums";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Talepler" };

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.REQUISITION_VIEW);
  const T = translator(user.locale as Locale);
  const canCreate = userCan(user, PERMISSIONS.REQUISITION_CREATE);
  const canSetPolicy = userCan(user, PERMISSIONS.REQUISITION_ASSIGN);
  const sp = await searchParams;
  const page = parsePage(sp.page);

  const where = {
    tenantId: user.tenantId,
    deletedAt: null,
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.q
      ? { OR: [{ number: { contains: sp.q } }, { justification: { contains: sp.q } }] }
      : {}),
  };

  // Sadece gerekli sütunlar (include:true yerine select — hassas alan sızıntısı yok) + sayfalama
  const [requisitions, total] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page),
      select: {
        id: true, number: true, priority: true, status: true, estimatedTotal: true, currency: true, createdAt: true,
        company: { select: { name: true } },
        department: { select: { name: true } },
        requester: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  const statuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ASSIGNED", "IN_RFQ", "ORDERED", "REJECTED"];

  return (
    <div>
      <PageHeader
        title={T("reqPage.title")}
        description={T("reqPage.subtitle")}
        action={canCreate ? { label: T("reqPage.new"), href: "/requisitions/new" } : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/requisitions"
          className={`rounded-full border px-3 py-1 text-xs ${!sp.status ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        >
          {T("reqPage.all")}
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/requisitions?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs ${sp.status === s ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {statusLabel(s, user.locale)}
          </Link>
        ))}
        {canSetPolicy && (
          <Link href="/requisitions/approval-policy" className="ml-auto rounded-full border px-3 py-1 text-xs hover:bg-accent" prefetch>
            ⚙ {T("reqPage.policy")}
          </Link>
        )}
      </div>

      <Card>
        {requisitions.length === 0 ? (
          <EmptyState title={T("reqPage.empty")} hint={T("reqPage.emptyHint")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("reqPage.colNumber")}</TH>
                <TH>{T("reqPage.colCompanyDept")}</TH>
                <TH>{T("reqPage.colRequester")}</TH>
                <TH>{T("reqPage.colLines")}</TH>
                <TH>{T("reqPage.colPriority")}</TH>
                <TH className="text-right">{T("reqPage.colEstTotal")}</TH>
                <TH>{T("reqPage.colStatus")}</TH>
                <TH>{T("reqPage.colDate")}</TH>
              </TR>
            </THead>
            <TBody>
              {requisitions.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/requisitions/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.number}
                    </Link>
                  </TD>
                  <TD className="text-sm">
                    {r.company.name}
                    {r.department ? <span className="text-muted-foreground"> · {r.department.name}</span> : null}
                  </TD>
                  <TD className="text-sm">{r.requester.name}</TD>
                  <TD className="text-sm">{r._count.lines}</TD>
                  <TD>{statusLabel(r.priority, user.locale)}</TD>
                  <TD className="text-right font-medium">{formatMoneyOrDash(r.estimatedTotal, r.currency)}</TD>
                  <TD>
                    <StatusBadge status={r.status} locale={user.locale} />
                  </TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(r.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} total={total} basePath="/requisitions" query={{ status: sp.status, q: sp.q }} />
    </div>
  );
}
