"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        {done ? (
          <p className="rounded-md bg-success/10 px-3 py-3 text-sm text-success">
            Eğer bu e-posta sistemde kayıtlıysa, sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
          </p>
        ) : (
          <form
            action={async (fd) => {
              setBusy(true);
              await requestPasswordReset(fd);
              setBusy(false);
              setDone(true);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" name="email" type="email" required placeholder="ad.soyad@coilpartners.com" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
