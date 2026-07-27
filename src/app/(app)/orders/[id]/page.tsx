import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { OrderActionsPanel } from "./actions-panel";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      supplier: true,
      company: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!po) notFound();

  const instance = await prisma.approvalInstance.findFirst({
    where: { documentType: "PURCHASE_ORDER", documentId: po.id, status: "PENDING" },
  });
  let canDecide = false;
  if (instance) {
    const steps = JSON.parse(instance.stepsState) as { approverUserId: string | null; approverRoleKey: string | null }[];
    const current = steps[instance.currentStep];
    if (current) {
      canDecide =
        current.approverUserId === user.id ||
        (current.approverRoleKey != null && user.roleKeys.includes(current.approverRoleKey));
    }
  }
  const canSend = userCan(user, PERMISSIONS.ORDER_SEND);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{po.number}</h1>
            <StatusBadge status={po.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {po.supplier.legalName} · {po.company.name} · {formatDate(po.orderDate)}
          </p>
        </div>
        <Link href="/orders" className="text-sm text-primary hover:underline">
          ← Listeye dön
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sipariş Kalemleri</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Açıklama</TH>
                    <TH className="text-right">Miktar</TH>
                    <TH className="text-right">Birim Fiyat</TH>
                    <TH className="text-right">KDV%</TH>
                    <TH className="text-right">Satır Toplam</TH>
                  </TR>
                </THead>
                <TBody>
                  {po.lines.map((l) => (
                    <TR key={l.id}>
                      <TD>{l.lineNo}</TD>
                      <TD className="font-medium">{l.description}</TD>
                      <TD className="text-right">
                        {l.quantity} {l.uom ?? ""}
                      </TD>
                      <TD className="text-right">{formatMoney(l.unitPrice, po.currency)}</TD>
                      <TD className="text-right">{l.taxRate}</TD>
                      <TD className="text-right font-medium">{formatMoney(l.lineTotal, po.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="space-y-1 border-t p-4 text-sm">
                <div className="flex justify-end gap-8">
                  <span className="text-muted-foreground">Ara Toplam</span>
                  <span className="w-32 text-right">{formatMoney(po.subtotal, po.currency)}</span>
                </div>
                <div className="flex justify-end gap-8">
                  <span className="text-muted-foreground">KDV</span>
                  <span className="w-32 text-right">{formatMoney(po.taxTotal, po.currency)}</span>
                </div>
                <div className="flex justify-end gap-8 font-semibold">
                  <span>Genel Toplam</span>
                  <span className="w-32 text-right">{formatMoney(po.grandTotal, po.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>İşlemler</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderActionsPanel id={po.id} status={po.status} canDecide={canDecide} canSend={canSend} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Özet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tedarikçi" value={po.supplier.legalName} />
              <Row label="Para Birimi" value={po.currency} />
              <Row label="Ödeme Koşulu" value={po.paymentTerms ?? "-"} />
              <Row label="Incoterm" value={po.incoterm ?? "-"} />
              <Row label="Oluşturulma" value={formatDateTime(po.createdAt)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
