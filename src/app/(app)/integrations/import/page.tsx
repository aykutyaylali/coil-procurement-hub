import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { ImportWizard } from "./wizard";
import { BatchActions } from "./batch-actions";

export const metadata: Metadata = { title: "Geçmiş Veri İçe Aktarma" };

export default async function ImportPage() {
  const user = await requirePermission(PERMISSIONS.ADMIN_INTEGRATIONS);
  const batches = await prisma.importBatch.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <div>
      <PageHeader
        title="Geçmiş Satınalma Verisi İçe Aktarma"
        description="Excel (.xlsx) dosyasından geçmiş siparişleri güvenli, idempotent ve geri alınabilir şekilde içe aktarın."
      />
      <div className="mb-4">
        <Link href="/integrations" className="text-sm text-primary hover:underline">â† Entegrasyon Merkezi</Link>
      </div>

      <ImportWizard />

      <Card className="mt-8">
        <CardHeader><CardTitle>İçe Aktarma Geçmişi (Batch)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <EmptyState title="Henüz içe aktarma yok" />
          ) : (
            <Table>
              <THead><TR><TH>Dosya</TH><TH>Durum</TH><TH className="text-center">Sipariş</TH><TH className="text-center">Kalem</TH><TH className="text-center">Yeni Ted.</TH><TH>Tarih</TH><TH></TH></TR></THead>
              <TBody>
                {batches.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.fileName}</TD>
                    <TD><StatusBadge status={b.status === "COMMITTED" ? "APPROVED" : b.status === "ROLLED_BACK" ? "CANCELLED" : "DRAFT"} /></TD>
                    <TD className="text-center">{b.ordersCreated}</TD>
                    <TD className="text-center">{b.linesCreated}</TD>
                    <TD className="text-center">{b.suppliersCreated}</TD>
                    <TD className="text-sm text-muted-foreground">{formatDateTime(b.committedAt ?? b.createdAt)}</TD>
                    <TD className="text-right">
                      {b.status === "COMMITTED" && <BatchActions batchId={b.id} />}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
