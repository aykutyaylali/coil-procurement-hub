import { redirect } from "next/navigation";
import { requireUser, userCan } from "@/lib/auth/context";
import { PERMISSIONS } from "@/lib/rbac";
import Image from "next/image";
import { loadBidContextForPreview } from "@/domain/bidding";
import { BidForm } from "@/app/teklif/[token]/bid-form";
import { formatDateTime } from "@/lib/dates";
import { ThemeProvider } from "@/components/theme-provider";
import { opLabel } from "@/domain/operations";
import Link from "next/link";

export const metadata = { title: "Teklif Sayfası Önizleme" };

/**
 * SATINALMA için tedarikçi teklif sayfasının ÖNİZLEMESİ (kontrol amaçlı).
 * Tedarikçinin göreceği sayfanın aynısını gösterir; token gerektirmez, hiçbir
 * durum değişmez, teklif gönderilemez.
 */
export default async function BidPreviewPage({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = await params;
  const user = await requireUser();
  if (!userCan(user, PERMISSIONS.RFQ_VIEW)) redirect("/dashboard");

  let ctx;
  try {
    ctx = await loadBidContextForPreview(rfqId, user.tenantId);
  } catch {
    redirect(`/rfqs/${rfqId}`);
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <div className="bg-amber-500 px-6 py-2 text-center text-sm font-medium text-amber-950">
          ÖNİZLEME — Bu, tedarikçinin gördüğü teklif sayfasıdır. Gönderim kapalıdır.
          <Link href={`/rfqs/${rfqId}`} className="ml-3 underline">RFQ&apos;ya dön</Link>
        </div>
        <header className="border-b bg-white px-6 py-4 dark:bg-slate-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                <Image src="/brand/coil-logo.png" alt={ctx.companyName} width={281} height={120} className="h-9 w-auto" priority />
              </span>
              <div className="hidden sm:block">
                <div className="text-base font-semibold">{ctx.companyName}</div>
                <div className="text-sm text-muted-foreground">Tedarikçi Teklif Portalı · {opLabel(ctx.operationType, "tr")}</div>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-medium">{ctx.rfqNumber}</div>
              <div className="text-muted-foreground">Son Tarih: {ctx.dueAt ? formatDateTime(ctx.dueAt) : "-"}</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl p-6">
          <div className="mb-6 rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h1 className="text-xl font-semibold">{ctx.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sayın {ctx.supplierName}, aşağıdaki kalemler için teklifinizi iletebilirsiniz.
            </p>
            {ctx.description && <p className="mt-2 text-sm">{ctx.description}</p>}
          </div>
          <BidForm ctx={ctx} token="preview" locale="tr" preview />
        </main>
        <footer className="py-8 text-center text-xs text-muted-foreground">
          Bu portal Coil Procurement Hub tarafından sağlanmaktadır.
        </footer>
      </div>
    </ThemeProvider>
  );
}
