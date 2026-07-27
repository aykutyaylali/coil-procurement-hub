import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Teklif Talepleri" };

export default async function RfqsPage() {
  const user = await requirePermission(PERMISSIONS.RFQ_VIEW);
  const rfqs = await prisma.rFQ.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      company: true,
      _count: { select: { suppliers: true, bids: true, lines: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Teklif Talepleri (RFQ)"
        description="Onaylı taleplerden teklif talebi oluşturun, tedarikçilere gönderin ve teklifleri karşılaştırın."
      />
      <Card>
        {rfqs.length === 0 ? (
          <EmptyState
            title="Henüz RFQ yok"
            hint="Onaylanmış bir talebin detay sayfasından 'Teklif Talebi Oluştur' ile başlayın."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>RFQ No</TH>
                <TH>Başlık</TH>
                <TH>Şirket</TH>
                <TH className="text-center">Kalem</TH>
                <TH className="text-center">Tedarikçi</TH>
                <TH className="text-center">Teklif</TH>
                <TH>Son Tarih</TH>
                <TH>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {rfqs.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/rfqs/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.number}
                    </Link>
                  </TD>
                  <TD className="max-w-xs truncate">{r.title}</TD>
                  <TD className="text-sm">{r.company.name}</TD>
                  <TD className="text-center">{r._count.lines}</TD>
                  <TD className="text-center">{r._count.suppliers}</TD>
                  <TD className="text-center">{r._count.bids}</TD>
                  <TD className="text-sm text-muted-foreground">{r.dueAt ? formatDateTime(r.dueAt) : "-"}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
