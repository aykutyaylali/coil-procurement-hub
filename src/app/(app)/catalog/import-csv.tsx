"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";
import { importItemsCsv } from "./actions";

export function ImportCsv() {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(file: File) {
    setBusy(true); setMsg("");
    const text = await file.text();
    const res = await importItemsCsv(text);
    setBusy(false);
    if (!res.ok) setMsg(t("cat.import.error", { error: res.error }));
    else { setMsg(t("cat.import.result", { created: res.data.created, updated: res.data.updated, skipped: res.data.skipped })); router.refresh(); }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">
        {busy ? t("cat.import.importing") : t("cat.import.button")}
        <input type="file" accept=".csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      <span className="text-xs text-muted-foreground">{t("cat.import.format")}</span>
      {msg && <span className="text-xs text-success">{msg}</span>}
    </div>
  );
}
