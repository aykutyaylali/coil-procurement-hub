"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { reviseOffer } from "../../actions";

export function ReviseButton({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function revise() {
    if (busy) return;
    if (!confirm("Yeni revizyona geçilsin mi? Mevcut değerler zaman çizelgesine kaydedilir ve revizyon numarası artırılır.")) return;
    setBusy(true);
    const res = await reviseOffer(offerId);
    setBusy(false);
    if (res.ok) router.refresh();
  }
  return (
    <button onClick={revise} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60">
      <RefreshCw className="size-3.5" /> {busy ? "İşleniyor…" : "Revize Et"}
    </button>
  );
}
