import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan, assertPoAccess } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney, formatQty } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { translator, type Locale, type TranslationKey } from "@/lib/i18n";
import { loadPOTimeline, loadProductionHistory } from "@/domain/po-workspace";
import { loadDiscussion } from "@/domain/discussion";
import { loadTechnicalReviews } from "@/domain/technical-review";
import { PRODUCTION_STAGES, allowedProductionTargets } from "@/domain/state-machines";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { DiscussionFeed } from "@/app/(app)/orders/[id]/discussion";
import { ProductionPanel } from "@/app/(app)/orders/[id]/production";
import { TechnicalReviewPanel } from "@/app/(app)/orders/[id]/technical-review";

const TABS = [
  { key: "genel", labelKey: "po.workspace.tab.genel" },
  { key: "uretim", labelKey: "po.workspace.tab.uretim" },
  { key: "teknik-incelemeler", labelKey: "po.workspace.tab.teknik" },
  { key: "belgeler", labelKey: "po.workspace.tab.belgeler" },
  { key: "discussion", labelKey: "po.workspace.tab.discussion" },
  { key: "zaman", labelKey: "po.workspace.tab.zaman" },
] as const;

const KNOWN_ACTIONS = ["CREATE", "UPDATE", "STATUS_CHANGE", "APPROVE", "PRODUCTION_UPDATE", "TECH_REVIEW_CREATED", "TECH_REVIEW_DECISION"];

