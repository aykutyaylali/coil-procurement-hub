import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { translator, type Locale } from "@/lib/i18n";
import { ImportCsv } from "./import-csv";

export const metadata: Metadata = { title: "Ürün Kataloğu" };

export default async function CatalogPage() {
  const user = await requirePermission(PERMISSIONS.CATALOG_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.CATALOG_MANAGE);
  const items = await prisma.item.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { name: "asc" },
    take: 200,
    include: { category: true, baseUom: true },
  });

  return (
    <div>
      <PageHeader title={T("cat.list.title")} description={T("cat.list.description")} action={canManage ? { label: T("cat.list.newItem"), href: "/catalog/new" } : undefined} />
      {canManage && <div className="mb-4"><ImportCsv /></div>}
      <Card>
        {items.length === 0 ? (
          <EmptyState title={T("cat.list.emptyTitle")} hint={T("cat.list.emptyHint")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("cat.list.colCode")}</TH>
                <TH>{T("cat.list.colName")}</TH>
                <TH>{T("cat.list.colCategory")}</TH>
                <TH>{T("cat.list.colBrand")}</TH>
                <TH>{T("cat.list.colUom")}</TH>
                <TH className="text-right">{T("cat.list.colLastPurchase")}</TH>
                <TH>{T("cat.list.colType")}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((i) => (
                <TR key={i.id}>
                  <TD><Link href={`/catalog/${i.id}`} className="font-mono text-xs text-primary hover:underline">{i.code}</Link></TD>
                  <TD className="font-medium">{i.name}</TD>
                  <TD className="text-sm">{i.category?.name ?? "-"}</TD>
                  <TD className="text-sm">{i.brand ?? "-"}</TD>
                  <TD className="text-sm">{i.baseUom?.code ?? "-"}</TD>
                  <TD className="text-right text-sm">
                    {i.lastPurchasePrice ? formatMoney(i.lastPurchasePrice, i.lastPurchaseCurrency ?? "TRY") : "-"}
                  </TD>
                  <TD><Badge tone={i.isService ? "info" : "default"}>{i.isService ? T("cat.type.service") : T("cat.type.material")}</Badge></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
