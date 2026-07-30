import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/dates";
import { statusLabel } from "@/lib/enums";
import { RequisitionActionsPanel } from "./actions-panel";
import { RequisitionLinesPanel } from "./lines-panel";

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const req = await prisma.purchaseRequisition.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      requester: true,
      company: true,
      department: true,
      project: true,
      costCenter: true,
      lines: { orderBy: { lineNo: "asc" }, include: { category: true } },
    },
  });
  if (!req) notFound();

  const [instance, timeline] = await Promise.all([
    prisma.approvalInstance.findFirst({
      where: { documentType: "REQUISITION", documentId: req.id },
      include: { actions: { include: { user: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, entityType: "PurchaseRequisition", entityId: req.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Onay adımında bu kullanıcı yetkili mi?
  let canDecide = false;
  let currentStepName = "";
  if (instance && instance.status === "PENDING") {
    const steps = JSON.parse(instance.stepsState) as {
      approverUserId: string | null;
      approverRoleKey: string | null;
      name: string;
    }[];
    const current = steps[instance.currentStep];
    if (current) {
      currentStepName = current.name;
      canDecide =
        current.approverUserId === user.id ||
        (current.approverRoleKey != null && user.roleKeys.includes(current.approverRoleKey));
    }
  }

  const canSubmit = req.requesterId === user.id || user.isSystemAdmin;
  const canCreateRfq = userCan(user, PERMISSIONS.RFQ_CREATE);
  const canAssign = userCan(user, PERMISSIONS.REQUISITION_ASSIGN);
  const editableStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ASSIGNED", "REJECTED"];
  const canEditReq =
    (req.requesterId === user.id || user.isSystemAdmin || userCan(user, PERMISSIONS.REQUISITION_EDIT)) &&
    editableStatuses.includes(req.status);
  const canDeleteReq = userCan(user, PERMISSIONS.REQUISITION_EDIT);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{req.number}</h1>
            <StatusBadge status={req.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {req.company.name}
            {req.department ? ` · ${req.department.name}` : ""} · Talep eden: {req.requester.name}
          </p>
        </div>
        <Link href="/requisitions" className="text-sm text-primary hover:underline">
          ← Listeye dön
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <RequisitionLinesPanel
            requisitionId={req.id}
            canCreateRfq={canCreateRfq}
            canEditLines={canEditReq}
            reqStatus={req.status}
            lines={req.lines.map((l) => ({
              id: l.id,
              lineNo: l.lineNo,
              description: l.description,
              categoryName: l.category?.name ?? null,
              quantity: l.quantity,
              uom: l.uom,
              status: l.status,
            }))}
          />

          {req.justification && (
            <Card>
              <CardHeader>
                <CardTitle>Gerekçe</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">{req.justification}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Onay Adımları</CardTitle>
            </CardHeader>
            <CardContent>
              {!instance && <p className="text-sm text-muted-foreground">Henüz onay sürecine girmedi.</p>}
              {instance && (
                <div className="space-y-2">
                  <p className="text-sm">
                    Süreç durumu: <StatusBadge status={instance.status} />
                    {currentStepName && instance.status === "PENDING" ? (
                      <span className="ml-2 text-muted-foreground">Bekleyen adım: {currentStepName}</span>
                    ) : null}
                  </p>
                  {instance.actions.map((a) => (
                    <div key={a.id} className="rounded border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-medium">{a.user.name}</span> — {statusLabel(a.action)}
                      {a.note ? <span className="text-muted-foreground"> · {a.note}</span> : null}
                      <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>İşlemler</CardTitle>
            </CardHeader>
            <CardContent>
              <RequisitionActionsPanel
                id={req.id}
                status={req.status}
                canSubmit={canSubmit}
                canDecide={canDecide}
                canCreateRfq={canCreateRfq}
                canAssign={canAssign}
                canEdit={canEditReq}
                canDelete={canDeleteReq}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Özet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Öncelik" value={statusLabel(req.priority)} />
              <Row label="Tür" value={req.purchaseType} />
              <Row label="Para Birimi" value={req.currency} />
              <Row label="Proje" value={req.project?.name ?? "-"} />
              <Row label="Maliyet Merkezi" value={req.costCenter?.name ?? "-"} />
              <Row label="İstenen Teslim" value={req.neededBy ? formatDate(req.neededBy) : "-"} />
              <Row label="Oluşturulma" value={formatDateTime(req.createdAt)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zaman Çizelgesi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {timeline.map((a) => (
                <div key={a.id} className="flex gap-2">
                  <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                  <span>
                    {a.user?.name ?? "Sistem"} · {statusLabel(a.action)}
                  </span>
                </div>
              ))}
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
