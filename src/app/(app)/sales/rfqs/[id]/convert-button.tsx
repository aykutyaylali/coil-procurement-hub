"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { createOfferFromRfq } from "../../actions";

export function ConvertToOfferButton({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function convert() {
    if (busy) return;
    setBusy(true); setError("");
    const res = await createOfferFromRfq(rfqId);
    if (!res.ok) { setBusy(false); setError(res.error); return; }
    router.push(`/sales/offers/${res.data.id}`);
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={convert} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60">
        {busy ? t("salesRfq.convert.busy") : t("salesRfq.convert.label")}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
