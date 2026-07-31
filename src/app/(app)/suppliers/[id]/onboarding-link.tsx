"use client";
import { useState } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateOnboardingLink } from "../actions";

/**
 * Tedarikçiye self-servis onboarding bağlantısı üretir ve panoya kopyalatır.
 * Ham token yalnızca burada görünür (DB'de hash saklanır). Portal erişimi ayrı
 * kartta yönetilir (PortalAccessCard).
 */
export function OnboardingLinkCard({ supplierId, tokenActive }: { supplierId: string; tokenActive: boolean }) {
  const [url, setUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError("");
    const res = await generateOnboardingLink(supplierId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUrl(res.data.url);
    setExpiresAt(new Date(res.data.expiresAt).toLocaleDateString("tr-TR"));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Kopyalanamadı; linki elle seçip kopyalayın.");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="size-4" /> Onboarding Bağlantısı</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Tedarikçi bu güvenli bağlantıyla şirket/vergi/iletişim/banka bilgilerini kendisi doldurur (14 gün geçerli, tek kullanımlık).
          {tokenActive && !url && " Aktif bir bağlantı mevcut; yenilemek için tekrar üretin."}
        </p>
        {url ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input readOnly value={url} className="flex-1 rounded border bg-muted/40 px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Son geçerlilik: {expiresAt}. Bu linki tedarikçiye iletin.</p>
          </div>
        ) : (
          <Button type="button" size="sm" onClick={generate} disabled={busy}>
            {busy ? "Üretiliyor…" : tokenActive ? "Yeni Bağlantı Üret" : "Onboarding Bağlantısı Oluştur"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
