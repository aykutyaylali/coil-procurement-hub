"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, ExternalLink, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { setWorkOrderStatus, deleteWorkOrder } from "../actions";
import { WORK_ORDER_STATUS } from "../constants";

export function WorkOrderRowActions({ id, status, canManage }: { id: string; status: string; canManage: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(s: string) { setBusy(true); const r = await setWorkOrderStatus(id, s); setBusy(false); if (r.ok) router.refresh(); }
  async function del() { if (!confirm(t("prodWo.deleteConfirm"))) return; setBusy(true); const r = await deleteWorkOrder(id); setBusy(false); if (r.ok) router.refresh(); }
  return (
    <div className="flex items-center justify-end gap-1">
      {canManage && (
        <Select className="h-8 w-32 text-xs" value={status} disabled={busy} onChange={(e) => change(e.target.value)}>
          {WORK_ORDER_STATUS.map((s) => <option key={s} value={s}>{t(`prodWo.woStatus.${s}`)}</option>)}
        </Select>
      )}
      <a href={`/production/work-orders/${id}/label`} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={t("prodWo.barcodeLabelTitle")}><Printer className="size-4" /></a>
      <Link href={`/production/work-orders/${id}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title={t("prodWo.detailTitleAttr")}><ExternalLink className="size-4" /></Link>
      {canManage && <Button size="sm" variant="ghost" onClick={del} disabled={busy} className="text-destructive hover:bg-destructive/10" title={t("prodWo.deleteTitle")}><Trash2 className="size-3.5" /></Button>}
    </div>
  );
}
