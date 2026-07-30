import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bell } from "lucide-react";
import { getCurrentUser, isSupplierUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/ui/toast";
import { isLocale, DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n";
import { logoutAction } from "@/app/(auth)/actions";

/**
 * Tedarikçi portalı kabuğu (Master §5). YALNIZ tedarikçi kullanıcıları erişebilir;
 * iç kullanıcılar dashboard'a yönlendirilir. Tüm veri forSupplier izolasyonuyla gelir.
 */
export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isSupplierUser(user)) redirect("/dashboard");

  const [supplier, unread] = await Promise.all([
    user.supplierId ? prisma.supplier.findUnique({ where: { id: user.supplierId }, select: { legalName: true } }) : Promise.resolve(null),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  const locale: Locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const T = translator(locale);

  return (
    <I18nProvider locale={locale}>
      <ToastProvider>
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
          <header className="border-b bg-white px-6 py-3 dark:bg-slate-900">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                  <Image src="/brand/coil-logo.png" alt="Coil" width={281} height={120} className="h-8 w-auto" priority />
                </span>
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold">{T("portal.title")}</div>
                  <div className="text-xs text-muted-foreground">{supplier?.legalName ?? user.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Link href="/portal/notifications" className="relative text-muted-foreground hover:text-foreground" title={T("portal.notifications")}>
                  <Bell className="size-5" />
                  {unread > 0 && (
                    <span className="absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">{unread}</span>
                  )}
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="text-sm text-primary hover:underline">{T("action.logout")}</button>
                </form>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl p-6">{children}</main>
        </div>
      </ToastProvider>
    </I18nProvider>
  );
}
