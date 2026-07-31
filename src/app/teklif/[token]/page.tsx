import Image from "next/image";
import { loadBidContext } from "@/domain/bidding";
import { BidForm } from "./bid-form";
import { formatDateTime } from "@/lib/dates";
import { ThemeProvider } from "@/components/theme-provider";
import { opLabel } from "@/domain/operations";

import Link from "next/link";
import { isLocale, type Locale } from "@/lib/i18n";

export const metadata = { title: "Teklif Ver / Submit Quotation" };

const P = {
  tr: {
    portal: "Tedarikçi Teklif Portalı",
    dueDate: "Son Tarih",
    intro: "aşağıdaki kalemler için teklifinizi iletebilirsiniz.",
    dear: "Sayın",
    expired:
      "Bu teklif talebinin son tarihi geçmiştir. Teklif gönderimi kapalıdır. Bilgi için satınalma ekibiyle iletişime geçebilirsiniz.",
    linkError: "Bağlantı Açılamadı",
    contact: "Lütfen satınalma ekibiyle iletişime geçin.",
    footer: "Bu portal Coil Procurement Hub tarafından sağlanmaktadır. Bağlantı size özeldir; paylaşmayınız.",
  },
  en: {
    portal: "Supplier Quotation Portal",
    dueDate: "Deadline",
    intro: "you may submit your quotation for the items below.",
    dear: "Dear",
    expired:
      "The deadline for this RFQ has passed. Quotation submission is closed. Please contact the procurement team.",
    linkError: "Link Could Not Be Opened",
    contact: "Please contact the procurement team.",
    footer: "This portal is provided by Coil Procurement Hub. The link is unique to you; do not share it.",
  },
};

export default async function BidPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  let ctx;
  try {
    ctx = await loadBidContext(token);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bağlantı geçersiz.";
    const l: Locale = isLocale(sp.lang) ? sp.lang : "tr";
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            !
          </div>
          <h1 className="mb-2 text-lg font-semibold">{P[l].linkError}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="mt-4 text-xs text-muted-foreground">{P[l].contact}</p>
        </div>
      </div>
    );
  }

  // Dil: URL ?lang > tedarikçi tercihi > tr
  const locale: Locale = isLocale(sp.lang) ? sp.lang : isLocale(ctx.supplierLanguage) ? ctx.supplierLanguage : "tr";
  const tp = P[locale];

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <header className="border-b bg-white px-6 py-4 dark:bg-slate-900">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                <Image src="/brand/coil-logo.png" alt={ctx.companyName} width={281} height={120} className="h-9 w-auto" priority />
              </span>
              <div className="hidden sm:block">
                <div className="text-base font-semibold">{ctx.companyName}</div>
                <div className="text-sm text-muted-foreground">{tp.portal} · {opLabel(ctx.operationType, locale)}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <div className="font-medium">{ctx.rfqNumber}</div>
                <div className="text-muted-foreground">
                  {tp.dueDate}: {ctx.dueAt ? formatDateTime(ctx.dueAt) : "-"}
                </div>
              </div>
              <div className="flex overflow-hidden rounded-md border text-xs">
                <Link
                  href={`/teklif/${token}?lang=tr`}
                  className={`px-2 py-1 ${locale === "tr" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  TR
                </Link>
                <Link
                  href={`/teklif/${token}?lang=en`}
                  className={`px-2 py-1 ${locale === "en" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  EN
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-5xl p-6">
          <div className="mb-6 rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h1 className="text-xl font-semibold">{ctx.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tp.dear} {ctx.supplierName}, {tp.intro}
            </p>
            {ctx.description && <p className="mt-2 text-sm">{ctx.description}</p>}
          </div>

          {ctx.isExpired ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">{tp.expired}</div>
          ) : (
            <BidForm ctx={ctx} token={token} locale={locale} />
          )}
        </main>
        <footer className="py-8 text-center text-xs text-muted-foreground">{tp.footer}</footer>
      </div>
    </ThemeProvider>
  );
}
