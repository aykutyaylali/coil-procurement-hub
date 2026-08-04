import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Pagination, parsePage, pageArgs } from "@/components/ui/pagination";
import { opLabel } from "@/domain/operations";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Tedarikçiler" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requirePermission(PERMISSIONS.SUPPLIER_VIEW);
  const T = translator(user.locale as Locale);
  const canCreate = userCan(user, PERMISSIONS.SUPPLIER_CREATE);
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const where = { tenantId: user.tenantId, deletedAt: null };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { legalName: "asc" },
      ...pageArgs(page),
      select: {
        id: true, code: true, legalName: true, supplierType: true, country: true, operationTypes: true, status: true,
        _count: { select: { purchaseOrders: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ]);

  return (
    <div>
      <PageHeader
        title={T("supp.title")}
        description={T("supp.list.description")}
        action={canCreate ? { label: T("supp.new"), href: "/suppliers/new" } : undefined}
      />
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title={T("supp.list.empty.title")} hint={canCreate ? T("supp.list.empty.hint.canCreate") : T("supp.list.empty.hint.default")} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{T("supp.col.code")}</TH>
                <TH>{T("supp.col.legalName")}</TH>
                <TH>{T("supp.col.type")}</TH>
                <TH>{T("supp.col.country")}</TH>
                <TH>{T("supp.col.operation")}</TH>
                <TH className="text-center">{T("supp.col.orders")}</TH>
                <TH>{T("supp.col.status")}</TH>
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
                        {s.supplierType === "FOREIGN" ? T("supp.type.foreign") : T("supp.type.domestic")}
                      </Badge>
                    </TD>
                    <TD className="text-sm">{s.country}</TD>
                    <TD className="text-xs text-muted-foreground">{ops.map((o) => opLabel(o, user.locale as Locale)).join(", ") || "-"}</TD>
                    <TD className="text-center">{s._count.purchaseOrders}</TD>
                    <TD>
                      <StatusBadge status={s.status} locale={user.locale} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Pagination page={page} total={total} basePath="/suppliers" />
    </div>
  );
}
