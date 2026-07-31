import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { opLabel } from "@/domain/operations";
import { env } from "@/lib/env";
import { OnboardingLinkCard } from "./onboarding-link";
import { PortalAccessCard, type PortalStatus } from "./portal-access";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.SUPPLIER_VIEW);
  const canEdit = userCan(user, PERMISSIONS.SUPPLIER_EDIT);

  const s = await prisma.supplier.findFirst({
    where: { id, tenantId: user.tenantId },
    include: {
      contacts: { include: { user: { select: { isActive: true, passwordHash: true } } } },
      bankAccounts: true,
      documents: true,
      scores: { orderBy: { createdAt: "desc" }, take: 4 },
      purchaseOrders: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!s) notFound();

  let ops: string[] = [];
  try { ops = JSON.parse(s.operationTypes); } catch { /* */ }

  // Portal erişim durumu: portal kullanıcısı olan kişiden türet
  const portalContact = s.contacts.find((c) => c.userId) ?? null;
  const primaryEmail = s.contacts.find((c) => c.isPrimary && c.email)?.email ?? s.contacts.find((c) => c.email)?.email ?? null;
  let portalStatus: PortalStatus = "NONE";
  let portalInviteUrl: string | null = null;
  if (portalContact?.userId) {
    const revoked = !!portalContact.portalInviteRevokedAt;
    const hasPw = !!portalContact.user?.passwordHash;
    const isActive = !!portalContact.user?.isActive;
    portalStatus = revoked || (hasPw && !isActive) ? "PASSIVE" : hasPw ? "ACTIVE" : "INVITED";
    if (portalContact.portalInviteToken && !revoked) {
      portalInviteUrl = `${env.APP_URL}/reset-password/${portalContact.portalInviteToken}`;
    }
  }
  const portalEmail = portalContact?.email ?? primaryEmail;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{s.legalName}</h1>
            <StatusBadge status={s.status} />
            <Badge tone={s.supplierType === "FOREIGN" ? "info" : "default"}>
              {s.supplierType === "FOREIGN" ? "Yabancı" : "Yerli"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.code} · {s.country} · Tercih dil: {s.preferredLanguage.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {canEdit && <Link href={`/suppliers/${s.id}/edit`} className="text-sm text-primary hover:underline">Düzenle</Link>}
          <Link href="/suppliers" className="text-sm text-primary hover:underline">← Listeye dön</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Son Siparişler</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>No</TH><TH>Operasyon</TH><TH className="text-right">Tutar</TH><TH>Durum</TH><TH>Tarih</TH></TR></THead>
                <TBody>
                  {s.purchaseOrders.length === 0 && (
                    <TR><TD colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Sipariş yok</TD></TR>
                  )}
                  {s.purchaseOrders.map((o) => (
                    <TR key={o.id}>
                      <TD><Link href={`/orders/${o.id}`} className="text-primary hover:underline">{o.number}</Link></TD>
                      <TD className="text-xs">{opLabel(o.operationType)}</TD>
                      <TD className="text-right">{formatMoney(o.grandTotal, o.currency)}</TD>
                      <TD><StatusBadge status={o.status} /></TD>
                      <TD className="text-sm text-muted-foreground">{formatDate(o.orderDate)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Belgeler</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {s.documents.length === 0 && <p className="text-sm text-muted-foreground">Belge kaydı yok.</p>}
              {s.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span>{doc.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{doc.validUntil ? formatDate(doc.validUntil) : "-"}</span>
                    <StatusBadge status={doc.status} />
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canEdit && (
            <PortalAccessCard supplierId={s.id} email={portalEmail} status={portalStatus} inviteUrl={portalInviteUrl} />
          )}
          {canEdit && (
            <OnboardingLinkCard supplierId={s.id} tokenActive={!!s.onboardingTokenExpiresAt && s.onboardingTokenExpiresAt.getTime() > Date.now()} />
          )}
          <Card>
            <CardHeader><CardTitle>Ticari Bilgiler</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Vergi No" value={s.taxNumber ?? "-"} />
              <Row label="Vergi Dairesi" value={s.taxOffice ?? "-"} />
              <Row label="Varsayılan Para" value={s.defaultCurrency} />
              <Row label="Varsayılan Incoterm" value={s.defaultIncoterm ?? "-"} />
              <Row label="Ödeme Vadesi" value={s.defaultPaymentTermDays ? `${s.defaultPaymentTermDays} gün` : "-"} />
              <Row label="Operasyon" value={ops.map((o) => opLabel(o)).join(", ") || "-"} />
              <Row label="Risk" value={s.riskLevel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>İletişim</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.contacts.map((c) => (
                <div key={c.id}>
                  <div className="font-medium">{c.name} {c.isPrimary ? "★" : ""}</div>
                  <div className="text-xs text-muted-foreground">{c.email} · {c.phone}</div>
                </div>
              ))}
              {s.contacts.length === 0 && <p className="text-muted-foreground">Kişi yok</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Banka Hesapları</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.bankAccounts.map((b) => (
                <div key={b.id}>
                  <div className="font-medium">{b.bankName} ({b.currency})</div>
                  <div className="font-mono text-xs text-muted-foreground">{b.iban}{b.swiftBic ? ` · ${b.swiftBic}` : ""}</div>
                  <StatusBadge status={b.status} />
                </div>
              ))}
              {s.bankAccounts.length === 0 && <p className="text-muted-foreground">Hesap yok</p>}
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
