import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { opLabel } from "@/domain/operations";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default async function SuppliersPage() {
  const user = await requirePermission(PERMISSIONS.SUPPLIER_VIEW);
  const suppliers = await prisma.supplier.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: { legalName: "asc" },
    take: 200,
    include: { _count: { select: { purchaseOrders: true, contacts: true } } },
  });

  return (
    <div>
      <PageHeader title="Tedarikçiler" description="Yerli ve yabancı tedarikçi kartları, onboarding ve performans." />
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="Tedarikçi yok" hint="Seed verisi yükleyin veya yeni tedarikçi ekleyin." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kod</TH>
                <TH>Ünvan</TH>
                <TH>Tür</TH>
                <TH>Ülke</TH>
                <TH>Operasyon</TH>
                <TH className="text-center">Sipariş</TH>
                <TH>Durum</TH>
              </TR>
            </THead>
            <TBody>
              {suppliers.map((s) => {
                let ops: string[] = [];
                try { ops = JSON.parse(s.operationTypes); } catch { /* */ }
                return (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">{s.code}</TD>
                    <TD>
                      <Link href={`/suppliers/${s.id}`} className="font-medium text-primary hover:underline">
                        {s.legalName}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={s.supplierType === "FOREIGN" ? "info" : "default"}>
                        {s.supplierType === "FOREIGN" ? "Yabancı" : "Yerli"}
                      </Badge>
                    </TD>
                    <TD className="text-sm">{s.country}</TD>
                    <TD className="text-xs text-muted-foreground">{ops.map((o) => opLabel(o, "tr")).join(", ") || "-"}</TD>
                    <TD className="text-center">{s._count.purchaseOrders}</TD>
                    <TD>
                      <StatusBadge status={s.status} />
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
