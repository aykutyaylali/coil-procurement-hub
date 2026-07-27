import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { add, formatMoney, gt } from "@/lib/money";
import { opLabel } from "@/domain/operations";

export const metadata: Metadata = { title: "Raporlar" };

export default async function ReportsPage() {
  const user = await requirePermission(PERMISSIONS.REPORT_VIEW);
  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: user.tenantId, status: { notIn: ["CANCELLED"] } },
    include: { supplier: true },
  });

  // Operasyon türü bazlı harcama (TRY)
  const byOp: Record<string, ReturnType<typeof add>> = {};
  const bySupplier: Record<string, { name: string; total: ReturnType<typeof add> }> = {};
  for (const o of orders) {
    if (o.currency !== "TRY") continue;
    byOp[o.operationType] = add(byOp[o.operationType] ?? add(0), o.grandTotal);
    const cur = bySupplier[o.supplierId] ?? { name: o.supplier.legalName, total: add(0) };
    cur.total = add(cur.total, o.grandTotal);
    bySupplier[o.supplierId] = cur;
  }
  const topSuppliers = Object.values(bySupplier)
    .sort((a, b) => (gt(a.total, b.total) ? -1 : 1))
    .slice(0, 10);

  return (
    <div>
      <PageHeader title="Raporlar" description="Harcama analizi, tedarikçi dağılımı ve operasyon türü kırılımı (TRY siparişleri)." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Operasyon Türüne Göre Harcama</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>Operasyon</TH><TH className="text-right">Tutar</TH></TR></THead>
              <TBody>
                {["DOMESTIC_PURCHASE", "IMPORT_PURCHASE", "EXPORT_RELATED_PURCHASE"].map((op) => (
                  <TR key={op}>
                    <TD>{opLabel(op)}</TD>
                    <TD className="text-right font-medium">{formatMoney(byOp[op] ?? add(0), "TRY")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Tedarikçi Bazlı Harcama (İlk 10)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead><TR><TH>Tedarikçi</TH><TH className="text-right">Tutar</TH></TR></THead>
              <TBody>
                {topSuppliers.length === 0 && (
                  <TR><TD colSpan={2} className="py-6 text-center text-sm text-muted-foreground">Veri yok</TD></TR>
                )}
                {topSuppliers.map((s) => (
                  <TR key={s.name}>
                    <TD>{s.name}</TD>
                    <TD className="text-right font-medium">{formatMoney(s.total, "TRY")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Not: Bu özet TRY siparişlerini kapsar. Çoklu döviz kırılımı ve OTIF, tasarruf, çevrim süresi gibi
        gelişmiş raporlar veri biriktikçe genişletilebilir.
      </p>
    </div>
  );
}
