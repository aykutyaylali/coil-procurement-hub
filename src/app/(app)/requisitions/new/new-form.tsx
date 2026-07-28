"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { createRequisition, submitRequisition } from "../actions";
import { lineNet, formatMoney, add } from "@/lib/money";

interface Opt {
  id: string;
  name: string;
  companyId?: string;
}
interface Line {
  description: string;
  quantity: string;
  uom: string;
  estUnitPrice: string;
  taxRate: string;
  categoryId: string;
}

const emptyLine: Line = { description: "", quantity: "1", uom: "", estUnitPrice: "0", taxRate: "20", categoryId: "" };

export function NewRequisitionForm({
  companies,
  departments,
  projects,
  costCenters,
  categories,
  currencies,
  uoms,
}: {
  companies: Opt[];
  departments: Opt[];
  projects: Opt[];
  costCenters: Opt[];
  categories: Opt[];
  currencies: string[];
  uoms: string[];
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [purchaseType, setPurchaseType] = useState("GOODS");
  const [operationType, setOperationType] = useState("DOMESTIC_PURCHASE");
  const [exportProjectNo, setExportProjectNo] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "TRY");
  const [neededBy, setNeededBy] = useState("");
  const [justification, setJustification] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredDepts = departments.filter((d) => d.companyId === companyId);
  const filteredProjects = projects.filter((p) => p.companyId === companyId);
  const filteredCC = costCenters.filter((c) => c.companyId === companyId);

  const total = useMemo(
    () => add(...lines.map((l) => lineNet(l.quantity || "0", l.estUnitPrice || "0"))),
    [lines],
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function onSubmit(saveDraft: boolean) {
    setError("");
    setSubmitting(true);
    const res = await createRequisition({
      companyId,
      departmentId: departmentId || undefined,
      projectId: projectId || undefined,
      costCenterId: costCenterId || undefined,
      priority,
      purchaseType,
      operationType,
      exportProjectNo: exportProjectNo || undefined,
      targetCountry: targetCountry || undefined,
      currency,
      neededBy: neededBy || undefined,
      justification: justification || undefined,
      internalNote: internalNote || undefined,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        uom: l.uom || undefined,
        estUnitPrice: l.estUnitPrice || "0",
        taxRate: l.taxRate || "20",
        categoryId: l.categoryId || undefined,
      })),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError(res.error);
      return;
    }
    // "Kaydet ve Onaya Gönder" ise gerçekten onaya gönder
    if (!saveDraft) {
      const sub = await submitRequisition(res.data.id);
      if (!sub.ok) {
        setSubmitting(false);
        setError(sub.error);
        router.push(`/requisitions/${res.data.id}`);
        return;
      }
    }
    setSubmitting(false);
    router.push(`/requisitions/${res.data.id}`);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Genel Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Şirket *</Label>
            <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Departman</Label>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">Seçiniz</option>
              {filteredDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Proje</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Seçiniz</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Maliyet Merkezi</Label>
            <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
              <option value="">Seçiniz</option>
              {filteredCC.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Öncelik</Label>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="LOW">Düşük</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Yüksek</option>
              <option value="URGENT">Acil</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Satınalma Türü</Label>
            <Select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)}>
              <option value="GOODS">Malzeme</option>
              <option value="SERVICE">Hizmet</option>
              <option value="EXPENSE">Masraf</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Operasyon Türü</Label>
            <Select value={operationType} onChange={(e) => setOperationType(e.target.value)}>
              <option value="DOMESTIC_PURCHASE">Yurt İçi Satınalma</option>
              <option value="IMPORT_PURCHASE">İthalat</option>
              <option value="EXPORT_RELATED_PURCHASE">İhracat Bağlantılı</option>
            </Select>
          </div>
          {operationType === "EXPORT_RELATED_PURCHASE" && (
            <>
              <div className="space-y-1.5">
                <Label>İhracat Proje / İş Emri No</Label>
                <Input value={exportProjectNo} onChange={(e) => setExportProjectNo(e.target.value)} placeholder="Örn: EXP-2026-014" />
              </div>
              <div className="space-y-1.5">
                <Label>Hedef Ülke</Label>
                <Input value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} placeholder="Örn: Almanya" />
              </div>
            </>
          )}
          {operationType === "IMPORT_PURCHASE" && (
            <div className="space-y-1.5">
              <Label>Tedarikçi Ülkesi (bilgi)</Label>
              <Input value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} placeholder="Örn: Çin, Almanya" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Para Birimi</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>İstenen Teslim Tarihi</Label>
            <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Talep Kalemleri</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="size-4" /> Kalem Ekle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <Label className="text-xs">Açıklama *</Label>
                <Input
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="Malzeme / hizmet açıklaması"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Kategori</Label>
                <Select value={l.categoryId} onChange={(e) => updateLine(i, { categoryId: e.target.value })}>
                  <option value="">-</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-1">
                <Label className="text-xs">Miktar</Label>
                <Input value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
              </div>
              <div className="sm:col-span-1">
                <Label className="text-xs">Birim</Label>
                <Select value={l.uom} onChange={(e) => updateLine(i, { uom: e.target.value })}>
                  <option value="">-</option>
                  {uoms.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Tah. Birim Fiyat</Label>
                <Input value={l.estUnitPrice} onChange={(e) => updateLine(i, { estUnitPrice: e.target.value })} />
              </div>
              <div className="sm:col-span-1">
                <Label className="text-xs">KDV %</Label>
                <Input value={l.taxRate} onChange={(e) => updateLine(i, { taxRate: e.target.value })} />
              </div>
              <div className="flex items-end sm:col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex justify-end border-t pt-3 text-sm">
            <span className="text-muted-foreground">Tahmini Net Toplam:&nbsp;</span>
            <span className="font-semibold">{formatMoney(total, currency)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Gerekçe</Label>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Talebin gerekçesi" />
          </div>
          <div className="space-y-1.5">
            <Label>İç Not (tedarikçiye gösterilmez)</Label>
            <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} placeholder="Dahili not" />
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
          İptal
        </Button>
        <Button variant="secondary" onClick={() => onSubmit(true)} disabled={submitting}>
          Taslak Kaydet
        </Button>
        <Button onClick={() => onSubmit(false)} disabled={submitting}>
          {submitting ? "Kaydediliyor..." : "Kaydet ve Onaya Gönder"}
        </Button>
      </div>
    </div>
  );
}
