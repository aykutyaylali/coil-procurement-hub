"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitOnboardingAction } from "./actions";
import type { OnboardingContext } from "@/domain/onboarding";

const COUNTRIES = ["TR", "DE", "IT", "CN", "US", "GB", "FR", "ES", "NL", "PL"];

export function OnboardingForm({ ctx, token }: { ctx: OnboardingContext; token: string }) {
  const [f, setF] = useState({
    legalName: ctx.legalName,
    taxOffice: ctx.taxOffice ?? "",
    taxNumber: ctx.taxNumber ?? "",
    country: ctx.country || "TR",
    addressLine: ctx.addressLine ?? "",
    city: ctx.city ?? "",
    website: ctx.website ?? "",
    contactName: ctx.contactName,
    contactEmail: ctx.contactEmail,
    contactPhone: ctx.contactPhone,
    bankName: ctx.bankName,
    iban: ctx.iban,
    swiftBic: ctx.swiftBic,
    accountHolder: ctx.accountHolder,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function up(patch: Partial<typeof f>) {
    setF((p) => ({ ...p, ...patch }));
  }

  async function submit() {
    setBusy(true);
    setError("");
    const res = await submitOnboardingAction(token, f);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-success/15 text-2xl text-success">✓</div>
          <h2 className="text-lg font-semibold">Bilgileriniz alındı</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kayıt bilgileriniz satınalma ekibine iletildi. Onay sonrası tedarikçi olarak aktif edileceksiniz.
            Banka bilgileriniz güvenlik gereği çift onaydan geçirilir.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Bu sayfayı kapatabilirsiniz.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle>Şirket & Vergi Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Yasal Ünvan *</Label>
            <Input value={f.legalName} onChange={(e) => up({ legalName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Vergi Dairesi</Label>
            <Input value={f.taxOffice} onChange={(e) => up({ taxOffice: e.target.value })} placeholder="Örn: Kadıköy VD" />
          </div>
          <div className="space-y-1.5">
            <Label>Vergi / Kimlik No *</Label>
            <Input value={f.taxNumber} onChange={(e) => up({ taxNumber: e.target.value })} placeholder="VKN / VAT" />
          </div>
          <div className="space-y-1.5">
            <Label>Ülke *</Label>
            <Select value={f.country} onChange={(e) => up({ country: e.target.value })}>
              {[...new Set([f.country, ...COUNTRIES])].map((c) => (<option key={c} value={c}>{c}</option>))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Şehir</Label>
            <Input value={f.city} onChange={(e) => up({ city: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Adres</Label>
            <Textarea value={f.addressLine} onChange={(e) => up({ addressLine: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Web Sitesi</Label>
            <Input value={f.website} onChange={(e) => up({ website: e.target.value })} placeholder="https://" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>İletişim Kişisi</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Ad Soyad *</Label>
            <Input value={f.contactName} onChange={(e) => up({ contactName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>E-posta *</Label>
            <Input type="email" value={f.contactEmail} onChange={(e) => up({ contactEmail: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input value={f.contactPhone} onChange={(e) => up({ contactPhone: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Banka Bilgileri</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Banka Adı *</Label>
            <Input value={f.bankName} onChange={(e) => up({ bankName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Hesap Sahibi</Label>
            <Input value={f.accountHolder} onChange={(e) => up({ accountHolder: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>IBAN *</Label>
            <Input value={f.iban} onChange={(e) => up({ iban: e.target.value })} placeholder="TR.. / DE.." />
          </div>
          <div className="space-y-1.5">
            <Label>SWIFT / BIC</Label>
            <Input value={f.swiftBic} onChange={(e) => up({ swiftBic: e.target.value })} placeholder="Yurt dışı için" />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Banka bilgileri güvenlik gereği satınalma tarafında <b>çift onaydan</b> geçirilir.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy}>
          {busy ? "Gönderiliyor…" : "Bilgileri Gönder"}
        </Button>
      </div>
    </div>
  );
}
