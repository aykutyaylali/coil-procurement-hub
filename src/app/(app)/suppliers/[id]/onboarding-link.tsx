"use client";
import { useState } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateOnboardingLink } from "../actions";
import { useI18n } from "@/components/i18n-provider";

/**
 * Tedarikçiye self-servis onboarding bağlantısı üretir ve panoya kopyalatır.
 * Ham token yalnızca burada görünür (DB'de hash saklanır). Portal erişimi ayrı
 * kartta yönetilir (PortalAccessCard).
 */
export function OnboardingLinkCard({ supplierId, tokenActive }: { supplierId: string; tokenActive: boolean }) {
  const { t } = useI18n();
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
      setError(t("supp.onboarding.copyError"));
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="size-4" /> {t("supp.onboarding.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          {t("supp.onboarding.info")}
          {tokenActive && !url && ` ${t("supp.onboarding.activeExists")}`}
        </p>
        {url ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input readOnly value={url} className="flex-1 rounded border bg-muted/40 px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("supp.onboarding.expiry", { n: expiresAt })}</p>
          </div>
        ) : (
          <Button type="button" size="sm" onClick={generate} disabled={busy}>
            {busy ? t("supp.onboarding.generating") : tokenActive ? t("supp.onboarding.regenerate") : t("supp.onboarding.generate")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
