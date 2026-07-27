import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = { title: "Parola Sıfırlama" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Parola Sıfırlama</h1>
          <p className="text-sm text-muted-foreground">E-posta adresinizi girin; sıfırlama bağlantısı gönderelim.</p>
        </div>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">← Girişe dön</Link>
        </p>
      </div>
    </div>
  );
}
