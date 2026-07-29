import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD, EmptyState } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { statusLabel } from "@/lib/enums";
import { loadProcurementCase, supplierResponseLabel, CASE_STAGE_LABELS } from "@/domain/procurement-case";
import { RequisitionLinesPanel } from "@/app/(app)/requisitions/[id]/lines-panel";
import { ProcessStepper } from "./process-stepper";

export const metadata: Metadata = { title: "Satınalma Dosyası" };

const TABS = [
  { key: "genel", label: "Genel Bakış" },
  { key: "kalemler", label: "Kalemler" },
  { key: "teklif", label: "Teklif Süreci" },
  { key: "karsilastirma", label: "Karşılaştırma" },
  { key: "siparis", label: "Siparişler" },
  { key: "teslimat", label: "Teslimat/Kalite" },
  { key: "fatura", label: "Faturalar" },
  { key: "iletisim", label: "İletişim ve Geçmiş" },
];

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requirePermission(PERMISSIONS.REQUISITION_VIEW);
  const c = await loadProcurementCase(id, user.tenantId);
  if (!c) notFound();

  const activeTab = TABS.some((t) => t.key === tab) ? tab! : "genel";
  const canCreateRfq = userCan(user, PERMISSIONS.RFQ_CREATE);
  const canEvaluate = userCan(user, PERMISSIONS.RFQ_EVALUATE);
  const { req, rfqs, orders, receipts, invoices, summary, stage, nextAction } = c;

  return (
    <div>
      <PageHeader
        title={`${req.number} — Satınalma Dosyası`}
        description={`${req.company.name}${req.department?.name ? " · " + req.department.name : ""} · Talep sahibi: ${req.requester.name}`}
        action={{ label: "← İşlem Merkezi", href: "/islem-merkezi" }}
      />

      {/* Süreç göstergesi */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <ProcessStepper id={req.id} stage={stage} />
        </CardContent>
      </Card>

      {/* Sonraki işlem */}
      <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
        <span className="font-medium">Sıradaki işlem:</span> {nextAction}
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
                  {t.label}
                  {badge > 0 && <span className="rounded-full bg-muted px-1.5 text-[10px]">{badge}</span>}
                </Link>
              );
            })}
          </div>

          {activeTab === "genel" && <GenelTab c={c} />}
          {activeTab === "kalemler" && <KalemlerTab c={c} />}
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
                      {r.suppliers.length} davet · {r.suppliers.filter((s) => s.status === "RESPONDED").length} teklif · Son tarih: {r.dueAt ? formatDate(r.dueAt) : "-"}
                    </span>
                  </CardHeader>
                  <CardContent className="p-0">
                    <SupplierTable rfqId={r.id} suppliers={r.suppliers} canEvaluate={canEvaluate} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {activeTab === "karsilastirma" && <KarsilastirmaTab c={c} />}
          {activeTab === "siparis" && <SiparisTab orders={orders} />}
          {activeTab === "teslimat" && <TeslimatTab receipts={receipts} orders={orders} />}
          {activeTab === "fatura" && <FaturaTab invoices={invoices} />}
          {activeTab === "iletisim" && <IletisimTab rfqs={rfqs} />}
        </div>

        {/* Sabit özet paneli */}
        <div className="space-y-4">
          <Card className="lg:sticky lg:top-4">
            <CardHeader><CardTitle className="text-base">Dosya Özeti</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Talep" value={req.number} />
              <Row label="Durum" value={<StatusBadge status={req.status} />} />
              <Row label="Aşama" value={<Badge tone="info">{CASE_STAGE_LABELS[stage]}</Badge>} />
              <Row label="Talep sahibi" value={req.requester.name} />
              <Row label="Satınalma sorumlusu" value={c.assignedBuyer?.name ?? "—"} />
              <div className="border-t pt-2" />
              <Row label="Toplam kalem" value={String(summary.totalLines)} />
              <Row label="RFQ'ya çıkan kalem" value={String(summary.linesInRfq)} />
              <Row label="Davet edilen tedarikçi" value={String(summary.invitedSuppliers)} />
              <Row label="Teklif gelen" value={String(summary.respondedSuppliers)} />
              <Row label="Sipariş" value={String(summary.orderCount)} />
              <Row label="Mal kabul" value={String(summary.receiptCount)} />
              <Row label="Fatura" value={String(summary.invoiceCount)} />
              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="font-medium">Sıradaki:</span> {nextAction}
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

