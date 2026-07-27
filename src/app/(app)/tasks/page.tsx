import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Görevlerim" };

export default async function TasksPage() {
  const user = await requireUser();
  const tasks = await prisma.task.findMany({
    where: { assigneeId: user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div>
      <PageHeader title="Görevlerim" description="Size atanmış açık görevler." />
      <Card>
        {tasks.length === 0 ? (
          <EmptyState title="Açık görev yok" hint="Size görev atandığında burada listelenir." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Görev</TH>
                <TH>Öncelik</TH>
                <TH>Durum</TH>
                <TH>Son Tarih</TH>
              </TR>
            </THead>
            <TBody>
              {tasks.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">{t.title}</TD>
                  <TD><StatusBadge status={t.priority} /></TD>
                  <TD><StatusBadge status={t.status} /></TD>
                  <TD className="text-sm text-muted-foreground">{t.dueAt ? formatDate(t.dueAt) : "-"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
