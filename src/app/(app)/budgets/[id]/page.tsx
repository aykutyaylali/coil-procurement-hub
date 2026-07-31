import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { computeBudgetStatus } from "@/domain/budget";
import { ManualTxForm } from "./tx-form";

const TX_LABEL: Record<string, string> = { RESERVE: "Rezerv", RELEASE: "Rezerv İptal", COMMIT: "Taahhüt", INVOICE: "Faturalanan", PAYMENT: "Ödenen" };

export default async function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.BUDGET_VIEW);
  const canManage = userCan(user, PERMISSIONS.BUDGET_MANAGE);

  const b = await prisma.budget.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { company: true, costCenter: true, project: true, transactions: { orderBy: { createdAt: "desc" } } },
  });
  if (!b) notFound();
  const status = computeBudgetStatus(b.plannedAmount, b.transactions);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{b.fiscalYear} Bütçesi</h1>
          <p className="mt-1 text-sm text-muted-foreground">{b.company.name}{b.costCenter ? ` · ${b.costCenter.name}` : ""}{b.project ? ` · ${b.project.name}` : ""} · {b.currency}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && <Link href={`/budgets/${b.id}/edit`} className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">Düzenle</Link>}
          <Link href="/budgets" className="text-sm text-primary hover:underline">← Listeye dön</Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Planlanan" value={formatMoney(status.planned, b.currency)} />
        <Stat label="Rezerv" value={formatMoney(status.reserved, b.currency)} />
        <Stat label="Taahhüt" value={formatMoney(status.committed, b.currency)} />
        <Stat label="Faturalanan" value={formatMoney(status.invoiced, b.currency)} />
        <Stat label="Ödenen" value={formatMoney(status.paid, b.currency)} />
        <Stat label={status.isOver ? "Aşım" : "Kalan"} value={formatMoney(status.isOver ? status.overage : status.remaining, b.currency)} tone={status.isOver ? "danger" : "success"} />
      </div>

      <Card>
        <CardHeader><CardTitle>Bütçe Hareketleri</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {canManage && <ManualTxForm budgetId={b.id} />}
          <Table>
            <THead><TR><TH>Tür</TH><TH className="text-right">Tutar</TH><TH>Referans</TH><TH>Not</TH><TH>Tarih</TH></TR></THead>
            <TBody>
              {b.transactions.length === 0 && <TR><TD colSpan={5} className="py-4 text-center text-sm text-muted-foreground">Hareket yok</TD></TR>}
              {b.transactions.map((t) => (
                <TR key={t.id}>
                  <TD>{TX_LABEL[t.type] ?? t.type}</TD>
                  <TD className="text-right">{formatMoney(t.amount, b.currency)}</TD>
                  <TD className="text-xs text-muted-foreground">{t.refType ? `${t.refType}` : "-"}</TD>
                  <TD className="text-sm">{t.note ?? "-"}</TD>
                  <TD className="text-sm text-muted-foreground">{formatDateTime(t.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <Card><CardContent className="p-4">
      <div className={`text-lg font-semibold ${tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </CardContent></Card>
  );
}
