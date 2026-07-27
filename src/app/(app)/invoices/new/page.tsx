import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { NewInvoiceForm } from "./new-form";
import { add, sub, gt } from "@/lib/money";

export const metadata: Metadata = { title: "Yeni Fatura" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const user = await requirePermission(PERMISSIONS.INVOICE_CREATE);
  const sp = await searchParams;

  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: user.tenantId, status: { in: ["CONFIRMED", "PARTIALLY_RECEIVED", "RECEIVED", "SHIPPED", "PARTIALLY_SHIPPED", "INVOICED"] } },
    include: { supplier: true, lines: { orderBy: { lineNo: "asc" } } },
    orderBy: { orderDate: "desc" },
  });

  const data = orders
    .map((o) => ({
      id: o.id,
      number: o.number,
      supplierId: o.supplierId,
      supplier: o.supplier.legalName,
      currency: o.currency,
      lines: o.lines.map((l) => {
        const openToInvoice = sub(l.receivedQty, l.invoicedQty).toString();
        return {
          id: l.id,
          description: l.description,
          uom: l.uom,
          orderedQty: l.quantity ?? "0",
          unitPrice: l.unitPrice ?? "0",
          taxRate: l.taxRate ?? "20",
          receivedQty: l.receivedQty,
          invoicedQty: l.invoicedQty,
          openToInvoice,
        };
      }),
    }))
    .filter((o) => o.lines.some((l) => gt(l.receivedQty, "0")));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Yeni Fatura" description="SipariÅŸ ve mal kabul Ã¼zerinden fatura girin; Ã¼Ã§lÃ¼ eÅŸleÅŸtirme otomatik Ã§alÄ±ÅŸÄ±r." />
      <NewInvoiceForm orders={data} preselectOrderId={sp.orderId ?? ""} />
    </div>
  );
}
