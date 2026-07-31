import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { translator, type Locale, type TranslationKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Satınalma İşlem Merkezi" };

/** İş kuyrukları — her biri bir talep (satınalma dosyası) filtresi. */
function queueWhere(key: string, tenantId: string): Prisma.PurchaseRequisitionWhereInput {
  const base = { tenantId, deletedAt: null };
  const respondedRel = { lines: { some: { rfqLines: { some: { rfq: { suppliers: { some: { status: "RESPONDED" } } } } } } } };
  switch (key) {
    case "islem-bekleyen":
      return { ...base, status: "APPROVED", assignedBuyerId: null };
    case "rfq-hazirlanacak":
      return { ...base, status: { in: ["APPROVED", "ASSIGNED"] }, lines: { some: { status: "OPEN" } } };
    case "yanit-bekleyen":
      return { ...base, status: "IN_RFQ", NOT: respondedRel };
    case "teklif-gelenler":
      return { ...base, status: { in: ["IN_RFQ", "ASSIGNED", "APPROVED"] }, ...respondedRel };
    case "siparis":
      return { ...base, status: "ORDERED" };
    case "tamamlanan":
      return { ...base, status: { in: ["CLOSED"] } };
    default:
      return base;
  }
}

const QUEUES = [
  { key: "islem-bekleyen", label: "İşlem Bekleyen" },
  { key: "rfq-hazirlanacak", label: "RFQ Hazırlanacak" },
  { key: "yanit-bekleyen", label: "Tedarikçi Yanıtı Bekleyen" },
  { key: "teklif-gelenler", label: "Teklif Gelenler", highlight: true },
  { key: "siparis", label: "Sipariş" },
  { key: "tamamlanan", label: "Tamamlananlar" },
];

export default async function IslemMerkeziPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission(PERMISSIONS.REQUISITION_VIEW);
  const T = translator(user.locale as Locale);
  const sp = await searchParams;

  const counts = await Promise.all(
    QUEUES.map((q) => prisma.purchaseRequisition.count({ where: queueWhere(q.key, user.tenantId) })),
  );
  const countByKey = Object.fromEntries(QUEUES.map((q, i) => [q.key, counts[i]!]));

  // Varsayılan kuyruk: teklif gelenler varsa oraya, yoksa işlem bekleyen, yoksa ilk dolu
  const active =
    sp.q && QUEUES.some((q) => q.key === sp.q)
      ? sp.q
      : countByKey["teklif-gelenler"]
        ? "teklif-gelenler"
        : countByKey["islem-bekleyen"]
          ? "islem-bekleyen"
          : "rfq-hazirlanacak";

  const cases = await prisma.purchaseRequisition.findMany({
    where: queueWhere(active, user.tenantId),
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, number: true, status: true, createdAt: true, priority: true,
      requester: { select: { name: true } },
      company: { select: { name: true } },
      _count: { select: { lines: true } },
    },
  });

  return (
    <div>
      <PageHeader title={T("hub.title")} description={T("hub.subtitle")} />

      <div className="mb-4 flex flex-wrap gap-2">
        {QUEUES.map((q) => {
          const n = countByKey[q.key] ?? 0;
          const isActive = active === q.key;
          return (
            <Link
              key={q.key}
              href={`/islem-merkezi?q=${q.key}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : q.highlight && n
                    ? "border-emerald-500/50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "hover:bg-accent"
              }`}
            >
              {T(`hub.queue.${q.key}` as TranslationKey)}
              {n > 0 && <span className={`rounded-full px-1.5 text-[10px] ${isActive ? "bg-primary-foreground/20" : "bg-muted"}`}>{n}</span>}
            </Link>
          );
        })}
      </div>

      <Card>
        {cases.length === 0 ? (
          <EmptyState title={T("hub.empty")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("req.number")}</TH>
                <TH>{T("hub.col.requester")}</TH>
                <TH>{T("common.company")}</TH>
                <TH className="text-center">{T("hub.col.lines")}</TH>
                <TH>{T("common.priority")}</TH>
                <TH>{T("common.status")}</TH>
                <TH>{T("common.date")}</TH>
              </TR>
            </THead>
            <TBody>
              {cases.map((c) => (
                <TR key={c.id} className={active === "teklif-gelenler" ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
                  <TD>
                    <Link href={`/islem-merkezi/${c.id}`} className="font-medium text-primary hover:underline">{c.number}</Link>
                  </TD>
                  <TD className="text-sm">{c.requester.name}</TD>
                  <TD className="text-sm text-muted-foreground">{c.company.name}</TD>
                  <TD className="text-center">{c._count.lines}</TD>
                  <TD>{c.priority === "URGENT" || c.priority === "HIGH" ? <Badge tone="warning">{T(`priority.${c.priority}` as TranslationKey)}</Badge> : <span className="text-xs text-muted-foreground">{T(`priority.${c.priority}` as TranslationKey)}</span>}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
