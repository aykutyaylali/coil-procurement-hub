import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { NewInvoiceForm } from "./new-form";
import { add, sub, gt } from "@/lib/money";
import { getLatestRates } from "@/lib/exchange/service";
import { translator, type Locale } from "@/lib/i18n";

export const metadata: Metadata = { title: "Yeni Fatura" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const user = await requirePermission(PERMISSIONS.INVOICE_CREATE);
  const T = translator(user.locale as Locale);
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

  const [lmeRows, rates] = await Promise.all([
    prisma.lmeRecord.findMany({ where: { tenantId: user.tenantId, status: "APPROVED" }, orderBy: { priceDate: "desc" }, take: 60, select: { id: true, priceDate: true, kind: true, usdPerTon: true } }),
    getLatestRates(user.tenantId),
  ]);
  const lmeRecords = lmeRows.map((r) => ({ id: r.id, priceDate: r.priceDate.toISOString(), kind: r.kind, usdPerTon: r.usdPerTon }));
  const defaultUsdTry = rates.find((r) => r.quote === "USD")?.rate ?? "";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={T("inv.new.title")} description={T("inv.new.description")} />
      <NewInvoiceForm orders={data} preselectOrderId={sp.orderId ?? ""} lmeRecords={lmeRecords} defaultUsdTry={defaultUsdTry} />
    </div>
  );
}
