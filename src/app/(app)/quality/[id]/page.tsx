import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/dates";
import { label } from "@/domain/labels";
import { InspectionPanel } from "./panel";

export default async function QualityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.QUALITY_VIEW);

  const inspection = await prisma.qualityInspection.findFirst({
    where: { id, receipt: { order: { tenantId: user.tenantId } } },
    include: {
      receipt: { include: { order: { include: { supplier: true } } } },
      nonConformances: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!inspection) notFound();

  const users = await prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Kalite Kontrol</h1>
            <StatusBadge status={inspection.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sipariş:{" "}
            <Link href={`/orders/${inspection.receipt.orderId}`} className="text-primary hover:underline">{inspection.receipt.order.number}</Link>
            {" "}· {inspection.receipt.order.supplier.legalName} · Mal Kabul:{" "}
            <Link href={`/receipts/${inspection.receiptId}`} className="text-primary hover:underline">{inspection.receipt.number}</Link>
          </p>
        </div>
        <Link href="/quality" className="text-sm text-primary hover:underline">← Listeye dön</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <InspectionPanel
            inspectionId={inspection.id}
            status={inspection.status}
            supplierId={inspection.receipt.order.supplierId}
            users={users}
          />

          <Card>
            <CardHeader><CardTitle>Uygunsuzluklar (NCR)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {inspection.nonConformances.length === 0 && <p className="text-sm text-muted-foreground">Uygunsuzluk kaydı yok.</p>}
              {inspection.nonConformances.map((n) => (
                <Link key={n.id} href={`/quality/ncr/${n.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent">
                  <div>
                    <div className="font-medium">{n.code} · {n.title}</div>
                    <div className="text-xs text-muted-foreground">{label(n.type)} · Hedef: {n.dueDate ? formatDate(n.dueDate) : "-"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={n.severity === "CRITICAL" ? "danger" : n.severity === "MAJOR" ? "warning" : "default"}>{label(n.severity)}</Badge>
                    <StatusBadge status={n.status} />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Numune Adedı" value={inspection.sampleSize ?? "-"} />
              <Row label="Kontrol Eden" value={inspection.inspectedBy ? (users.find((u) => u.id === inspection.inspectedBy)?.name ?? "-") : "-"} />
              <Row label="Kontrol Tarihi" value={inspection.inspectedAt ? formatDateTime(inspection.inspectedAt) : "-"} />
              {inspection.sampleResult && <Row label="Sonuç" value={inspection.sampleResult} />}
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
