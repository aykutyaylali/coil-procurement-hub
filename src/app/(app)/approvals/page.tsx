import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { pendingApprovalsForUser } from "@/domain/approval";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = { title: "Onaylarım" };

const DOC_ROUTES: Record<string, { path: string; label: string }> = {
  REQUISITION: { path: "requisitions", label: "Talep" },
  PURCHASE_ORDER: { path: "orders", label: "Sipariş" },
  RFQ: { path: "rfqs", label: "RFQ" },
};

export default async function ApprovalsPage() {
  const user = await requireUser();
  const pending = await pendingApprovalsForUser(prisma, user.id, user.roleKeys);

  // Belge özetlerini çöz
  const rows = await Promise.all(
    pending.map(async (p) => {
      let number = p.documentId;
      let amount: string | null = null;
      let currency = "TRY";
      if (p.documentType === "REQUISITION") {
        const r = await prisma.purchaseRequisition.findUnique({ where: { id: p.documentId }, select: { number: true, estimatedTotal: true, currency: true } });
        if (r) { number = r.number; amount = r.estimatedTotal; currency = r.currency; }
      } else if (p.documentType === "PURCHASE_ORDER") {
        const o = await prisma.purchaseOrder.findUnique({ where: { id: p.documentId }, select: { number: true, grandTotal: true, currency: true } });
        if (o) { number = o.number; amount = o.grandTotal; currency = o.currency; }
      }
      return { ...p, number, amount, currency };
    }),
  );

  return (
    <div>
      <PageHeader title="Onaylarım" description="Onayınızı bekleyen belgeler." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="Bekleyen onay yok" hint="Onay gerektiren yeni belgeler burada görünür." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Belge</TH>
                <TH>No</TH>
                <TH>Adım</TH>
                <TH className="text-right">Tutar</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const route = DOC_ROUTES[r.documentType];
                return (
                  <TR key={r.instanceId}>
                    <TD>{route?.label ?? r.documentType}</TD>
                    <TD className="font-medium">{r.number}</TD>
                    <TD className="text-sm text-muted-foreground">{r.stepName}</TD>
                    <TD className="text-right">{r.amount ? formatMoney(r.amount, r.currency) : "-"}</TD>
                    <TD className="text-right">
                      {route && (
                        <Link href={`/${route.path}/${r.documentId}`} className="text-sm text-primary hover:underline">
                          İncele & Karar Ver →
                        </Link>
                      )}
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
