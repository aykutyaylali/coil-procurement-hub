"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginState } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [showPw, setShowPw] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-posta</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              defaultValue={state.email}
              placeholder="ad.soyad@coilpartners.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Parola</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPw ? "text" : "password"} autoComplete="current-password" required className="pr-10" />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Parolayı gizle" : "Parolayı göster"}
                title={showPw ? "Gizle" : "Göster"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {state.mfaRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="token">Doğrulama Kodu (MFA)</Label>
              <Input
                id="token"
                name="token"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoFocus
              />
            </div>
          )}
          {state.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
          <div className="text-center">
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Parolamı unuttum
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
