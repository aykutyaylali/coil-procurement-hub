import type { Metadata } from "next";
import Link from "next/link";
import * as Icons from "lucide-react";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { pendingApprovalsForUser } from "@/domain/approval";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney, add } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Kontrol Paneli" };

function Stat({
  label,
  value,
  icon,
  href,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: string;
  href: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const I = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[icon];
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "text-primary";
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex size-11 items-center justify-center rounded-lg bg-muted ${toneClass}`}>
            {I ? <I className="size-5" /> : null}
          </div>
          <div>
            <div className="text-2xl font-semibold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const tenantId = user.tenantId;

  const [
    pendingReqs,
    openRfqs,
    awaitingSuppliers,
    openOrders,
    lateOrders,
    openInvoices,
    blockedInvoices,
    pendingApprovals,
    recentReqs,
    poAgg,
  ] = await Promise.all([
    prisma.purchaseRequisition.count({ where: { tenantId, status: "PENDING_APPROVAL" } }),
    prisma.rFQ.count({ where: { tenantId, status: { in: ["SENT", "OPEN", "EVALUATION"] } } }),
    prisma.rFQSupplier.count({ where: { rfq: { tenantId }, status: { in: ["INVITED", "VIEWED"] } } }),
    prisma.purchaseOrder.count({
      where: { tenantId, status: { in: ["SENT", "ACKNOWLEDGED", "CONFIRMED", "PARTIALLY_RECEIVED"] } },
    }),
    prisma.purchaseOrderLine.count({
      where: {
        order: { tenantId, status: { notIn: ["CLOSED", "CANCELLED", "RECEIVED"] } },
        neededBy: { lt: new Date() },
      },
    }),
    prisma.invoice.count({ where: { tenantId, status: { in: ["MATCHING", "MATCHED", "APPROVED"] } } }),
    prisma.invoice.count({ where: { tenantId, status: "BLOCKED" } }),
    pendingApprovalsForUser(prisma, user.id, user.roleKeys),
    prisma.purchaseRequisition.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { requester: true, company: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { tenantId, status: { notIn: ["CANCELLED"] } },
      select: { grandTotal: true, currency: true },
    }),
  ]);

  // Basit toplam harcama (TRY bazlı gösterim; çoklu döviz raporlar sayfasında ayrıştırılır)
  const totalSpend = add(...poAgg.filter((p) => p.currency === "TRY").map((p) => p.grandTotal));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Merhaba, {user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Satınalma süreçlerinizin özeti · {formatDate(new Date())}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Bekleyen Onaylarım" value={pendingApprovals.length} icon="Stamp" href="/approvals" tone="warning" />
        <Stat label="Onay Bekleyen Talep" value={pendingReqs} icon="FileText" href="/requisitions?status=PENDING_APPROVAL" />
        <Stat label="Açık Teklif Talebi" value={openRfqs} icon="Send" href="/rfqs" />
        <Stat label="Yanıt Bekleyen Tedarikçi" value={awaitingSuppliers} icon="Clock" href="/rfqs" tone="warning" />
        <Stat label="Açık Sipariş" value={openOrders} icon="ShoppingCart" href="/orders" />
        <Stat label="Geciken Sipariş Satırı" value={lateOrders} icon="AlertTriangle" href="/orders" tone="danger" />
        <Stat label="Açık Fatura" value={openInvoices} icon="Receipt" href="/invoices" />
        <Stat label="Bloke Fatura" value={blockedInvoices} icon="ShieldAlert" href="/invoices?status=BLOCKED" tone="danger" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Son Talepler</CardTitle>
            <Link href="/requisitions" className="text-sm text-primary hover:underline">
              Tümü
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentReqs.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Henüz talep yok.</p>
            )}
            {recentReqs.map((r) => (
              <Link
                key={r.id}
                href={`/requisitions/${r.id}`}
                className="flex items-center justify-between rounded-md border px-3 py-2.5 hover:bg-accent"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.number}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.company.name} · {r.requester.name}
                  </div>
                </div>
                <div className="text-right text-sm font-medium">
                  {formatMoney(r.estimatedTotal, r.currency)}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toplam Sipariş Harcaması (TRY)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatMoney(totalSpend, "TRY")}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              İptal edilmemiş TRY siparişleri. Çoklu döviz kırılımı için Raporlar bölümüne bakınız.
            </p>
            <div className="mt-4 space-y-2">
              <Link href="/reports" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Icons.BarChart3 className="size-4" /> Harcama analizini görüntüle
              </Link>
              <Link href="/suppliers" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Icons.Building2 className="size-4" /> Tedarikçileri yönet
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
