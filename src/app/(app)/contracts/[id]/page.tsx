import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatMoney, sub, d } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { statusLabel } from "@/lib/enums";
import { ContractStatusActions, ContractItems } from "./manage";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.CONTRACT_VIEW);
  const canManage = userCan(user, PERMISSIONS.CONTRACT_MANAGE);

  const c = await prisma.contract.findFirst({
    where: { id, tenantId: user.tenantId },
    include: { supplier: true, items: { orderBy: { description: "asc" } } },
  });
  if (!c) notFound();

  const history = await prisma.auditLog.findMany({
    where: { tenantId: user.tenantId, entityType: "Contract", entityId: c.id },
    include: { user: true }, orderBy: { createdAt: "desc" }, take: 20,
  });
  const remaining = c.totalLimit ? sub(c.totalLimit, c.usedAmount).toString() : null;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{c.code}</h1>
            <StatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{c.title} · {c.supplier.legalName}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && <Link href={`/contracts/${c.id}/edit`} className="rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">Düzenle</Link>}
          <Link href="/contracts" className="text-sm text-primary hover:underline">← Listeye dön</Link>
        </div>
      </div>

      {canManage && <div className="mb-4"><ContractStatusActions id={c.id} status={c.status} /></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Fiyat Listesi</CardTitle></CardHeader>
            <CardContent>
              {canManage ? (
                <ContractItems contractId={c.id} currency={c.currency} items={c.items.map((i) => ({ id: i.id, description: i.description, unitPrice: i.unitPrice, uom: i.uom }))} />
              ) : (
                <div className="space-y-1 text-sm">{c.items.map((i) => <div key={i.id} className="flex justify-between border-b py-1"><span>{i.description}</span><span>{formatMoney(i.unitPrice, c.currency)}</span></div>)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Sürüm Geçmişi</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {history.map((h) => (
                <div key={h.id} className="rounded border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
                  <span className="font-medium">{h.user?.name ?? "Sistem"}</span> · {statusLabel(h.action)}
                  <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Özet</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Tür" value={c.type} />
              <Row label="Para Birimi" value={c.currency} />
              <Row label="Başlangıç" value={c.startDate ? formatDate(c.startDate) : "-"} />
              <Row label="Bitiş" value={c.endDate ? formatDate(c.endDate) : "-"} />
              <Row label="Fesih İhbar" value={c.noticeDate ? formatDate(c.noticeDate) : "-"} />
              <Row label="Otomatik Yenileme" value={c.autoRenew ? "Evet" : "Hayır"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Limit Kullanımı</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Toplam Limit" value={c.totalLimit ? formatMoney(c.totalLimit, c.currency) : "-"} />
              <Row label="Kullanılan" value={formatMoney(c.usedAmount, c.currency)} />
              <Row label="Kalan" value={remaining != null ? formatMoney(remaining, c.currency) : "-"} tone={remaining != null && d(remaining).isNegative() ? "danger" : undefined} />
            </CardContent>
          </Card>
          {c.slaTerms && <Card><CardHeader><CardTitle>SLA / Şartlar</CardTitle></CardHeader><CardContent className="text-sm">{c.slaTerms}</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${tone === "danger" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}
