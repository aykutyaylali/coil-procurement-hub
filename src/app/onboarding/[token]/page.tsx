import Image from "next/image";
import { loadOnboardingContext } from "@/domain/onboarding";
import { ThemeProvider } from "@/components/theme-provider";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Tedarikçi Kaydı / Supplier Onboarding" };

export default async function OnboardingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let ctx;
  try {
    ctx = await loadOnboardingContext(token);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bağlantı geçersiz.";
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="max-w-md rounded-lg border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">!</div>
          <h1 className="mb-2 text-lg font-semibold">Bağlantı Açılamadı</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="mt-4 text-xs text-muted-foreground">Lütfen satınalma ekibiyle iletişime geçin.</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
        <header className="border-b bg-white px-6 py-4 dark:bg-slate-900">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center rounded-md bg-white px-2 py-1 shadow-sm ring-1 ring-black/5">
                <Image src="/brand/coil-logo.png" alt="Coil" width={281} height={120} className="h-9 w-auto" priority />
              </span>
              <div className="hidden sm:block">
                <div className="text-base font-semibold">Tedarikçi Kayıt Portalı</div>
                <div className="text-sm text-muted-foreground">Coil Procurement Hub</div>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-medium">{ctx.code}</div>
              <div className="text-muted-foreground">Tedarikçi Onboarding</div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl p-6">
          <div className="mb-6 rounded-lg border bg-white p-5 dark:bg-slate-900">
            <h1 className="text-xl font-semibold">Hoş geldiniz, {ctx.legalName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tedarikçi olarak kaydınızı tamamlamak için aşağıdaki bilgileri doğrulayıp gönderin.
              Bu bağlantı size özeldir; paylaşmayınız.
            </p>
          </div>
          <OnboardingForm ctx={ctx} token={token} />
        </main>
        <footer className="py-8 text-center text-xs text-muted-foreground">
          Bu portal Coil Procurement Hub tarafından sağlanmaktadır. Bağlantı size özeldir; paylaşmayınız.
        </footer>
      </div>
    </ThemeProvider>
  );
}
