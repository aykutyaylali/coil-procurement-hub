"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateReqApprovalPolicy } from "./actions";

export interface CompanyPolicy {
  companyId: string;
  companyName: string;
  currency: string;
  mode: "ALWAYS" | "THRESHOLD" | "NEVER";
  threshold: string;
}

export function ApprovalPolicyForm({ companies }: { companies: CompanyPolicy[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<Record<string, { mode: string; threshold: string; busy: boolean }>>(
    Object.fromEntries(companies.map((c) => [c.companyId, { mode: c.mode, threshold: c.threshold, busy: false }])),
  );

  async function save(c: CompanyPolicy) {
    const s = state[c.companyId]!;
    setState((p) => ({ ...p, [c.companyId]: { ...s, busy: true } }));
    const res = await updateReqApprovalPolicy({ companyId: c.companyId, mode: s.mode, threshold: s.threshold });
    setState((p) => ({ ...p, [c.companyId]: { ...s, busy: false } }));
    if (!res.ok) {
      toast({ type: "error", title: "Politika kaydedilemedi.", description: res.error });
      return;
    }
    toast({ type: "success", title: "Onay politikası kaydedildi." });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {companies.map((c) => {
        const s = state[c.companyId]!;
        return (
          <Card key={c.companyId}>
            <CardHeader><CardTitle>{c.companyName}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Onay Politikası</Label>
                <Select value={s.mode} onChange={(e) => setState((p) => ({ ...p, [c.companyId]: { ...s, mode: e.target.value } }))}>
                  <option value="ALWAYS">Her talep onaya gider</option>
                  <option value="THRESHOLD">Yalnızca eşik ve üzeri onaya gider</option>
                  <option value="NEVER">Hiçbir talep onaya gitmez (satınalma doğrudan işler)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Eşik ({c.currency})</Label>
                <Input
                  value={s.threshold}
                  disabled={s.mode !== "THRESHOLD"}
                  onChange={(e) => setState((p) => ({ ...p, [c.companyId]: { ...s, threshold: e.target.value } }))}
                  placeholder="Örn: 10000"
                />
              </div>
              <div className="sm:col-span-3">
                <p className="text-xs text-muted-foreground">
                  {s.mode === "THRESHOLD"
                    ? `Tahmini tutarı ${s.threshold || 0} ${c.currency} ve üzeri talepler onaya gider; altındakiler doğrudan onaylanır.`
                    : s.mode === "NEVER"
                      ? "Talepler onaya gitmeden doğrudan onaylanır (satınalma doğrudan RFQ'ya çevirir)."
                      : "Tüm talepler onay akışına girer."}
                </p>
              </div>
              <div className="sm:col-span-3 flex justify-end">
                <Button onClick={() => save(c)} disabled={s.busy}>
                  {s.busy && <Loader2 className="size-4 animate-spin" />}
                  {s.busy ? "Kaydediliyor…" : "Kaydet"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
