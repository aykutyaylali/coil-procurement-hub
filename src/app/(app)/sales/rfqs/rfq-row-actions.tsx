"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { setSalesRfqStatus, deleteSalesRfq } from "../actions";
import { RFQ_STATUS, RFQ_STATUS_LABEL } from "./status";

export { RFQ_STATUS, RFQ_STATUS_LABEL };

export function SalesRfqRowActions({ id, status, canManage }: { id: string; status: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(s: string) { setBusy(true); const r = await setSalesRfqStatus(id, s); setBusy(false); if (r.ok) router.refresh(); }
  async function del() { if (!confirm("Bu talep silinsin mi?")) return; setBusy(true); const r = await deleteSalesRfq(id); setBusy(false); if (r.ok) router.refresh(); }
  return (
    <div className="flex items-center justify-end gap-1">
      {canManage && (
        <Select className="h-8 w-32 text-xs" value={status} disabled={busy} onChange={(e) => change(e.target.value)}>
          {RFQ_STATUS.map((s) => <option key={s} value={s}>{RFQ_STATUS_LABEL[s]}</option>)}
        </Select>
      )}
      <Link href={`/sales/rfqs/${id}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Detay"><ExternalLink className="size-4" /></Link>
      {canManage && <Button size="sm" variant="ghost" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10" title="Sil"><Trash2 className="size-3.5" /></Button>}
    </div>
  );
}
