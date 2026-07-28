import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Teklif Talepleri" };

const EVAL_STATUSES = ["SENT", "OPEN", "EVALUATION", "CLARIFICATION", "NEGOTIATION"];

export default async function RfqsPage({ searchParams }: { searchParams: Promise<{ filter?: string; status?: string }> }) {
  const user = await requirePermission(PERMISSIONS.RFQ_VIEW);
  const sp = await searchParams;

  const where = {
    tenantId: user.tenantId,
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.filter === "responded" ? { suppliers: { some: { status: "RESPONDED" } }, status: { in: EVAL_STATUSES } } : {}),
  };

  const rfqs = await prisma.rFQ.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      company: { select: { name: true } },
      suppliers: { select: { status: true } },
      _count: { select: { lines: true } },
    },
  });

  // Değerlendirilecek (yanıt gelmiş) RFQ sayısı — üstte vurgulanır
  const respondedCount = await prisma.rFQ.count({
    where: { tenantId: user.tenantId, status: { in: EVAL_STATUSES }, suppliers: { some: { status: "RESPONDED" } } },
  });

  const chips = [
    { key: "", label: "Tümü", href: "/rfqs" },
    { key: "responded", label: `Teklif Geldi${respondedCount ? ` (${respondedCount})` : ""}`, href: "/rfqs?filter=responded", highlight: true },
    { key: "SENT", label: "Gönderildi", href: "/rfqs?status=SENT" },
    { key: "OPEN", label: "Teklifler toplanıyor", href: "/rfqs?status=OPEN" },
    { key: "EVALUATION", label: "Değerlendirme", href: "/rfqs?status=EVALUATION" },
    { key: "AWARDED", label: "Karara Bağlandı", href: "/rfqs?status=AWARDED" },
  ];
  const active = sp.filter === "responded" ? "responded" : (sp.status ?? "");

  return (
    <div>
      <PageHeader
        title="Teklif Talepleri (RFQ)"
        description="Onaylı taleplerden teklif talebi oluşturun, tedarikçilere gönderin ve gelen teklifleri karşılaştırın."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            className={`rounded-full border px-3 py-1 text-xs ${
              active === c.key
                ? "bg-primary text-primary-foreground"
                : c.highlight && respondedCount
                  ? "border-emerald-500/50 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "hover:bg-accent"
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>

      <Card>
        {rfqs.length === 0 ? (
          <EmptyState
            title={sp.filter === "responded" ? "Değerlendirilecek teklif yok" : "RFQ yok"}
            hint="Onaylanmış bir talebin detay sayfasından kalem seçip 'RFQ oluştur' ile başlayın."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>RFQ No</TH>
                <TH>Başlık</TH>
                <TH className="text-center">Kalem</TH>
                <TH className="text-center">Yanıtlayan</TH>
                <TH>Son Tarih</TH>
                <TH>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {rfqs.map((r) => {
                const invited = r.suppliers.length;
                const responded = r.suppliers.filter((s) => s.status === "RESPONDED").length;
                const needsAttention = responded > 0 && EVAL_STATUSES.includes(r.status);
                return (
                  <TR key={r.id} className={needsAttention ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}>
                    <TD>
                      <Link href={`/rfqs/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.number}
                      </Link>
                    </TD>
                    <TD className="max-w-xs truncate">
                      {r.title}
                      <div className="text-xs text-muted-foreground">{r.company.name}</div>
                    </TD>
                    <TD className="text-center">{r._count.lines}</TD>
                    <TD className="text-center">
                      {responded > 0 ? (
                        <Badge tone="success">{responded}/{invited} yanıtladı</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">0/{invited}</span>
                      )}
                    </TD>
                    <TD className="text-sm text-muted-foreground">{r.dueAt ? formatDateTime(r.dueAt) : "-"}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
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
