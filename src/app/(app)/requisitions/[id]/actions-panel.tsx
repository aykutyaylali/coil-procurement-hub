"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { submitRequisition, decideRequisition } from "../actions";
import { createRfqFromRequisition } from "@/app/(app)/rfqs/actions";

export function RequisitionActionsPanel({
  id,
  status,
  canSubmit,
  canDecide,
  canCreateRfq,
}: {
  id: string;
  status: string;
  canSubmit: boolean;
  canDecide: boolean;
  canCreateRfq: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doSubmit() {
    setBusy(true);
    setError("");
    const res = await submitRequisition(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function doDecide(action: "APPROVE" | "REJECT" | "REQUEST_CHANGE") {
    if (action !== "APPROVE" && !note.trim()) {
      setError("Lütfen bir açıklama/gerekçe girin.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await decideRequisition({ id, action, note: note || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNote("");
      router.refresh();
    }
  }

  async function doCreateRfq() {
    setBusy(true);
    setError("");
    const res = await createRfqFromRequisition(id);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.push(`/rfqs/${res.data.id}`);
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {canSubmit && status === "DRAFT" && (
        <Button onClick={doSubmit} disabled={busy} className="w-full">
          Onaya Gönder
        </Button>
      )}

      {canDecide && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Onay Kararınız</p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Karar notu (ret ve düzeltme için zorunlu)"
            className="min-h-[60px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="success" size="sm" onClick={() => doDecide("APPROVE")} disabled={busy}>
              Onayla
            </Button>
            <Button variant="destructive" size="sm" onClick={() => doDecide("REJECT")} disabled={busy}>
              Reddet
            </Button>
            <Button variant="outline" size="sm" onClick={() => doDecide("REQUEST_CHANGE")} disabled={busy}>
              Düzeltme İste
            </Button>
          </div>
        </div>
      )}

      {canCreateRfq && status === "APPROVED" && (
        <Button onClick={doCreateRfq} disabled={busy} variant="secondary" className="w-full">
          Teklif Talebi (RFQ) Oluştur
        </Button>
      )}
    </div>
  );
}
