"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { saveInspectionTests } from "../actions";

export interface CoilTest {
  name: string;
  method: string;
  spec: string;
  measured: string;
  result: "PASS" | "FAIL" | "NA";
}

const BLANK: CoilTest = { name: "", method: "", spec: "", measured: "", result: "NA" };

// Bobin/rulo testlerinde sık kullanılan testler (hızlı ekleme)
const COMMON = ["Kalınlık", "Genişlik", "Sertlik (HRB)", "Çekme Dayanımı", "Akma Dayanımı", "Uzama %", "Kaplama Ağırlığı", "Yüzey/Görsel", "Kimyasal Analiz", "Boyut Toleransı"];

export function CoilTestsPanel({
  inspectionId,
  initialTests,
  canEdit,
}: {
  inspectionId: string;
  initialTests: CoilTest[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tests, setTests] = useState<CoilTest[]>(initialTests.length ? initialTests : [{ ...BLANK }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<CoilTest>) {
    setTests((prev) => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
    setSaved(false);
  }
  function addRow(name = "") {
    setTests((prev) => [...prev, { ...BLANK, name }]);
    setSaved(false);
  }
  function removeRow(i: number) {
    setTests((prev) => (prev.length === 1 ? [{ ...BLANK }] : prev.filter((_, j) => j !== i)));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await saveInspectionTests({ inspectionId, tests });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="size-5" /> Bobin Testleri
        </CardTitle>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Kaydediliyor…" : saved ? "✓ Kaydedildi" : "Testleri Kaydet"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {COMMON.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => addRow(c)}
                className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs hover:bg-accent"
              >
                + {c}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH className="min-w-[140px]">Test</TH>
                <TH className="min-w-[120px]">Metot / Standart</TH>
                <TH className="min-w-[100px]">Spesifikasyon</TH>
                <TH className="min-w-[100px]">Ölçülen</TH>
                <TH>Sonuç</TH>
                {canEdit && <TH className="w-10"></TH>}
              </TR>
            </THead>
            <TBody>
              {tests.map((t, i) => (
                <TR key={i}>
                  <TD>
                    {canEdit ? (
                      <Input className="h-8" value={t.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Örn: Sertlik" />
                    ) : (
                      <span className="font-medium">{t.name || "-"}</span>
                    )}
                  </TD>
                  <TD>
                    {canEdit ? (
                      <Input className="h-8" value={t.method} onChange={(e) => update(i, { method: e.target.value })} placeholder="ASTM / TS / EN" />
                    ) : (
                      t.method || "-"
                    )}
                  </TD>
                  <TD>
                    {canEdit ? (
                      <Input className="h-8" value={t.spec} onChange={(e) => update(i, { spec: e.target.value })} placeholder="min/maks" />
                    ) : (
                      t.spec || "-"
                    )}
                  </TD>
                  <TD>
                    {canEdit ? (
                      <Input className="h-8" value={t.measured} onChange={(e) => update(i, { measured: e.target.value })} />
                    ) : (
                      t.measured || "-"
                    )}
                  </TD>
                  <TD>
                    {canEdit ? (
                      <Select className="h-8 w-24" value={t.result} onChange={(e) => update(i, { result: e.target.value as CoilTest["result"] })}>
                        <option value="NA">—</option>
                        <option value="PASS">Uygun</option>
                        <option value="FAIL">Uygun Değil</option>
                      </Select>
                    ) : (
                      <span className={t.result === "PASS" ? "text-success" : t.result === "FAIL" ? "text-destructive" : "text-muted-foreground"}>
                        {t.result === "PASS" ? "Uygun" : t.result === "FAIL" ? "Uygun Değil" : "—"}
                      </span>
                    )}
                  </TD>
                  {canEdit && (
                    <TD>
                      <button type="button" onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive" title="Satırı sil">
                        <Trash2 className="size-4" />
                      </button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => addRow()}>
            <Plus className="size-4" /> Satır Ekle
          </Button>
        )}

        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Test Kanıtları (rapor / görsel)</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Test raporlarını (PDF) ve bobin/numune fotoğraflarını buraya ekleyin. Bu belgeler yalnızca iç kullanım içindir.
          </p>
          <AttachmentUploader
            entityType="QualityInspection"
            entityId={inspectionId}
            isInternal
            canEdit={canEdit}
            label="Test Raporu / Fotoğraf"
          />
        </div>
      </CardContent>
    </Card>
  );
}
