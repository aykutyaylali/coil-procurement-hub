"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { submitRequisition, decideRequisition, takeRequisitionIntoProcess, deleteRequisition } from "../actions";

export function RequisitionActionsPanel({
  id,
  status,
  canSubmit,
  canDecide,
  canCreateRfq,
  canAssign,
  canEdit,
  canDelete,
}: {
  id: string;
  status: string;
  canSubmit: boolean;
  canDecide: boolean;
  canCreateRfq: boolean;
  canAssign: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function doSubmit() {
    if (busy) return;
    setBusy(true);
    setError("");
    setFields({});
    const res = await submitRequisition(id);
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      setFields(res.fields ?? {});
      toast({ type: "error", title: res.fields ? "Talep gönderilemedi." : "İşlem başarısız.", description: res.error });
      return;
    }
    toast({ type: "success", title: res.data.status === "PENDING_APPROVAL" ? "Talep onaya gönderildi." : "Talep gönderildi." });
    router.refresh();
  }

  async function doDelete() {
    if (!confirm("Bu talep kalıcı olarak silinecek. Onaylıyor musunuz?")) return;
    if (busy) return;
    setBusy(true); setError("");
    const res = await deleteRequisition(id);
    setBusy(false);
    if (!res.ok) { setError(res.error); toast({ type: "error", title: "Talep silinemedi.", description: res.error }); return; }
    toast({ type: "success", title: "Talep silindi." });
    router.push("/requisitions");
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

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">{error}</p>
          {Object.keys(fields).length > 0 && (
            <ul className="mt-1 list-inside list-disc text-destructive/90">
              {Object.entries(fields).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canSubmit && status === "DRAFT" && (
        <Button onClick={doSubmit} disabled={busy} className="w-full">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {busy ? "Gönderiliyor…" : "Gönder"}
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

      {canAssign && status === "APPROVED" && (
        <Button
          className="w-full"
          onClick={async () => {
            if (busy) return;
            setBusy(true); setError("");
            const res = await takeRequisitionIntoProcess(id);
            setBusy(false);
            if (!res.ok) { setError(res.error); toast({ type: "error", title: "İşleme alınamadı.", description: res.error }); return; }
            toast({ type: "success", title: "Talep işleme alındı.", description: "Durum: Satınalma İşleme Aldı." });
            router.refresh();
          }}
          disabled={busy}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Satınalma İşleme Al
        </Button>
      )}

      {canCreateRfq && (status === "APPROVED" || status === "ASSIGNED" || status === "IN_RFQ") && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Teklif talebi (RFQ) oluşturmak için soldaki <b>Talep Kalemleri</b> bölümünden kalemleri seçin.
          Farklı tedarikçiler için kalemleri ayrı ayrı seçip birden fazla RFQ oluşturabilirsiniz.
        </p>
      )}

      {(canEdit || canDelete) && (
        <div className="flex gap-2 border-t pt-3">
          {canEdit && (
            <Button variant="outline" className="flex-1" onClick={() => router.push(`/requisitions/${id}/edit`)} disabled={busy}>
              <Pencil className="size-4" /> Düzelt
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" className="flex-1 text-destructive hover:bg-destructive/10" onClick={doDelete} disabled={busy}>
              <Trash2 className="size-4" /> Sil
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
