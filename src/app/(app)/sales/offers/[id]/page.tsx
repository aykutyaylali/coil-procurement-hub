import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermission, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { translator, type Locale } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/lib/enums";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { countryFlag } from "@/lib/country";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { revisionLabel } from "../status";
import { OfferInfoForm, type OfferInfoInitial } from "./offer-info-form";
import { OfferNotes, type NoteItem } from "./offer-notes";
import { ReviseButton } from "./revise-button";

const TABS = ["info", "notes", "docs"] as const;

const dInput = (dt: Date | null | undefined): string => (dt ? new Date(dt).toISOString().slice(0, 10) : "");

export default async function SalesOfferEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = TABS.some((t) => t === tab) ? tab! : "info";
  const user = await requirePermission(PERMISSIONS.SALES_VIEW);
  const T = translator(user.locale as Locale);
  const canManage = userCan(user, PERMISSIONS.SALES_MANAGE);

  const offer = await prisma.salesOffer.findFirst({
    where: { id, tenantId: user.tenantId, deletedAt: null },
    include: { customer: true, salesRfq: { select: { id: true, number: true } }, technicalDetail: true },
  });
  if (!offer) notFound();

  const [salesReps, lmeRecords, notes] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: user.tenantId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lmeRecord.findMany({ where: { tenantId: user.tenantId, status: "APPROVED" }, orderBy: { priceDate: "desc" }, take: 40, select: { id: true, priceDate: true, kind: true, usdPerTon: true } }),
    prisma.salesOfferNote.findMany({ where: { offerId: offer.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const noteAuthorIds = Array.from(new Set(notes.map((n) => n.createdById)));
  const authors = noteAuthorIds.length
    ? Object.fromEntries((await prisma.user.findMany({ where: { id: { in: noteAuthorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name] as const))
    : {};

  const t = offer.technicalDetail;
  const initial: OfferInfoInitial = {
    id: offer.id, number: offer.number, status: offer.status, currency: offer.currency, totalAmount: offer.totalAmount,
    offerDate: dInput(offer.offerDate), validUntil: dInput(offer.validUntil), deliveryDate: dInput(offer.deliveryDate),
    invoiced: offer.invoiced, reason: offer.reason ?? "", salesRepId: offer.salesRepId ?? "",
    tech: {
      manufacturer: t?.manufacturer ?? "", type: t?.type ?? "", power: t?.power ?? "", voltage: t?.voltage ?? "",
      numberOfPole: t?.numberOfPole?.toString() ?? "", numberOfCoils: t?.numberOfCoils?.toString() ?? "", numberOfSlot: t?.numberOfSlot?.toString() ?? "",
      numberOfSet: t?.numberOfSet?.toString() ?? "", numberOfTurns: t?.numberOfTurns?.toString() ?? "", insulationType: t?.insulationType ?? "",
      typeOfCoil: t?.typeOfCoil ?? "", wireWidth: t?.wireWidth ?? "", wireThickness: t?.wireThickness ?? "", lmeRecordId: t?.lmeRecordId ?? "",
    },
  };
  const lmeOptions = lmeRecords.map((l) => ({ id: l.id, usdPerTon: l.usdPerTon, label: `${formatDate(l.priceDate)} · ${l.kind === "WEEKLY_AVG" ? T("salesOffer.lme.weekly") : T("salesOffer.lme.daily")} · ${formatMoney(l.usdPerTon, "USD")}/ton` }));
  const noteItems: NoteItem[] = notes.map((n) => ({ id: n.id, title: n.title, body: n.body, author: authors[n.createdById] ?? "—", createdAt: formatDateTime(n.createdAt) }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{offer.number}</h1>
            <Badge tone={statusTone(offer.status)}>{T(`salesOffer.status.${offer.status}`)}</Badge>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{revisionLabel(offer.revisionNo)}</span>
            {offer.invoiced && <span className="text-xs text-green-600">✓ {T("salesOffer.invoiced")}</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {countryFlag(offer.customer.country)} {offer.customer.name}
            {offer.customer.industry ? ` · ${offer.customer.industry}` : ""} · {formatMoney(offer.totalAmount, offer.currency)}
            {offer.salesRfq ? <> · <Link href={`/sales/rfqs/${offer.salesRfq.id}`} className="text-primary hover:underline">{offer.salesRfq.number}</Link></> : null}
            {offer.revisionDate ? ` · ${T("salesOffer.lastRevision")}: ${formatDate(offer.revisionDate)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/sales/offers/${offer.id}/pdf?lang=tr`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">📄 {T("salesOffer.pdfTr")}</a>
          <a href={`/sales/offers/${offer.id}/pdf?lang=en`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">📄 {T("salesOffer.pdfEn")}</a>
          {canManage && <ReviseButton offerId={offer.id} />}
          <Link href="/sales/offers" className="text-sm text-primary hover:underline">← {T("salesOffer.list")}</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((tb) => (
          <Link key={tb} href={`/sales/offers/${offer.id}?tab=${tb}`}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${activeTab === tb ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {T(`salesOffer.tab.${tb}`)}
          </Link>
        ))}
      </div>

      {activeTab === "info" && (
        canManage
          ? <OfferInfoForm initial={initial} salesReps={salesReps} lmeOptions={lmeOptions} />
          : <ReadOnlyInfo offer={offer} tech={t} lmeLabel={lmeOptions.find((l) => l.id === t?.lmeRecordId)?.label} T={T} />
      )}
      {activeTab === "notes" && <OfferNotes offerId={offer.id} notes={noteItems} canManage={canManage} />}
      {activeTab === "docs" && (
        <AttachmentUploader entityType="SalesOffer" entityId={offer.id} label={T("salesOffer.docsLabel")} accept="image/png,image/jpeg,image/webp,application/pdf,.xlsx,.docx" isInternal={false} canEdit={canManage} enableDrop />
      )}
    </div>
  );
}

function ReadOnlyInfo({ offer, tech, lmeLabel, T }: { offer: { currency: string; totalAmount: string; reason: string | null }; tech: { manufacturer: string | null; type: string | null; power: string | null } | null; lmeLabel?: string; T: ReturnType<typeof translator> }) {
  return (
    <div className="space-y-2 rounded-md border p-4 text-sm">
      <p><span className="text-muted-foreground">{T("salesOffer.ro.amount")}:</span> {formatMoney(offer.totalAmount, offer.currency)}</p>
      <p><span className="text-muted-foreground">{T("salesOffer.ro.manufacturerTypePower")}:</span> {[tech?.manufacturer, tech?.type, tech?.power].filter(Boolean).join(" · ") || "—"}</p>
      <p><span className="text-muted-foreground">{T("salesOffer.ro.lmeRef")}:</span> {lmeLabel ?? "—"}</p>
      {offer.reason && <p><span className="text-muted-foreground">{T("salesOffer.ro.note")}:</span> {offer.reason}</p>}
      <p className="text-xs text-muted-foreground">{T("salesOffer.ro.permissionHint")}</p>
    </div>
  );
}
