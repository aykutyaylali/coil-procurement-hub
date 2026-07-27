import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            C
          </div>
          <h1 className="text-xl font-semibold">Coil Procurement Hub</h1>
          <p className="text-sm text-muted-foreground">Satınalma ve Tedarikçi Yönetim Platformu</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Demo giriş bilgileri için README dosyasına bakınız.
        </p>
      </div>
    </div>
  );
}
