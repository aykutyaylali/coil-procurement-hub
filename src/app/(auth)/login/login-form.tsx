"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "../actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const initial: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

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
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
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
            <a href="/forgot-password" className="text-xs text-primary hover:underline">
              Parolamı unuttum
            </a>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
