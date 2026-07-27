"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { approveInvoiceException, updateInvoiceStatus } from "../actions";

export function InvoiceActions({ id, status, canApprove }: { id: string; status: string; canApprove: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true); setError("");
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Hata"); else router.refresh();
  }

  if (!canApprove) return null;

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {status === "BLOCKED" && (
        <div className="space-y-2 rounded-md border border-destructive/30 p-3">
          <p className="text-sm font-medium text-destructive">Bloke fatura — istisna onayı</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="İstisna gerekçesi (zorunlu)" className="min-h-[56px]" />
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => { if (!note.trim()) return setError("Gerekçe zorunlu."); return run(() => approveInvoiceException({ id, note })); }}>
            İstisna Onayla
          </Button>
        </div>
      )}
      {status === "MATCHED" && (
        <Button className="w-full" variant="success" disabled={busy} onClick={() => run(() => updateInvoiceStatus({ id, action: "APPROVE" }))}>Ödeme Onayla</Button>
      )}
      {status === "APPROVED" && (
        <Button className="w-full" disabled={busy} onClick={() => run(() => updateInvoiceStatus({ id, action: "PAY" }))}>Ödendi İşaretle</Button>
      )}
    </div>
  );
}
