import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sözleşmeler" };

export default async function ContractsPage() {
  const user = await requirePermission(PERMISSIONS.CONTRACT_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.CONTRACT_MANAGE);
  const contracts = await prisma.contract.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: { supplier: true },
    take: 100,
  });
  return (
    <div>
      <PageHeader title={T("con.title")} description={T("con.list.desc")} action={canManage ? { label: T("con.new"), href: "/contracts/new" } : undefined} />
      <Card>
        {contracts.length === 0 ? (
          <EmptyState title={T("con.empty.title")} hint={T("con.empty.hint")} />
        ) : (
          <Table>
            <THead><TR><TH>{T("con.th.code")}</TH><TH>{T("con.th.title")}</TH><TH>{T("con.th.supplier")}</TH><TH className="text-right">{T("con.th.limit")}</TH><TH className="text-right">{T("con.th.used")}</TH><TH>{T("con.th.end")}</TH><TH>{T("con.th.status")}</TH></TR></THead>
            <TBody>
              {contracts.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/contracts/${c.id}`} className="font-medium text-primary hover:underline">{c.code}</Link></TD>
                  <TD>{c.title}</TD>
                  <TD className="text-sm">{c.supplier.legalName}</TD>
                  <TD className="text-right">{c.totalLimit ? formatMoney(c.totalLimit, c.currency) : "-"}</TD>
                  <TD className="text-right">{formatMoney(c.usedAmount, c.currency)}</TD>
                  <TD className="text-sm">{c.endDate ? formatDate(c.endDate) : "-"}</TD>
                  <TD><StatusBadge status={c.status} locale={user.locale} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
