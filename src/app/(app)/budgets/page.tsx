import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { add, sub, formatMoney, d } from "@/lib/money";

export const metadata: Metadata = { title: "Bütçeler" };

export default async function BudgetsPage() {
  const user = await requirePermission(PERMISSIONS.BUDGET_VIEW);
  const canManage = userCan(user, PERMISSIONS.BUDGET_MANAGE);
  const budgets = await prisma.budget.findMany({
    where: { tenantId: user.tenantId },
    orderBy: [{ fiscalYear: "desc" }],
    include: { company: true, costCenter: true, project: true, transactions: true },
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Bütçeler" description="Planlanan, taahhüt, faturalanan ve kalan bütçe takibi." action={canManage ? { label: "Yeni Bütçe", href: "/budgets/new" } : undefined} />
      <Card>
        {budgets.length === 0 ? (
          <EmptyState title="Bütçe tanımı yok" hint="Şirket/maliyet merkezi/proje bazında bütçe tanımlayın." />
        ) : (
          <Table>
            <THead><TR><TH>Yıl</TH><TH>Şirket</TH><TH>Merkez/Proje</TH><TH className="text-right">Planlanan</TH><TH className="text-right">Harcanan</TH><TH className="text-right">Kalan</TH></TR></THead>
            <TBody>
              {budgets.map((b) => {
                const spent = add(...b.transactions.filter((t) => ["COMMIT", "INVOICE"].includes(t.type)).map((t) => t.amount));
                const remaining = sub(b.plannedAmount, spent);
                return (
                  <TR key={b.id}>
                    <TD><Link href={`/budgets/${b.id}`} className="font-medium text-primary hover:underline">{b.fiscalYear}</Link></TD>
                    <TD className="text-sm">{b.company.name}</TD>
                    <TD className="text-sm">{b.costCenter?.name ?? b.project?.name ?? "-"}</TD>
                    <TD className="text-right">{formatMoney(b.plannedAmount, b.currency)}</TD>
                    <TD className="text-right">{formatMoney(spent, b.currency)}</TD>
                    <TD className={`text-right font-medium ${d(remaining).isNegative() ? "text-destructive" : "text-success"}`}>
                      {formatMoney(remaining, b.currency)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
