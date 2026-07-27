import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Ürün Kataloğu" };

export default async function CatalogPage() {
  const user = await requirePermission(PERMISSIONS.CATALOG_VIEW);
  const items = await prisma.item.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
    take: 200,
    include: { category: true, baseUom: true },
  });

  return (
    <div>
      <PageHeader title="Ürün ve Hizmet Kataloğu" description="Merkezi ürün/hizmet kartları, kategoriler ve fiyat geçmişi." />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="Katalog boş" hint="Seed verisi yükleyin veya ürün ekleyin." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kod</TH>
                <TH>Ad</TH>
                <TH>Kategori</TH>
                <TH>Marka</TH>
                <TH>Birim</TH>
                <TH className="text-right">Son Alış</TH>
                <TH>Tür</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD className="font-mono text-xs">{i.code}</TD>
                  <TD className="font-medium">{i.name}</TD>
                  <TD className="text-sm">{i.category?.name ?? "-"}</TD>
                  <TD className="text-sm">{i.brand ?? "-"}</TD>
                  <TD className="text-sm">{i.baseUom?.code ?? "-"}</TD>
                  <TD className="text-right text-sm">
                    {i.lastPurchasePrice ? formatMoney(i.lastPurchasePrice, i.lastPurchaseCurrency ?? "TRY") : "-"}
                  </TD>
                  <TD><Badge tone={i.isService ? "info" : "default"}>{i.isService ? "Hizmet" : "Malzeme"}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