export default async function PortalOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  const T = translator(user.locale as Locale);

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { supplier: true, company: true, lines: { orderBy: { lineNo: "asc" } } },
  });
  if (!po) notFound();
  assertPoAccess(po, user); // tedarikçi yalnız kendi PO'suna erişir

  const activeTab = TABS.some((t) => t.key === tab) ? tab! : "genel";
  const canComment = userCan(user, PERMISSIONS.PO_WORKSPACE_COMMENT);
  const canProductionUpdate = userCan(user, PERMISSIONS.PO_PRODUCTION_UPDATE);
  const canTechCreate = userCan(user, PERMISSIONS.TECH_REVIEW_CREATE);
  const stageLabels = Object.fromEntries(PRODUCTION_STAGES.map((s) => [s, T(`po.production.stage.${s}` as TranslationKey)]));

  const timeline = activeTab === "zaman" ? await loadPOTimeline(po.id, user.tenantId, { forSupplier: true }) : [];
  const productionHistory = activeTab === "uretim" ? await loadProductionHistory(po.id, user.tenantId, { forSupplier: true }) : [];
  const discussion = activeTab === "discussion" ? await loadDiscussion("PurchaseOrder", po.id, user.tenantId, { forSupplier: true }) : [];
  const techReviews = activeTab === "teknik-incelemeler" ? await loadTechnicalReviews(po.id, user.tenantId, { forSupplier: true }) : [];
  const trDiscussions: Record<string, Awaited<ReturnType<typeof loadDiscussion>>> = {};
  if (activeTab === "teknik-incelemeler") {
    for (const r of techReviews) trDiscussions[r.id] = await loadDiscussion("TechnicalReview", r.id, user.tenantId, { forSupplier: true });
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{po.number}</h1>
            <StatusBadge status={po.status} />
            {po.productionStage && <Badge tone="info">{stageLabels[po.productionStage]}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{po.company.name} · {formatDate(po.orderDate)}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={`/orders/${po.id}/pdf`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">PDF</a>
          <Link href="/portal/orders" className="text-sm text-primary hover:underline">{T("portal.backToOrders")}</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/portal/orders/${po.id}?tab=${t.key}`}
            className={`rounded-t-md px-3 py-2 text-sm ${activeTab === t.key ? "border-b-2 border-primary font-medium text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {T(t.labelKey as TranslationKey)}
          </Link>
        ))}
      </div>

      {activeTab === "genel" && (
        <Card>
          <CardHeader><CardTitle>{T("po.workspace.orderLines")}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>{T("common.description")}</TH>
                  <TH className="text-right">{T("common.quantity")}</TH>
                  <TH className="text-right">{T("common.unitPrice")}</TH>
                  <TH className="text-right">{T("po.workspace.lineTotal")}</TH>
                </TR>
              </THead>
              <TBody>
                {po.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>{l.lineNo}</TD>
                    <TD className="font-medium">{l.description}</TD>
                    <TD className="text-right">{formatQty(l.quantity)} {l.uom ?? ""}</TD>
                    <TD className="text-right">{formatMoney(l.unitPrice, po.currency)}</TD>
                    <TD className="text-right font-medium">{formatMoney(l.lineTotal, po.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex justify-end gap-8 border-t p-4 text-sm font-semibold">
              <span>{T("common.grandTotal")}</span>
              <span className="w-32 text-right">{formatMoney(po.grandTotal, po.currency)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "uretim" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{T("po.production.title")}</CardTitle></CardHeader>
            <CardContent>
              <ProductionPanel orderId={po.id} currentStage={po.productionStage} allowedNext={allowedProductionTargets(po.productionStage)} canUpdate={canProductionUpdate} stageLabels={stageLabels} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">{T("po.production.history")}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {productionHistory.length === 0 && <p className="text-muted-foreground">{T("po.production.historyEmpty")}</p>}
              {productionHistory.map((h) => (
                <div key={h.id} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                  <div className="w-36 shrink-0 text-xs text-muted-foreground">{formatDateTime(new Date(h.createdAt))}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{stageLabels[h.stage] ?? h.stage}</Badge>
                      <span className="text-xs text-muted-foreground">{h.updaterName}</span>
                      {h.estDate && <span className="text-xs text-muted-foreground">· {T("po.production.est")}: {formatDate(new Date(h.estDate))}</span>}
                    </div>
                    {h.note && <div className="mt-0.5 text-xs">{h.note}</div>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "teknik-incelemeler" && (
        <TechnicalReviewPanel orderId={po.id} reviews={techReviews} discussionsByReview={trDiscussions} canCreate={canTechCreate} canDecide={false} canComment={canComment} canInternal={false} currentUserId={user.id} />
      )}

      {activeTab === "belgeler" && (
        <Card>
          <CardHeader><CardTitle>{T("po.workspace.tab.belgeler")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AttachmentUploader entityType="PurchaseOrder" entityId={po.id} label={T("po.workspace.uploadLabel")} accept="image/png,image/jpeg,image/webp,application/pdf" isInternal={false} includeInternal={false} canEdit />
          </CardContent>
        </Card>
      )}

      {activeTab === "discussion" && (
        <Card>
          <CardHeader><CardTitle>{T("po.workspace.discussion.title")}</CardTitle></CardHeader>
          <CardContent>
            <DiscussionFeed entityType="PurchaseOrder" entityId={po.id} comments={discussion} currentUserId={user.id} canInternal={false} canComment={canComment} />
          </CardContent>
        </Card>
      )}

      {activeTab === "zaman" && (
        <Card>
          <CardHeader><CardTitle>{T("po.workspace.tab.zaman")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {timeline.length === 0 && <p className="text-muted-foreground">{T("po.workspace.timelineEmpty")}</p>}
            {timeline.map((e) => (
              <div key={e.id} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                <div className="w-36 shrink-0 text-xs text-muted-foreground">{formatDateTime(e.at)}</div>
                <div>
                  <div>
                    <span className="font-medium">{e.userName}</span>{" "}
                    {KNOWN_ACTIONS.includes(e.action) ? T(`po.workspace.act.${e.action}` as TranslationKey) : e.action}
                    {e.after?.productionStage ? <> · <Badge tone="info">{stageLabels[String(e.after.productionStage)] ?? String(e.after.productionStage)}</Badge></> : null}
                  </div>
                  {e.reason && <div className="text-xs text-muted-foreground">{e.reason}</div>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
