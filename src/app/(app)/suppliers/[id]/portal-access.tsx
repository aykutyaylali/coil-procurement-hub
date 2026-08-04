"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check, UserPlus, Power, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invitePortalUser, setPortalAccessActive } from "../actions";
import { useI18n } from "@/components/i18n-provider";

export type PortalStatus = "NONE" | "INVITED" | "ACTIVE" | "PASSIVE";

/**
 * Tedarikçi (cari) sayfasında portal erişim yönetimi. Kalıcı davet bağlantısı
 * burada görüntülenir/kopyalanır; admin "Pasife Al" diyene kadar geçerlidir.
 */
export function PortalAccessCard({
  supplierId,
  email,
  status,
  inviteUrl,
}: {
  supplierId: string;
  email: string | null;
  status: PortalStatus;
  inviteUrl: string | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [freshUrl, setFreshUrl] = useState("");

  const url = freshUrl || inviteUrl || "";

  async function invite() {
    setBusy("invite");
    setError("");
    const res = await invitePortalUser(supplierId);
    setBusy("");
    if (!res.ok) return setError(res.error);
    setFreshUrl(res.data.url);
    router.refresh();
  }

  async function toggle(active: boolean) {
    setBusy(active ? "activate" : "revoke");
    setError("");
    const res = await setPortalAccessActive(supplierId, active);
    setBusy("");
    if (!res.ok) return setError(res.error);
    if (!active) setFreshUrl("");
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("supp.portal.copyError"));
    }
  }

  const badge =
    status === "ACTIVE" ? <Badge tone="success">{t("supp.portal.badge.active")}</Badge>
    : status === "INVITED" ? <Badge tone="warning">{t("supp.portal.badge.invited")}</Badge>
    : status === "PASSIVE" ? <Badge tone="default">{t("supp.portal.badge.passive")}</Badge>
    : <Badge tone="default">{t("supp.portal.badge.none")}</Badge>;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> {t("supp.portal.title")}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}

        {/* Giriş bilgileri */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("supp.portal.statusLabel")}</span>
            {badge}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("supp.portal.loginEmail")}</span>
            <span className="font-mono text-xs">{email ?? "—"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("supp.portal.passwordNote")}
            {" "}{t("supp.portal.loginPath")}: <span className="font-mono">/login</span>
          </p>
        </div>

        {status === "NONE" && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {email ? t("supp.portal.none.hasEmail") : t("supp.portal.none.noEmail")}
            </p>
            <Button type="button" size="sm" onClick={invite} disabled={!email || busy === "invite"}>
              <UserPlus className="mr-1.5 size-3.5" /> {busy === "invite" ? t("supp.portal.generating") : t("supp.portal.inviteUser")}
            </Button>
          </div>
        )}

        {(status === "INVITED" || status === "ACTIVE") && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium">{t("supp.portal.inviteLink")}</p>
            {url ? (
              <>
                <div className="flex items-center gap-2">
                  <input readOnly value={url} className="flex-1 rounded border bg-muted/40 px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" size="sm" variant="outline" onClick={copy}>
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("supp.portal.linkNote")}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{t("supp.portal.linkHidden")}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" variant="outline" onClick={invite} disabled={busy === "invite"}>
                <RefreshCw className="mr-1.5 size-3.5" /> {busy === "invite" ? "…" : t("supp.portal.refreshLink")}
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => toggle(false)} disabled={busy === "revoke"}>
                <Power className="mr-1.5 size-3.5" /> {busy === "revoke" ? "…" : t("supp.portal.deactivate")}
              </Button>
            </div>
          </div>
        )}

        {status === "PASSIVE" && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">{t("supp.portal.passiveNote")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => toggle(true)} disabled={busy === "activate"}>
                <Power className="mr-1.5 size-3.5" /> {busy === "activate" ? "…" : t("supp.portal.reactivate")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={invite} disabled={busy === "invite"}>
                <RefreshCw className="mr-1.5 size-3.5" /> {busy === "invite" ? "…" : t("supp.portal.newInvite")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
