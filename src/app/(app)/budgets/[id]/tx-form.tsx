"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { addBudgetTransaction } from "../actions";

export function ManualTxForm({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [type, setType] = useState<"RESERVE" | "RELEASE" | "COMMIT" | "INVOICE" | "PAYMENT">("COMMIT");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!amount) return;
    setBusy(true);
    await addBudgetTransaction({ budgetId, type, amount, note: note || undefined });
    setBusy(false); setAmount(""); setNote("");
    router.refresh();
  }
  return (
    <div className="grid gap-2 sm:grid-cols-12">
      <Select className="sm:col-span-3" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="RESERVE">{t("bud.txType.RESERVE")}</option><option value="RELEASE">{t("bud.txType.RELEASE")}</option><option value="COMMIT">{t("bud.txType.COMMIT")}</option><option value="INVOICE">{t("bud.txType.INVOICE")}</option><option value="PAYMENT">{t("bud.txType.PAYMENT")}</option>
      </Select>
      <Input className="sm:col-span-3" placeholder={t("bud.tx.amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input className="sm:col-span-4" placeholder={t("bud.tx.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button className="sm:col-span-2" disabled={busy} onClick={add}>{t("bud.tx.add")}</Button>
    </div>
  );
}
