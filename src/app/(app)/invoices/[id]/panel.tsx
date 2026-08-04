"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { approveInvoiceException, updateInvoiceStatus } from "../actions";
import { useI18n } from "@/components/i18n-provider";

export function InvoiceActions({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError("");
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? t("inv.error")); else router.refresh();
  }

  if (!canApprove) return null;

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {status === "BLOCKED" && (
        <div className="space-y-2 rounded-md border border-destructive/30 p-3">
          <p className="text-sm font-medium text-destructive">{t("inv.exception.heading")}</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("inv.exception.placeholder")} className="min-h-[56px]" />
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (!note.trim()) return setError(t("inv.exception.required")); return run(() => approveInvoiceException({ id, note })); }}>
            {t("inv.exception.approve")}
          </Button>
        </div>
      )}
      {status === "MATCHED" && (
        <Button className="w-full" variant="success" disabled={busy} onClick={() => run(() => updateInvoiceStatus({ id, action: "APPROVE" }))}>{t("inv.approvePayment")}</Button>
      )}
      {status === "APPROVED" && (
        <Button className="w-full" disabled={busy} onClick={() => run(() => updateInvoiceStatus({ id, action: "PAY" }))}>{t("inv.markPaid")}</Button>
      )}
    </div>
  );
}
