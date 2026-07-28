import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import { loadBidContextForBuyer } from "@/domain/bidding";
import { BidForm } from "@/app/teklif/[token]/bid-form";
import { PageHeader } from "@/components/shell/page-header";
import { formatDateTime } from "@/lib/dates";
import { opLabel } from "@/domain/operations";
import { StatusBadge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Tedarikçi Adına Teklif Gir" };

/**
 * SATINALMA, tedarikçi ADINA teklif girer/düzeltir (e-posta/telefonla gelen
 * teklifi işler veya tedarikçinin hatasını düzeltir). Bu sayfa hep erişilebilir.
 */
export default async function BuyerBidPage({ params }: { params: Promise<{ id: string; rfqSupplierId: string }> }) {
  const { id, rfqSupplierId } = await params;
  const user = await requireUser();
  if (!userCan(user, PERMISSIONS.RFQ_EVALUATE)) redirect(`/rfqs/${id}`);

  let ctx;
  try {
    ctx = await loadBidContextForBuyer(rfqSupplierId, user.tenantId);
  } catch {
    notFound();
  }
  if (ctx.rfqId !== id) redirect(`/rfqs/${ctx.rfqId}/teklif-gir/${rfqSupplierId}`);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Tedarikçi Adına Teklif — ${ctx.supplierName}`}
        description={`${ctx.rfqNumber} · ${opLabel(ctx.operationType, "tr")} · Son tarih: ${ctx.dueAt ? formatDateTime(ctx.dueAt) : "-"}`}
      />
      <div className="mb-4 flex items-center justify-between rounded-md border border-sky-500/30 bg-sky-50 px-4 py-3 text-sm dark:bg-sky-950/40">
        <span>
          Bu ekranda tedarikçi adına teklif girip/düzenleyebilirsiniz (e-posta/telefonla gelen teklif ya da düzeltme).
          Tedarikçi davet durumu: <StatusBadge status={ctx.supplierInvitedStatus} />
        </span>
        <Link href={`/rfqs/${id}`} className="shrink-0 text-primary hover:underline">← RFQ&apos;ya dön</Link>
      </div>
      <BidForm ctx={ctx} token="" locale="tr" buyerRfqSupplierId={rfqSupplierId} />
    </div>
  );
}
