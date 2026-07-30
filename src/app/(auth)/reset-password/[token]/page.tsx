import Image from "next/image";
import { I18nProvider } from "@/components/i18n-provider";
import { isLocale, DEFAULT_LOCALE, translator, type Locale } from "@/lib/i18n";
import { SetPasswordForm } from "./form";

export const metadata = { title: "Parola Belirle / Set Password" };

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const locale: Locale = isLocale(sp.lang) ? sp.lang : DEFAULT_LOCALE;
  const T = translator(locale);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm dark:bg-slate-900">
        <div className="mb-4 flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5 w-fit">
          <Image src="/brand/coil-logo.png" alt="Coil" width={281} height={120} className="h-8 w-auto" priority />
        </div>
        <h1 className="mb-3 text-lg font-semibold">{T("setpw.title")}</h1>
        <I18nProvider locale={locale}>
          <SetPasswordForm token={token} />
        </I18nProvider>
      </div>
    </div>
  );
}
