"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { addBudgetTransaction } from "../actions";

export function ManualTxForm({ budgetId }: { budgetId: string }) {
  const router = useRouter();
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
        <option value="RESERVE">Rezerv</option><option value="RELEASE">Rezerv İptal</option><option value="COMMIT">Taahhüt</option><option value="INVOICE">Faturalanan</option><option value="PAYMENT">Ödenen</option>
      </Select>
      <Input className="sm:col-span-3" placeholder="Tutar" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <Input className="sm:col-span-4" placeholder="Not" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button className="sm:col-span-2" disabled={busy} onClick={add}>Ekle</Button>
    </div>
  );
}
