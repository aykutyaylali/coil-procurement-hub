import type { Metadata } from "next";
import Link from "next/link";
import * as Icons from "lucide-react";
import { requireUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { getMyPendingApprovals } from "@/lib/pending";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney, formatMoneyOrDash, add } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { translator, type Locale } from "@/lib/i18n";

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
  const T = translator(user.locale as Locale);

  const [
    pendingReqs,
    openRfqs,
    awaitingSuppliers,
    rfqsToEvaluate,
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
    // Teklif gelmiş, değerlendirilmeyi bekleyen RFQ'lar
    prisma.rFQ.count({ where: { tenantId, status: { in: ["SENT", "OPEN", "EVALUATION", "CLARIFICATION", "NEGOTIATION"] }, suppliers: { some: { status: "RESPONDED" } } } }),
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
    getMyPendingApprovals(),
    prisma.purchaseRequisition.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true, number: true, status: true, estimatedTotal: true, currency: true, createdAt: true,
        requester: { select: { name: true } },
        company: { select: { name: true } },
      },
    }),
    // Yalnızca TRY siparişlerin tutarını çek (tüm siparişleri çekip JS'de filtrelemek yerine)
    prisma.purchaseOrder.findMany({
      where: { tenantId, currency: "TRY", status: { notIn: ["CANCELLED"] } },
      select: { grandTotal: true },
    }),
  ]);

  // Toplam harcama (TRY bazlı gösterim; çoklu döviz raporlar sayfasında ayrıştırılır)
  const totalSpend = add(...poAgg.map((p) => p.grandTotal));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{T("dashboard.greeting", { name: user.name.split(" ")[0] ?? user.name })} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {T("dashboard.subtitle")} · {formatDate(new Date())}
        </p>
      </div>

      {(() => {
        const tonePriority: Record<string, number> = { danger: 0, warning: 1, success: 2, default: 3 };
        const allStats = [
          { label: T("dashboard.kpi.pendingApprovals"), value: pendingApprovals.length, icon: "Stamp", href: "/approvals", tone: "warning" },
          { label: T("dashboard.kpi.pendingReqs"), value: pendingReqs, icon: "FileText", href: "/requisitions?status=PENDING_APPROVAL", tone: "default" },
          { label: T("dashboard.kpi.openRfqs"), value: openRfqs, icon: "Send", href: "/rfqs", tone: "default" },
          { label: T("dashboard.kpi.rfqsToEvaluate"), value: rfqsToEvaluate, icon: "ClipboardCheck", href: "/rfqs?filter=responded", tone: "success" },
          { label: T("dashboard.kpi.awaitingSuppliers"), value: awaitingSuppliers, icon: "Clock", href: "/rfqs", tone: "warning" },
          { label: T("dashboard.kpi.openOrders"), value: openOrders, icon: "ShoppingCart", href: "/orders", tone: "default" },
          { label: T("dashboard.kpi.lateOrders"), value: lateOrders, icon: "AlertTriangle", href: "/orders", tone: "danger" },
          { label: T("dashboard.kpi.openInvoices"), value: openInvoices, icon: "Receipt", href: "/invoices", tone: "default" },
          { label: T("dashboard.kpi.blockedInvoices"), value: blockedInvoices, icon: "ShieldAlert", href: "/invoices?status=BLOCKED", tone: "danger" },
        ] as const;
        // Yalnızca aksiyon gerektiren (değeri > 0) kartlar; kritik olanlar (danger/warning) önce
        const active = allStats
          .filter((s) => s.value > 0)
          .sort((a, b) => (tonePriority[a.tone] ?? 3) - (tonePriority[b.tone] ?? 3));
        if (active.length === 0) {
          return (
            <div className="rounded-lg border bg-white p-6 text-center dark:bg-slate-900">
              <p className="text-sm text-muted-foreground">{T("dashboard.allClear")}</p>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:grid-cols-4">
            {active.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} icon={s.icon} href={s.href} tone={s.tone} />
            ))}
          </div>
        );
      })()}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{T("dashboard.recentReqs")}</CardTitle>
            <Link href="/requisitions" className="text-sm text-primary hover:underline">
              {T("action.viewAll")}
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentReqs.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{T("dashboard.noReqs")}</p>
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
                  {formatMoneyOrDash(r.estimatedTotal, r.currency)}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{T("dashboard.totalSpend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatMoney(totalSpend, "TRY")}</div>
            <p className="mt-2 text-xs text-muted-foreground">
              {T("dashboard.totalSpendNote")}
            </p>
            <div className="mt-4 space-y-2">
              <Link href="/reports" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Icons.BarChart3 className="size-4" /> {T("dashboard.viewSpendAnalysis")}
              </Link>
              <Link href="/suppliers" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Icons.Building2 className="size-4" /> {T("dashboard.manageSuppliers")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
