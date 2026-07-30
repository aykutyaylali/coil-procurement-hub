import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatDateTime, formatDate } from "@/lib/dates";
import { add, lineNet, lineTax, toStr, formatMoney } from "@/lib/money";
import { supplierResponseLabel } from "@/domain/procurement-case";
import { getLatestRates } from "@/lib/exchange/service";
import { SendPanel } from "./send-panel";
import { Comparison } from "./comparison";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const rfq = await prisma.rFQ.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: {
      company: true,
      lines: { orderBy: { lineNo: "asc" } },
      suppliers: { include: { supplier: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 20 },
      bids: {
        where: { status: { in: ["SUBMITTED", "REVISED", "SHORTLISTED", "AWARDED"] } },
        include: { supplier: true, lines: true },
      },
      award: true,
    },
  });
  if (!rfq) notFound();

  // Kara liste/pasif ve silinmiş dışındaki TÜM tedarikçiler davet edilebilir
  // (yeni eklenen DRAFT/ONBOARDING tedarikçiler de listede görünür).
  const allSuppliers = await prisma.supplier.findMany({
    where: { tenantId: user.tenantId, deletedAt: null, status: { notIn: ["BLACKLISTED", "INACTIVE", "REJECTED"] } },
    orderBy: { legalName: "asc" },
    select: { id: true, legalName: true, code: true },
  });

  const canSend = userCan(user, PERMISSIONS.RFQ_SEND);
  const canEvaluate = userCan(user, PERMISSIONS.RFQ_EVALUATE);
  const canAward = userCan(user, PERMISSIONS.RFQ_AWARD);
  const sealedHidden = rfq.sealed && rfq.dueAt && rfq.dueAt.getTime() > Date.now();

  // Bağlı talep (satınalma dosyası) — kalemlerden
  const requisitionId = rfq.lines.find((l) => l.requisitionId)?.requisitionId ?? null;

  // Güncel TCMB kurları (TL karşılığı hesabı için) — { USD: "47.35", ... }
  const rates = await getLatestRates(user.tenantId);
  const rateMap: Record<string, string> = { TRY: "1" };
  for (const r of rates) rateMap[r.quote] = r.rate;

  // Üst özet + tedarikçi yanıt tablosu verisi (tek tablo; Türkçe durumlar)
  const invitedCount = rfq.suppliers.length;
  const respondedCount = rfq.suppliers.filter((s) => s.status === "RESPONDED").length;
  const pendingCount = invitedCount - respondedCount;
  const daysLeft = rfq.dueAt ? Math.ceil((rfq.dueAt.getTime() - Date.now()) / 86_400_000) : null;
  const qtyByLine = new Map(rfq.lines.map((l) => [l.id, l.quantity]));
  const bidTotalBySupplier = new Map<string, { total: string; currency: string }>();
  for (const b of rfq.bids) {
    let t = add("0");
    for (const bl of b.lines) {
      if (!bl.willQuote) continue;
      const qty = qtyByLine.get(bl.rfqLineId) ?? "1";
      const net = lineNet(qty, bl.unitPrice, bl.discountPct);
      t = add(t, net, lineTax(net, bl.taxRate));
    }
    bidTotalBySupplier.set(b.supplierId, { total: toStr(t, 2), currency: b.currency });
  }
  const supplierRows = rfq.suppliers.map((rs) => ({
    id: rs.id,
    name: rs.supplier.legalName,
    status: rs.status,
    invited: rs.status !== "PENDING",
    respondedAt: rs.respondedAt,
    viewedAt: rs.viewedAt,
    bid: bidTotalBySupplier.get(rs.supplierId) ?? null,
  }));

  // Karşılaştırma verisi (zengin: kaynak, ödeme vadesi, incoterm, geçerlilik, navlun, marka/model, not)
  const bidData = rfq.bids.map((b) => ({
    id: b.id,
    supplierId: b.supplierId,
    supplierName: b.supplier.legalName,
    currency: b.currency,
    status: b.status,
    source: b.source,
    paymentTermDays: b.paymentTermDays,
    incoterm: b.incoterm,
    validUntil: b.validUntil ? b.validUntil.toISOString() : null,
    freightAmount: b.freightAmount,
    note: b.note,
    submittedAt: b.submittedAt ? b.submittedAt.toISOString() : null,
    lines: b.lines.map((bl) => ({
      rfqLineId: bl.rfqLineId,
      willQuote: bl.willQuote,
      unitPrice: bl.unitPrice,
      discountPct: bl.discountPct,
      taxRate: bl.taxRate,
      leadTimeDays: bl.leadTimeDays,
      currency: bl.currency,
      brand: bl.brand,
      model: bl.model,
      note: bl.note,
    })),
  }));

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{rfq.number}</h1>
            <StatusBadge status={rfq.status} />
            {rfq.sealed && (
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-white">Kapalı Teklif</span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {rfq.title} · {rfq.company.name} · Son Tarih: {rfq.dueAt ? formatDateTime(rfq.dueAt) : "-"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {requisitionId && (
            <Link href={`/islem-merkezi/${requisitionId}?tab=teklif`} className="rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">
              ← Satınalma Dosyası
            </Link>
          )}
          <a href={`/teklif-onizleme/${rfq.id}`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-accent">👁 Önizle</a>
          <a href={`/rfqs/${rfq.id}/pdf`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-accent">RFQ PDF</a>
          <a href={`/rfqs/${rfq.id}/comparison-pdf`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm text-primary hover:bg-accent">Karşılaştırma PDF</a>
        </div>
      </div>

      {/* Üst özet */}
      {invitedCount > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <span><b>{invitedCount}</b> tedarikçi davet edildi</span>
          <span className="text-emerald-600 dark:text-emerald-400"><b>{respondedCount}</b> teklif geldi</span>
          <span className="text-muted-foreground"><b>{pendingCount}</b> yanıt bekleniyor</span>
          <span className="ml-auto text-muted-foreground">
            Son tarih: {rfq.dueAt ? formatDate(rfq.dueAt) : "-"}
            {daysLeft !== null && (
              <span className={`ml-1 font-medium ${daysLeft < 0 ? "text-destructive" : daysLeft <= 2 ? "text-amber-600" : "text-foreground"}`}>
                {daysLeft < 0 ? `(${-daysLeft} gün geçti)` : daysLeft === 0 ? "(bugün)" : `(${daysLeft} gün kaldı)`}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Kalemler</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Açıklama</TH>
                    <TH className="text-right">Miktar</TH>
                    <TH>Birim</TH>
                  </TR>
                </THead>
                <TBody>
                  {rfq.lines.map((l) => (
                    <TR key={l.id}>
                      <TD>{l.lineNo}</TD>
                      <TD className="font-medium">{l.description}</TD>
                      <TD className="text-right">{l.quantity}</TD>
                      <TD>{l.uom ?? "-"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          {/* Tek tedarikçi yanıt tablosu (Türkçe durumlar; tekrar yok) */}
          <Card>
            <CardHeader><CardTitle>Tedarikçi Yanıtları</CardTitle></CardHeader>
            <CardContent className="p-0">
              {supplierRows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Henüz tedarikçi davet edilmedi. Sağdaki panelden davet gönderin.</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Tedarikçi</TH>
                      <TH>Durum</TH>
                      <TH className="text-right">Teklif Tutarı</TH>
                      <TH>Son İşlem</TH>
                      <TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {supplierRows.map((s) => (
                      <TR key={s.id} className={s.status === "RESPONDED" ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
                        <TD className="font-medium">{s.name}</TD>
                        <TD><Badge tone={s.status === "RESPONDED" ? "success" : s.status === "VIEWED" ? "info" : s.status === "DECLINED" ? "danger" : "default"}>{supplierResponseLabel(s.status)}</Badge></TD>
                        <TD className="text-right">{s.bid ? formatMoney(s.bid.total, s.bid.currency) : "—"}</TD>
                        <TD className="text-xs text-muted-foreground">{s.respondedAt ? formatDate(s.respondedAt) : s.viewedAt ? formatDate(s.viewedAt) : "-"}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2 text-xs">
                            <a href={`/teklif-onizleme/${rfq.id}`} target="_blank" rel="noopener" className="text-primary hover:underline">Gör</a>
                            {canEvaluate && (
                              <Link href={`/rfqs/${rfq.id}/teklif-gir/${s.id}`} className="text-primary hover:underline" title="Satınalma tarafından manuel girilen teklif">
                                Teklif Gir/Düzenle
                              </Link>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              {canEvaluate && supplierRows.length > 0 && (
                <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
                  “Teklif Gir/Düzenle” = satınalma tarafından manuel girilen teklif (tedarikçi portalından geleni ile karışmaz).
                </p>
              )}
            </CardContent>
          </Card>

          {sealedHidden ? (
            <Card>
              <CardHeader>
                <CardTitle>Teklif Karşılaştırma</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Bu bir <b>kapalı teklif</b> sürecidir. Teklif fiyatları son teklif tarihinden (
                  {rfq.dueAt ? formatDateTime(rfq.dueAt) : "-"}) önce görüntülenemez.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Comparison
              rfqId={rfq.id}
              rfqStatus={rfq.status}
              lines={rfq.lines.map((l) => ({ id: l.id, lineNo: l.lineNo, description: l.description, quantity: l.quantity, uom: l.uom }))}
              bids={bidData}
              rateMap={rateMap}
              canEvaluate={canEvaluate}
              canAward={canAward}
              awarded={!!rfq.award}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>İletişim / E-posta Geçmişi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rfq.messages.length === 0 && <p className="text-sm text-muted-foreground">Henüz mesaj yok.</p>}
              {rfq.messages.map((m) => (
                <div key={m.id} className="rounded border-l-2 border-primary/30 bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{m.direction === "OUTBOUND" ? "Giden" : "Gelen"}</span>
                  {m.subject ? ` · ${m.subject}` : ""}
                  <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                  {m.body && <div className="mt-0.5 text-xs text-muted-foreground">{m.body}</div>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canSend ? (
            <SendPanel
              rfqId={rfq.id}
              status={rfq.status}
              suppliers={allSuppliers.map((s) => ({ id: s.id, name: s.legalName }))}
              invited={rfq.suppliers.map((rs) => ({
                id: rs.supplierId,
                name: rs.supplier.legalName,
                status: rs.status,
                remindersSent: rs.remindersSent,
              }))}
              dueAt={rfq.dueAt?.toISOString() ?? null}
              hideInvited
            />
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-base">Bilgi</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">Tedarikçi yanıtları soldaki tabloda görünür.</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
