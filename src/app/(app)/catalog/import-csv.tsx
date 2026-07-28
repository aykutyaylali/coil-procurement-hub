"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { importItemsCsv } from "./actions";

export function ImportCsv() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(file: File) {
    setBusy(true); setMsg("");
    const text = await file.text();
    const res = await importItemsCsv(text);
    setBusy(false);
    if (!res.ok) setMsg(`Hata: ${res.error}`);
    else { setMsg(`${res.data.created} yeni, ${res.data.updated} güncel, ${res.data.skipped} atlandı.`); router.refresh(); }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent">
        {busy ? "İçe aktarılıyor..." : "CSV İçe Aktar"}
        <input type="file" accept=".csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      <span className="text-xs text-muted-foreground">Format: kod;ad;kategori;marka;birim;gtip;fiyat</span>
      {msg && <span className="text-xs text-success">{msg}</span>}
    </div>
  );
}
