import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { label } from "@/domain/labels";
import { NcrPanel } from "./panel";

export default async function NcrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.QUALITY_VIEW);

  const ncr = await prisma.nonConformance.findFirst({
    where: { id, inspection: { receipt: { order: { tenantId: user.tenantId } } } },
    include: {
      inspection: { include: { receipt: { include: { order: { include: { supplier: true } } } } } },
      supplier: true,
      capas: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!ncr) notFound();

  const users = await prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{ncr.code}</h1>
            <Badge tone={ncr.severity === "CRITICAL" ? "danger" : ncr.severity === "MAJOR" ? "warning" : "default"}>{label(ncr.severity)}</Badge>
            <StatusBadge status={ncr.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {ncr.title} · {ncr.supplier?.legalName ?? "-"} · Kalite:{" "}
            <Link href={`/quality/${ncr.inspectionId}`} className="text-primary hover:underline">Kontrol kaydı</Link>
          </p>
        </div>
        <Link href="/quality" className="text-sm text-primary hover:underline">← Listeye dön</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NcrPanel
            ncr={{ id: ncr.id, status: ncr.status, rootCause: ncr.rootCause, correctiveAction: ncr.correctiveAction, preventiveAction: ncr.preventiveAction, disposition: ncr.disposition }}
            capas={ncr.capas.map((c) => ({ id: c.id, code: c.code, title: c.title, type: c.type, status: c.status, dueDate: c.dueDate?.toISOString() ?? null }))}
            users={users}
          />
        </div>
        <div>
          <Card>
            <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tür" value={label(ncr.type)} />
              <Row label="Sipariş" value={ncr.inspection.receipt.order.number} />
              <Row label="Hedef Tarih" value={ncr.dueDate ? formatDate(ncr.dueDate) : "-"} />
              <Row label="Maliyet" value={ncr.cost ? formatMoney(ncr.cost, "TRY") : "-"} />
              {ncr.description && <Row label="Açıklama" value={ncr.description} />}
              {ncr.verifiedAt && <Row label="Doğrulandı" value={formatDate(ncr.verifiedAt)} />}
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
