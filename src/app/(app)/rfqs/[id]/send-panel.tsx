"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { sendRfqToSuppliers, sendRfqReminders, cancelRfq } from "../actions";

export function SendPanel({
  rfqId,
  status,
  suppliers,
  invited,
  dueAt,
}: {
  rfqId: string;
  status: string;
  suppliers: { id: string; name: string }[];
  invited: { id: string; name: string; status: string; remindersSent: number }[];
  dueAt: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [due, setDue] = useState(dueAt ? dueAt.slice(0, 16) : "");
  const [sealed, setSealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const invitedIds = new Set(invited.map((i) => i.id));
  const q = query.trim().toLocaleLowerCase("tr-TR");
  const available = suppliers
    .filter((s) => !invitedIds.has(s.id))
    .filter((s) => !q || s.name.toLocaleLowerCase("tr-TR").includes(q));

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function send() {
    if (selected.length === 0) {
      setError("En az bir tedarikçi seçin.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    const res = await sendRfqToSuppliers({
      rfqId,
      supplierIds: selected,
      dueAt: due || undefined,
      sealed,
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setMsg(`${res.data.sent} tedarikçiye teklif daveti gönderildi.`);
      setSelected([]);
      router.refresh();
    }
  }

  async function remind() {
    setBusy(true);
    setError("");
    const res = await sendRfqReminders(rfqId);
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setMsg(`${res.data.sent} hatırlatma gönderildi.`);
      router.refresh();
    }
  }

  async function cancel() {
    if (!confirm("Bu RFQ iptal edilecek ve kalemler yeniden açılacak. Onaylıyor musunuz?")) return;
    setBusy(true);
    setError("");
    const res = await cancelRfq(rfqId);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push("/rfqs");
  }

  const canSend = ["DRAFT", "APPROVED", "SENT", "OPEN"].includes(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tedarikçilere Gönder</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canSend ? (
          <>
            <div className="space-y-1.5">
              <Label>Son Teklif Tarihi</Label>
              <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} />
              Kapalı teklif usulü (fiyatlar son tarihe kadar gizli)
            </label>
            <Input
              placeholder="Tedarikçi ara… (isimle)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
              {available.length === 0 && (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  {query ? "Aramayla eşleşen tedarikçi yok." : "Davet edilebilecek tedarikçi yok."}
                </p>
              )}
              {available.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                  <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                  {s.name}
                </label>
              ))}
            </div>
            <Button onClick={send} disabled={busy} className="w-full">
              {busy ? "Gönderiliyor..." : `Seçili ${selected.length} tedarikçiye gönder`}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Bu aşamada yeni davet gönderilemez.</p>
        )}

        {invited.some((i) => ["INVITED", "VIEWED"].includes(i.status)) && (
          <Button variant="outline" onClick={remind} disabled={busy} className="w-full">
            Yanıt vermeyenlere hatırlat
          </Button>
        )}

        {["DRAFT", "OPEN"].includes(status) && invited.length === 0 && (
          <Button variant="ghost" onClick={cancel} disabled={busy} className="w-full text-destructive hover:bg-destructive/10">
            RFQ&apos;yu İptal Et (kalemleri yeniden aç)
          </Button>
        )}

        {msg && <p className="rounded bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}
        {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {invited.length > 0 && (
          <div className="space-y-1 border-t pt-2">
            {invited.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-xs">
                <span>{i.name}</span>
                <StatusBadge status={i.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