function SupplierTable({ rfqId, suppliers, canEvaluate }: { rfqId: string; suppliers: ProcCase["rfqs"][number]["suppliers"]; canEvaluate: boolean }) {
  if (suppliers.length === 0) return <p className="p-4 text-sm text-muted-foreground">Henüz tedarikçi davet edilmedi.</p>;
  return (
    <Table>
      <THead><TR><TH>Tedarikçi</TH><TH>Durum</TH><TH className="text-right">Teklif Tutarı</TH><TH></TH></TR></THead>
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
                  <a href={`/teklif-onizleme/${rfqId}`} target="_blank" rel="noopener" className="text-primary hover:underline">Gör</a>
                  {canEvaluate && <Link href={`/rfqs/${rfqId}/teklif-gir/${s.id}`} className="text-primary hover:underline">Teklif Gir/Düzenle</Link>}
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

function GenelTab({ c }: { c: ProcCase }) {
  const { req } = c;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Talep Bilgileri</CardTitle></CardHeader>
      <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
        <Row label="Talep No" value={req.number} />
        <Row label="Durum" value={<StatusBadge status={req.status} />} />
        <Row label="Talep sahibi" value={req.requester.name} />
        <Row label="Şirket" value={req.company.name} />
        <Row label="Departman" value={req.department?.name ?? "—"} />
        <Row label="Proje" value={req.project?.name ?? "—"} />
        <Row label="Öncelik" value={statusLabel(req.priority)} />
        <Row label="Oluşturma" value={formatDate(req.createdAt)} />
        {req.justification && (
          <div className="sm:col-span-2 border-t pt-2">
            <div className="text-xs font-medium text-muted-foreground">Gerekçe</div>
            <p className="text-sm">{req.justification}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KalemlerTab({ c }: { c: ProcCase }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Talep Kalemleri</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>#</TH><TH>Açıklama</TH><TH>Kategori</TH><TH className="text-right">Miktar</TH><TH>Durum</TH></TR></THead>
          <TBody>
            {c.req.lines.map((l) => (
              <TR key={l.id}>
                <TD>{l.lineNo}</TD>
                <TD className="font-medium">{l.description}</TD>
                <TD className="text-sm text-muted-foreground">{l.category?.name ?? "-"}</TD>
                <TD className="text-right">{l.quantity} {l.uom ?? ""}</TD>
                <TD>{l.status === "OPEN" ? <Badge>Açık</Badge> : <StatusBadge status={l.status} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function KarsilastirmaTab({ c }: { c: ProcCase }) {
  const withBids = c.rfqs.filter((r) => r.suppliers.some((s) => s.bids.length > 0));
  if (withBids.length === 0) return <EmptyStateCard title="Henüz karşılaştırılacak teklif yok" hint="Tedarikçiler yanıtladıkça teklifler burada karşılaştırılır." />;
  return (
    <div className="space-y-4">
      {withBids.map((r) => (
        <Card key={r.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">{r.number} — Teklif Karşılaştırma</CardTitle>
            <Link href={`/rfqs/${r.id}`} className="text-xs text-primary hover:underline">Detaylı karşılaştırma →</Link>
          </CardHeader>
          <CardContent className="p-0">
            <SupplierTable rfqId={r.id} suppliers={r.suppliers.filter((s) => s.bids.length > 0)} canEvaluate />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SiparisTab({ orders }: { orders: ProcCase["orders"] }) {
  if (orders.length === 0) return <EmptyStateCard title="Henüz sipariş yok" hint="Teklif karara bağlandığında sipariş oluşur." />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Siparişler</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>Sipariş No</TH><TH>Tedarikçi</TH><TH className="text-right">Tutar</TH><TH>Durum</TH></TR></THead>
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

function TeslimatTab({ receipts, orders }: { receipts: ProcCase["receipts"]; orders: ProcCase["orders"] }) {
  if (receipts.length === 0) return <EmptyStateCard title="Henüz mal kabul yok" hint="Sipariş sevk edildikçe mal kabuller burada görünür." />;
  const orderNo = new Map(orders.flatMap((o) => o.goodsReceipts.map((g) => [g.id, o.number])));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mal Kabuller</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>Mal Kabul No</TH><TH>Sipariş</TH><TH>Durum</TH><TH>Tarih</TH></TR></THead>
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

function FaturaTab({ invoices }: { invoices: ProcCase["invoices"] }) {
  if (invoices.length === 0) return <EmptyStateCard title="Henüz fatura yok" hint="Mal kabul sonrası faturalar burada eşleştirilir." />;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Faturalar</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <THead><TR><TH>Fatura No</TH><TH className="text-right">Tutar</TH><TH>Durum</TH></TR></THead>
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

function IletisimTab({ rfqs }: { rfqs: ProcCase["rfqs"] }) {
  if (rfqs.length === 0) return <EmptyStateCard title="Henüz iletişim yok" hint="RFQ gönderildikçe tedarikçi yazışmaları burada toplanır." />;
  return (
    <div className="space-y-3">
      {rfqs.map((r) => (
        <Card key={r.id}>
          <CardHeader><CardTitle className="text-base">{r.number} — Tedarikçi İletişimi</CardTitle></CardHeader>
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
            <Link href={`/rfqs/${r.id}`} className="text-xs text-primary hover:underline">Tüm yazışma/e-posta geçmişi →</Link>
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
