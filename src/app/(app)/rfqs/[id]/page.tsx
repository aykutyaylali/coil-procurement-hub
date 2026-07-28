import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/dates";
import { SendPanel } from "./send-panel";
import { Comparison } from "./comparison";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const rfq = await prisma.rFQ.findFirst({
    where: { id, tenantId: user.tenantId },
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

  // Karşılaştırma verisi
  const bidData = rfq.bids.map((b) => ({
    id: b.id,
    supplierId: b.supplierId,
    supplierName: b.supplier.legalName,
    currency: b.currency,
    status: b.status,
    lines: b.lines.map((bl) => ({
      rfqLineId: bl.rfqLineId,
      willQuote: bl.willQuote,
      unitPrice: bl.unitPrice,
      discountPct: bl.discountPct,
      taxRate: bl.taxRate,
      leadTimeDays: bl.leadTimeDays,
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
        <div className="flex items-center gap-3">
          <a href={`/rfqs/${rfq.id}/pdf`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">RFQ PDF</a>
          <a href={`/rfqs/${rfq.id}/comparison-pdf`} target="_blank" rel="noopener" className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">Karşılaştırma PDF</a>
          <Link href="/rfqs" className="text-sm text-primary hover:underline">← Listeye dön</Link>
        </div>
      </div>

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
          {canSend && (
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
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Davet Edilen Tedarikçiler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rfq.suppliers.length === 0 && <p className="text-sm text-muted-foreground">Henüz tedarikçi davet edilmedi.</p>}
              {rfq.suppliers.map((rs) => (
                <div key={rs.id} className="flex items-center justify-between text-sm">
                  <span>{rs.supplier.legalName}</span>
                  <StatusBadge status={rs.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
