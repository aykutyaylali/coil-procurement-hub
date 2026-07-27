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

export const metadata: Metadata = { title: "GeÃ§miÅŸ Veri Ä°Ã§e Aktarma" };

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
        title="GeÃ§miÅŸ SatÄ±nalma Verisi Ä°Ã§e Aktarma"
        description="Excel (.xlsx) dosyasÄ±ndan geÃ§miÅŸ sipariÅŸleri gÃ¼venli, idempotent ve geri alÄ±nabilir ÅŸekilde iÃ§e aktarÄ±n."
      />
      <div className="mb-4">
        <Link href="/integrations" className="text-sm text-primary hover:underline">â† Entegrasyon Merkezi</Link>
      </div>

      <ImportWizard />

      <Card className="mt-8">
        <CardHeader><CardTitle>Ä°Ã§e Aktarma GeÃ§miÅŸi (Batch)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {batches.length === 0 ? (
            <EmptyState title="HenÃ¼z iÃ§e aktarma yok" />
          ) : (
            <Table>
              <THead><TR><TH>Dosya</TH><TH>Durum</TH><TH className="text-center">SipariÅŸ</TH><TH className="text-center">Kalem</TH><TH className="text-center">Yeni Ted.</TH><TH>Tarih</TH><TH></TH></TR></THead>
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
