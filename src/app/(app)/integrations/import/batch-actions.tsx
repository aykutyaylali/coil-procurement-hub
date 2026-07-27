"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { rollbackBatch } from "./actions";

export function BatchActions({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function doRollback() {
    setBusy(true);
    const res = await rollbackBatch(batchId);
    setBusy(false);
    setConfirm(false);
    if (res.ok) router.refresh();
    else alert(res.error);
  }

  if (confirm) {
    return (
      <span className="inline-flex gap-1">
        <Button size="sm" variant="destructive" onClick={doRollback} disabled={busy}>{busy ? "..." : "Onayla"}</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirm(false)} disabled={busy}>VazgeÃ§</Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Geri Al</Button>
  );
}
