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
import { translator, type Locale } from "@/lib/i18n";
import { env } from "@/lib/env";
import { OnboardingLinkCard } from "./onboarding-link";
import { PortalAccessCard, type PortalStatus } from "./portal-access";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission(PERMISSIONS.SUPPLIER_VIEW);
  const T = translator(user.locale as Locale);
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
            <StatusBadge status={s.status} locale={user.locale} />
            <Badge tone={s.supplierType === "FOREIGN" ? "info" : "default"}>
              {s.supplierType === "FOREIGN" ? T("supp.type.foreign") : T("supp.type.domestic")}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.code} · {s.country} · {T("supp.detail.preferredLang")}: {s.preferredLanguage.toUpperCase()}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {canEdit && <Link href={`/suppliers/${s.id}/edit`} className="text-sm text-primary hover:underline">{T("supp.edit")}</Link>}
          <Link href="/suppliers" className="text-sm text-primary hover:underline">← {T("supp.detail.backToList")}</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>{T("supp.detail.recentOrders")}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead><TR><TH>{T("supp.order.number")}</TH><TH>{T("supp.order.operation")}</TH><TH className="text-right">{T("supp.order.amount")}</TH><TH>{T("supp.order.status")}</TH><TH>{T("supp.order.date")}</TH></TR></THead>
                <TBody>
                  {s.purchaseOrders.length === 0 && (
                    <TR><TD colSpan={5} className="py-6 text-center text-sm text-muted-foreground">{T("supp.detail.noOrders")}</TD></TR>
                  )}
                  {s.purchaseOrders.map((o) => (
                    <TR key={o.id}>
                      <TD><Link href={`/orders/${o.id}`} className="text-primary hover:underline">{o.number}</Link></TD>
                      <TD className="text-xs">{opLabel(o.operationType, user.locale as Locale)}</TD>
                      <TD className="text-right">{formatMoney(o.grandTotal, o.currency)}</TD>
                      <TD><StatusBadge status={o.status} locale={user.locale} /></TD>
                      <TD className="text-sm text-muted-foreground">{formatDate(o.orderDate)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{T("supp.detail.documents")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {s.documents.length === 0 && <p className="text-sm text-muted-foreground">{T("supp.detail.noDocuments")}</p>}
              {s.documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm">
                  <span>{doc.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{doc.validUntil ? formatDate(doc.validUntil) : "-"}</span>
                    <StatusBadge status={doc.status} locale={user.locale} />
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
            <CardHeader><CardTitle>{T("supp.detail.commercialInfo")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={T("supp.field.taxNumber")} value={s.taxNumber ?? "-"} />
              <Row label={T("supp.field.taxOffice")} value={s.taxOffice ?? "-"} />
              <Row label={T("supp.field.defaultCurrency")} value={s.defaultCurrency} />
              <Row label={T("supp.field.defaultIncoterm")} value={s.defaultIncoterm ?? "-"} />
              <Row label={T("supp.field.paymentTerm")} value={s.defaultPaymentTermDays ? T("supp.detail.days", { n: s.defaultPaymentTermDays }) : "-"} />
              <Row label={T("supp.field.operation")} value={ops.map((o) => opLabel(o, user.locale as Locale)).join(", ") || "-"} />
              <Row label={T("supp.field.risk")} value={s.riskLevel} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{T("supp.detail.contact")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.contacts.map((c) => (
                <div key={c.id}>
                  <div className="font-medium">{c.name} {c.isPrimary ? "★" : ""}</div>
                  <div className="text-xs text-muted-foreground">{c.email} · {c.phone}</div>
                </div>
              ))}
              {s.contacts.length === 0 && <p className="text-muted-foreground">{T("supp.detail.noContact")}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{T("supp.detail.bankAccounts")}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {s.bankAccounts.map((b) => (
                <div key={b.id}>
                  <div className="font-medium">{b.bankName} ({b.currency})</div>
                  <div className="font-mono text-xs text-muted-foreground">{b.iban}{b.swiftBic ? ` · ${b.swiftBic}` : ""}</div>
                  <StatusBadge status={b.status} locale={user.locale} />
                </div>
              ))}
              {s.bankAccounts.length === 0 && <p className="text-muted-foreground">{T("supp.detail.noBankAccount")}</p>}
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
