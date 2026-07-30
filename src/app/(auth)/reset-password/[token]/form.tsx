"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { setPasswordWithToken } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (busy) return;
    if (pw.length < 8) { setError(t("setpw.tooShort")); return; }
    if (pw !== confirm) { setError(t("setpw.mismatch")); return; }
    setBusy(true);
    setError("");
    const res = await setPasswordWithToken(token, pw);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-success/15 text-2xl text-success">✓</div>
        <p className="text-sm text-muted-foreground">{t("setpw.done")}</p>
        <Link href="/login" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{t("setpw.goLogin")}</Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("setpw.intro")}</p>
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="space-y-1.5">
        <Label>{t("setpw.password")}</Label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label>{t("setpw.confirm")}</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <Button className="w-full" onClick={submit} disabled={busy}>
        {busy ? t("setpw.saving") : t("setpw.submit")}
      </Button>
    </div>
  );
}
