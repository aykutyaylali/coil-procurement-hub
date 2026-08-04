"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { useI18n } from "@/components/i18n-provider";
import { addContractItem, deleteContractItem, setContractStatus } from "../actions";

export function ContractStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function change(s: "ACTIVE" | "EXPIRED" | "TERMINATED" | "DRAFT") {
    setBusy(true);
    await setContractStatus({ id, status: s });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && <Button size="sm" variant="success" disabled={busy} onClick={() => change("ACTIVE")}>{t("con.action.activate")}</Button>}
      {status === "ACTIVE" && <Button size="sm" variant="destructive" disabled={busy} onClick={() => change("TERMINATED")}>{t("con.action.terminate")}</Button>}
      {status === "ACTIVE" && <Button size="sm" variant="outline" disabled={busy} onClick={() => change("EXPIRED")}>{t("con.action.expire")}</Button>}
    </div>
  );
}

export function ContractItems({ contractId, currency, items }: { contractId: string; currency: string; items: { id: string; description: string; unitPrice: string; uom: string | null }[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [uom, setUom] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!desc.trim()) return;
    setBusy(true);
    await addContractItem({ contractId, description: desc, unitPrice: price || "0", uom: uom || undefined });
    setBusy(false); setDesc(""); setPrice(""); setUom("");
    router.refresh();
  }
  async function del(id: string) { setBusy(true); await deleteContractItem(id); setBusy(false); router.refresh(); }

  return (
    <div className="space-y-3">
      <Table>
        <THead><TR><TH>{t("con.item.description")}</TH><TH className="text-right">{t("con.item.unitPrice")}</TH><TH>{t("con.item.uom")}</TH><TH></TH></TR></THead>
        <TBody>
          {items.length === 0 && <TR><TD colSpan={4} className="py-4 text-center text-sm text-muted-foreground">{t("con.item.empty")}</TD></TR>}
          {items.map((i) => (
            <TR key={i.id}>
              <TD className="font-medium">{i.description}</TD>
              <TD className="text-right">{formatMoney(i.unitPrice, currency)}</TD>
              <TD>{i.uom ?? "-"}</TD>
              <TD className="text-right"><Button variant="ghost" size="icon" disabled={busy} onClick={() => del(i.id)}><Trash2 className="size-4 text-destructive" /></Button></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <div className="grid gap-2 sm:grid-cols-12">
        <Input className="sm:col-span-7" placeholder={t("con.item.newDescPlaceholder")} value={desc} onChange={(e) => setDesc(e.target.value)} />
        <Input className="sm:col-span-2" placeholder={t("con.item.pricePlaceholder")} value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input className="sm:col-span-2" placeholder={t("con.item.uomPlaceholder")} value={uom} onChange={(e) => setUom(e.target.value)} />
        <Button className="sm:col-span-1" disabled={busy} onClick={add}><Plus className="size-4" /></Button>
      </div>
    </div>
  );
}
