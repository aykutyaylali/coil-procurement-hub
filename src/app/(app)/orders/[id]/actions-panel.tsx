"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { submitOrderForApproval, confirmOrderDirect, decideOrder, sendOrderToSupplier } from "../actions";

export function OrderActionsPanel({
  id,
  status,
  canDecide,
  canSend,
  canApprove,
}: {
  id: string;
  status: string;
  canDecide: boolean;
  canSend: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Hata");
    else router.refresh();
    return res;
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="rounded bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}

      {status === "DRAFT" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Yönetim onayı opsiyoneldir. İsterseniz doğrudan onaylayıp tedarikçiye gönderebilir, dilerseniz önce yönetim onayına gönderebilirsiniz.
          </p>
          {canApprove && (
            <Button className="w-full" disabled={busy} onClick={() => run(() => confirmOrderDirect(id))}>
              Doğrudan Onayla (onaysız)
            </Button>
          )}
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => run(() => submitOrderForApproval(id))}>
            Yönetim Onayına Gönder
          </Button>
        </div>
      )}

      {canDecide && status === "PENDING_APPROVAL" && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Onay Kararı</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (ret için zorunlu)" className="min-h-[56px]" />
          <div className="flex gap-2">
            <Button size="sm" variant="success" disabled={busy} onClick={() => run(() => decideOrder({ id, action: "APPROVE", note: note || undefined }))}>
              Onayla
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (!note.trim()) return setError("Ret için not girin.");
                return run(() => decideOrder({ id, action: "REJECT", note }));
              }}
            >
              Reddet
            </Button>
          </div>
        </div>
      )}

      {canSend && status === "APPROVED" && (
        <Button
          className="w-full"
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            const res = await run(() => sendOrderToSupplier(id));
            if (res.ok) setMsg("Sipariş tedarikçiye gönderildi.");
          }}
        >
          Tedarikçiye Gönder
        </Button>
      )}
    </div>
  );
}
