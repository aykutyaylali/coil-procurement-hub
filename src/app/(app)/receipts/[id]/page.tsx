import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { label, dispositionFromSchema } from "@/domain/labels";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.RECEIPT_VIEW);

  const receipt = await prisma.goodsReceipt.findFirst({
    where: { id, order: { tenantId: user.tenantId } },
    include: {
      order: { include: { supplier: true } },
      warehouse: true,
      lines: { include: { orderLine: true } },
      inspections: true,
    },
  });
  if (!receipt) notFound();

  const receivedBy = await prisma.user.findUnique({ where: { id: receipt.receivedById }, select: { name: true } });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{receipt.number}</h1>
            <StatusBadge status={receipt.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            SipariÅŸ:{" "}
            <Link href={`/orders/${receipt.orderId}`} className="text-primary hover:underline">{receipt.order.number}</Link>
            {" "}Â· {receipt.order.supplier.legalName} Â· {receipt.warehouse?.name ?? "-"}
          </p>
        </div>
        <Link href="/receipts" className="text-sm text-primary hover:underline">â† Listeye dÃ¶n</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Kabul Kalemleri</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR><TH>Kalem</TH><TH className="text-right">Kabul</TH><TH className="text-right">Ret</TH><TH>Durum</TH><TH>Lot/Seri</TH><TH>Raf</TH></TR>
                </THead>
                <TBody>
                  {receipt.lines.map((l) => (
                    <TR key={l.id}>
                      <TD className="font-medium">{l.orderLine.description}</TD>
                      <TD className="text-right">{l.acceptedQty}</TD>
                      <TD className="text-right">{l.rejectedQty}</TD>
                      <TD><Badge tone={l.disposition === "ACCEPTED" ? "success" : l.disposition === "QUARANTINE" ? "warning" : "danger"}>{label(dispositionFromSchema(l.disposition))}</Badge></TD>
                      <TD className="text-sm">{l.lotNumber ?? "-"}{l.serialNumber ? ` / ${l.serialNumber}` : ""}</TD>
                      <TD className="text-sm">{l.binLocation ?? "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {receipt.inspections.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Kalite Kontrol</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {receipt.inspections.map((q) => (
                  <div key={q.id} className="flex items-center justify-between">
                    <span className="text-sm">Kalite kontrolÃ¼</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={q.status} />
                      <Link href={`/quality/${q.id}`} className="text-sm text-primary hover:underline">Ä°ncele â†’</Link>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ã–zet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Ä°rsaliye No" value={receipt.waybillNo ?? "-"} />
              <Row label="Teslim Alan" value={receivedBy?.name ?? "-"} />
              <Row label="Tarih" value={formatDateTime(receipt.receivedAt)} />
              {receipt.note && <Row label="AÃ§Ä±klama" value={receipt.note} />}
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
