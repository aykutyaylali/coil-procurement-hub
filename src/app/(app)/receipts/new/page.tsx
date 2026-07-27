import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { NewReceiptForm } from "./new-form";
import { add, sub } from "@/lib/money";

export const metadata: Metadata = { title: "Yeni Mal Kabul" };

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const user = await requirePermission(PERMISSIONS.RECEIPT_CREATE);
  const sp = await searchParams;

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: user.tenantId,
      status: { in: ["SENT", "ACKNOWLEDGED", "PARTIALLY_CONFIRMED", "CONFIRMED", "PARTIALLY_SHIPPED", "SHIPPED", "PARTIALLY_RECEIVED"] },
    },
    include: { supplier: true, lines: { orderBy: { lineNo: "asc" } } },
    orderBy: { orderDate: "desc" },
  });

  const warehouses = await prisma.warehouse.findMany({
    where: { company: { tenantId: user.tenantId }, isActive: true },
    orderBy: { name: "asc" },
  });

  // AÃ§Ä±k miktarÄ± olan sipariÅŸleri hazÄ±rla
  const data = orders
    .map((o) => ({
      id: o.id,
      number: o.number,
      supplier: o.supplier.legalName,
      currency: o.currency,
      lines: o.lines
        .map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          description: l.description,
          uom: l.uom,
          quantity: l.quantity ?? "0",
          openQty: sub(l.quantity, add(l.receivedQty, l.rejectedQty)).toString(),
        }))
        .filter((l) => Number(l.openQty) > 0),
    }))
    .filter((o) => o.lines.length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Yeni Mal Kabul" description="SipariÅŸ Ã¼zerinden tam veya kÄ±smi mal kabul yapÄ±n." />
      <NewReceiptForm
        orders={data}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        preselectOrderId={sp.orderId ?? ""}
      />
    </div>
  );
}
