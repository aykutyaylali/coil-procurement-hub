import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney, formatQty } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { translator, type Locale, type TranslationKey } from "@/lib/i18n";
import { loadProcurementCase, supplierResponseLabel } from "@/domain/procurement-case";
import { RequisitionLinesPanel } from "@/app/(app)/requisitions/[id]/lines-panel";
import { ProcessStepper } from "./process-stepper";

export const metadata: Metadata = { title: "Satınalma Dosyası" };

type Tr = (key: TranslationKey, params?: Record<string, string | number>) => string;

const TABS = [
  { key: "genel", labelKey: "hub.tab.genel" },
  { key: "kalemler", labelKey: "hub.tab.kalemler" },
  { key: "teklif", labelKey: "hub.tab.teklif" },
  { key: "karsilastirma", labelKey: "hub.tab.karsilastirma" },
  { key: "siparis", labelKey: "hub.tab.siparis" },
  { key: "teslimat", labelKey: "hub.tab.teslimat" },
  { key: "fatura", labelKey: "hub.tab.fatura" },
  { key: "iletisim", labelKey: "hub.tab.iletisim" },
] as const;

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requirePermission(PERMISSIONS.REQUISITION_VIEW);
  const T = translator(user.locale as Locale);
  const c = await loadProcurementCase(id, user.tenantId);
  if (!c) notFound();

  const activeTab = TABS.some((t) => t.key === tab) ? tab! : "genel";
  const canCreateRfq = userCan(user, PERMISSIONS.RFQ_CREATE);
  const canEvaluate = userCan(user, PERMISSIONS.RFQ_EVALUATE);
  const { req, rfqs, orders, receipts, invoices, summary, stage, nextAction } = c;

  return (
    <div>
      <PageHeader
        title={`${req.number} — ${T("hub.detail.caseTitle")}`}
        description={`${req.company.name}${req.department?.name ? " · " + req.department.name : ""} · ${T("hub.detail.requester")}: ${req.requester.name}`}
        action={{ label: `← ${T("nav.islemMerkezi")}`, href: "/islem-merkezi" }}
      />

      {/* Süreç göstergesi */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <ProcessStepper
            id={req.id}
            stage={stage}
            ariaLabel={T("hub.detail.processSteps")}
            stageLabel={(st) => T(`hub.stage.${st}` as TranslationKey)}
          />
        </CardContent>
      </Card>

      {/* Sonraki işlem */}
      <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
        <span className="font-medium">{T("hub.detail.nextAction")}:</span> {nextAction}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Sekmeler */}
          <div className="flex flex-wrap gap-1 border-b">
            {TABS.map((t) => {
              const badge =
                t.key === "teklif" ? summary.rfqCount : t.key === "karsilastirma" ? summary.respondedSuppliers : t.key === "siparis" ? summary.orderCount : t.key === "fatura" ? summary.invoiceCount : 0;
              return (
                <Link
                  key={t.key}
                  href={`/islem-merkezi/${req.id}?tab=${t.key}`}
                  className={`flex items-center gap-1.5 rounded-t-md px-3 py-2 text-sm ${
                    activeTab === t.key ? "border-b-2 border-primary font-medium text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {T(t.labelKey as TranslationKey)}
                  {badge > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px]">{badge}</span>}
                </Link>
              );
            })}
          </div>

          {activeTab === "genel" && <GenelTab c={c} T={T} />}
          {activeTab === "kalemler" && <KalemlerTab c={c} T={T} />}
          {activeTab === "teklif" && (
            <div className="space-y-4">
              <RequisitionLinesPanel
                requisitionId={req.id}
                canCreateRfq={canCreateRfq}
                reqStatus={req.status}
                lines={req.lines.map((l) => ({ id: l.id, lineNo: l.lineNo, description: l.description, categoryName: l.category?.name ?? null, quantity: l.quantity, uom: l.uom, status: l.status }))}
              />
              {rfqs.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base">
                      <Link href={`/rfqs/${r.id}`} className="text-primary hover:underline">{r.number}</Link>{" "}
                      <StatusBadge status={r.status} />
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {r.suppliers.length} {T("hub.detail.invited")} · {r.suppliers.filter((s) => s.status === "RESPONDED").length} {T("hub.detail.quotes")} · {T("hub.detail.dueDate")}: {r.dueAt ? formatDate(r.dueAt) : "-"}
                    </span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <SupplierTable rfqId={r.id} suppliers={r.suppliers} canEvaluate={canEvaluate} T={T} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {activeTab === "karsilastirma" && <KarsilastirmaTab c={c} T={T} />}
          {activeTab === "siparis" && <SiparisTab orders={orders} T={T} />}
          {activeTab === "teslimat" && <TeslimatTab receipts={receipts} orders={orders} T={T} />}
          {activeTab === "fatura" && <FaturaTab invoices={invoices} T={T} />}
          {activeTab === "iletisim" && <IletisimTab rfqs={rfqs} T={T} />}
        </div>

        {/* Sabit özet paneli */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader><CardTitle className="text-base">{T("hub.detail.fileSummary")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={T("hub.detail.caseTitle")} value={req.number} />
              <Row label={T("common.status")} value={<StatusBadge status={req.status} />} />
              <Row label={T("hub.detail.stage")} value={<Badge tone="info">{T(`hub.stage.${stage}` as TranslationKey)}</Badge>} />
              <Row label={T("hub.detail.requester")} value={req.requester.name} />
              <Row label={T("hub.detail.buyer")} value={c.assignedBuyer?.name ?? "—"} />
              <div className="border-t pt-2" />
              <Row label={T("hub.detail.totalLines")} value={String(summary.totalLines)} />
              <Row label={T("hub.detail.linesInRfq")} value={String(summary.linesInRfq)} />
              <Row label={T("hub.detail.invitedSuppliers")} value={String(summary.invitedSuppliers)} />
              <Row label={T("hub.detail.respondedSuppliers")} value={String(summary.respondedSuppliers)} />
              <Row label={T("hub.detail.orderCount")} value={String(summary.orderCount)} />
              <Row label={T("hub.detail.receiptCount")} value={String(summary.receiptCount)} />
              <Row label={T("hub.detail.invoiceCount")} value={String(summary.invoiceCount)} />
              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">{T("hub.detail.next")}:</span> {nextAction}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SupplierTable({ rfqId, suppliers, canEvaluate, T }: { rfqId: string; suppliers: ProcCase["rfqs"][number]["suppliers"]; canEvaluate: boolean; T: Tr }) {
  if (suppliers.length === 0) return <p className="p-4 text-sm text-muted-foreground">{T("hub.detail.noSupplierInvited")}</p>;
  return (
    <Table>
      <THead><TR><TH>{T("common.supplier")}</TH><TH>{T("common.status")}</TH><TH className="text-right">{T("hub.detail.bidTotal")}</TH><TH></TH></TR></THead>
      <TBody>
        {suppliers.map((s) => {
          return (
            <TR key={s.id} className={s.status === "RESPONDED" ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
              <TD className="font-medium">{s.supplier.legalName}</TD>
              <TD>
                <Badge tone={s.status === "RESPONDED" ? "success" : s.status === "VIEWED" ? "info" : "default"}>
                  {supplierResponseLabel(s.status)}
                </Badge>
              </TD>
              <TD className="text-right">{s.bidTotal ? formatMoney(s.bidTotal, s.bidCurrency) : "—"}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-2 text-xs">
                  <a href={`/teklif-onizleme/${rfqId}`} target="_blank" rel="noopener" className="text-primary hover:underline">{T("hub.detail.view")}</a>
                  {canEvaluate && <Link href={`/rfqs/${rfqId}/teklif-gir/${s.id}`} className="text-primary hover:underline">{T("hub.detail.enterBid")}</Link>}
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

type ProcCase = Awaited<ReturnType<typeof loadProcurementCase>> & object;

function GenelTab({ c, T }: { c: ProcCase; T: Tr }) {
  const { req } = c;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("hub.detail.reqInfo")}</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <Row label={T("req.number")} value={req.number} />
        <Row label={T("common.status")} value={<StatusBadge status={req.status} />} />
        <Row label={T("hub.detail.requester")} value={req.requester.name} />
        <Row label={T("common.company")} value={req.company.name} />
        <Row label={T("common.department")} value={req.department?.name ?? "—"} />
        <Row label={T("common.project")} value={req.project?.name ?? "—"} />
        <Row label={T("common.priority")} value={T(`priority.${req.priority}` as TranslationKey)} />
        <Row label={T("hub.detail.created")} value={formatDate(req.createdAt)} />
        {req.justification && (
          <div className="sm:col-span-2 border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground">{T("req.justification")}</div>
            <p className="text-sm">{req.justification}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KalemlerTab({ c, T }: { c: ProcCase; T: Tr }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("req.lines")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>#</TH><TH>{T("common.description")}</TH><TH>{T("common.category")}</TH><TH className="text-right">{T("common.quantity")}</TH><TH>{T("common.status")}</TH></TR></THead>
          <TBody>
            {c.req.lines.map((l) => (
              <TR key={l.id}>
                <TD>{l.lineNo}</TD>
                <TD className="font-medium">{l.description}</TD>
                <TD className="text-sm text-muted-foreground">{l.category?.name ?? "-"}</TD>
                <TD className="text-right">{formatQty(l.quantity)} {l.uom ?? ""}</TD>
                <TD>{l.status === "OPEN" ? <Badge>{T("hub.detail.open")}</Badge> : <StatusBadge status={l.status} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KarsilastirmaTab({ c, T }: { c: ProcCase; T: Tr }) {
  const withBids = c.rfqs.filter((r) => r.suppliers.some((s) => s.bids.length > 0));
  if (withBids.length === 0) return <EmptyStateCard title={T("hub.detail.noComparison")} hint={T("hub.detail.noComparisonHint")} />;
  return (
    <div className="space-y-4">
      {withBids.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{r.number} — {T("hub.detail.compareSuffix")}</CardTitle>
            <Link href={`/rfqs/${r.id}`} className="text-xs text-primary hover:underline">{T("hub.detail.detailedCompare")}</Link>
          </CardHeader>
          <CardContent className="p-0">
            <SupplierTable rfqId={r.id} suppliers={r.suppliers.filter((s) => s.bids.length > 0)} canEvaluate T={T} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SiparisTab({ orders, T }: { orders: ProcCase["orders"]; T: Tr }) {
  if (orders.length === 0) return <EmptyStateCard title={T("hub.detail.noOrders")} hint={T("hub.detail.noOrdersHint")} />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("hub.tab.siparis")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>{T("hub.detail.orderNo")}</TH><TH>{T("common.supplier")}</TH><TH className="text-right">{T("common.amount")}</TH><TH>{T("common.status")}</TH></TR></THead>
          <TBody>
            {orders.map((o) => (
              <TR key={o.id}>
                <TD><Link href={`/orders/${o.id}`} className="text-primary hover:underline">{o.number}</Link></TD>
                <TD className="text-sm">{o.supplier.legalName}</TD>
                <TD className="text-right">{formatMoney(o.grandTotal, o.currency)}</TD>
                <TD><StatusBadge status={o.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TeslimatTab({ receipts, orders, T }: { receipts: ProcCase["receipts"]; orders: ProcCase["orders"]; T: Tr }) {
  if (receipts.length === 0) return <EmptyStateCard title={T("hub.detail.noReceipts")} hint={T("hub.detail.noReceiptsHint")} />;
  const orderNo = new Map(orders.flatMap((o) => o.goodsReceipts.map((g) => [g.id, o.number])));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("hub.detail.goodsReceipts")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>{T("hub.detail.receiptNo")}</TH><TH>{T("hub.detail.order")}</TH><TH>{T("common.status")}</TH><TH>{T("common.date")}</TH></TR></THead>
          <TBody>
            {receipts.map((g) => (
              <TR key={g.id}>
                <TD><Link href={`/receipts/${g.id}`} className="text-primary hover:underline">{g.number}</Link></TD>
                <TD className="text-sm">{orderNo.get(g.id) ?? "-"}</TD>
                <TD><StatusBadge status={g.status} /></TD>
                <TD className="text-sm text-muted-foreground">{formatDate(g.receivedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FaturaTab({ invoices, T }: { invoices: ProcCase["invoices"]; T: Tr }) {
  if (invoices.length === 0) return <EmptyStateCard title={T("hub.detail.noInvoices")} hint={T("hub.detail.noInvoicesHint")} />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{T("hub.tab.fatura")}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>{T("hub.detail.invoiceNo")}</TH><TH className="text-right">{T("common.amount")}</TH><TH>{T("common.status")}</TH></TR></THead>
          <TBody>
            {invoices.map((inv) => (
              <TR key={inv.id}>
                <TD><Link href={`/invoices/${inv.id}`} className="text-primary hover:underline">{inv.number}</Link></TD>
                <TD className="text-right">{formatMoney(inv.grandTotal, inv.currency)}</TD>
                <TD><StatusBadge status={inv.status} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function IletisimTab({ rfqs, T }: { rfqs: ProcCase["rfqs"]; T: Tr }) {
  if (rfqs.length === 0) return <EmptyStateCard title={T("hub.detail.noComm")} hint={T("hub.detail.noCommHint")} />;
  return (
    <div className="space-y-3">
      {rfqs.map((r) => (
        <Card key={r.id}>
          <CardHeader><CardTitle className="text-base">{r.number} — {T("hub.detail.commSuffix")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {r.suppliers.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b pb-1">
                <span>{s.supplier.legalName}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={s.status === "RESPONDED" ? "success" : "default"}>{supplierResponseLabel(s.status)}</Badge>
                  {s.respondedAt ? formatDateTime(s.respondedAt) : s.viewedAt ? formatDateTime(s.viewedAt) : ""}
                </span>
              </div>
            ))}
            <Link href={`/rfqs/${r.id}`} className="text-xs text-primary hover:underline">{T("hub.detail.allCorrespondence")}</Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyStateCard({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <EmptyState title={title} hint={hint} />
      </CardContent>
    </Card>
  );
}
