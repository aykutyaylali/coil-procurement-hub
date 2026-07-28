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
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { statusLabel } from "@/lib/enums";

export const metadata: Metadata = { title: "Talepler" };

export default async function RequisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.REQUISITION_VIEW);
  const canCreate = userCan(user, PERMISSIONS.REQUISITION_CREATE);
  const canSetPolicy = userCan(user, PERMISSIONS.REQUISITION_ASSIGN);
  const sp = await searchParams;
  const page = parsePage(sp.page);

  const where = {
    tenantId: user.tenantId,
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
        title="Satınalma Talepleri"
        description="Departman ihtiyaçları için talep oluşturun ve takip edin."
        action={canCreate ? { label: "Yeni Talep", href: "/requisitions/new" } : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/requisitions"
          className={`rounded-full border px-3 py-1 text-xs ${!sp.status ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        >
          Tümü
        </Link>
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/requisitions?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs ${sp.status === s ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {statusLabel(s)}
          </Link>
        ))}
        {canSetPolicy && (
          <Link href="/requisitions/approval-policy" className="ml-auto rounded-full border px-3 py-1 text-xs hover:bg-accent" prefetch>
            ⚙ Onay Politikası
          </Link>
        )}
      </div>

      <Card>
        {requisitions.length === 0 ? (
          <EmptyState title="Talep bulunamadı" hint="Yeni Talep butonuyla ilk talebinizi oluşturun." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Talep No</TH>
                <TH>Şirket / Departman</TH>
                <TH>Talep Eden</TH>
                <TH>Kalem</TH>
                <TH>Öncelik</TH>
                <TH className="text-right">Tahmini Tutar</TH>
                <TH>Durum</TH>
                <TH>Tarih</TH>
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
                  <TD>{statusLabel(r.priority)}</TD>
                  <TD className="text-right font-medium">{formatMoney(r.estimatedTotal, r.currency)}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
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
