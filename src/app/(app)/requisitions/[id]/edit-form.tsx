"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateRequisition } from "../actions";

interface Opt { id: string; name: string; companyId?: string }
interface Line { description: string; quantity: string; uom: string; categoryId: string }

export interface EditInitial {
  id: string;
  companyId: string;
  departmentId: string;
  projectId: string;
  costCenterId: string;
  priority: string;
  purchaseType: string;
  operationType: string;
  neededBy: string;
  justification: string;
  internalNote: string;
  lines: Line[];
}

export function EditRequisitionForm({
  companies, departments, projects, costCenters, categories, uoms, initial,
}: {
  companies: Opt[]; departments: Opt[]; projects: Opt[]; costCenters: Opt[]; categories: Opt[]; uoms: string[]; initial: EditInitial;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [f, setF] = useState<EditInitial>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<EditInitial>) => setF((p) => ({ ...p, ...patch }));

  const filteredDepts = departments.filter((d) => d.companyId === f.companyId);
  const filteredProjects = projects.filter((p) => p.companyId === f.companyId);
  const filteredCC = costCenters.filter((c) => c.companyId === f.companyId);

  function updateLine(i: number, patch: Partial<Line>) {
    setF((p) => ({ ...p, lines: p.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }
  const addLine = () => set({ lines: [...f.lines, { description: "", quantity: "1", uom: "", categoryId: "" }] });
  const removeLine = (i: number) => set({ lines: f.lines.length > 1 ? f.lines.filter((_, idx) => idx !== i) : f.lines });

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await updateRequisition({
      id: f.id,
      companyId: f.companyId,
      departmentId: f.departmentId || undefined,
      projectId: f.projectId || undefined,
      costCenterId: f.costCenterId || undefined,
      priority: f.priority,
      purchaseType: f.purchaseType,
      operationType: f.operationType,
      neededBy: f.neededBy || undefined,
      justification: f.justification || undefined,
      internalNote: f.internalNote || undefined,
      lines: f.lines.map((l) => ({ description: l.description, quantity: l.quantity, uom: l.uom || undefined, categoryId: l.categoryId || undefined })),
    });
    setBusy(false);
    if (!res.ok) { toast({ type: "error", title: "Talep güncellenemedi.", description: res.error }); return; }
    toast({ type: "success", title: "Talep güncellendi." });
    router.push(`/requisitions/${f.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Genel Bilgiler</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label>Şirket *</Label>
            <Select value={f.companyId} onChange={(e) => set({ companyId: e.target.value })}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Departman</Label>
            <Select value={f.departmentId} onChange={(e) => set({ departmentId: e.target.value })}>
              <option value="">Seçiniz</option>
              {filteredDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Proje</Label>
            <Select value={f.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              <option value="">Seçiniz</option>
              {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Maliyet Merkezi</Label>
            <Select value={f.costCenterId} onChange={(e) => set({ costCenterId: e.target.value })}>
              <option value="">Seçiniz</option>
              {filteredCC.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Öncelik</Label>
            <Select value={f.priority} onChange={(e) => set({ priority: e.target.value })}>
              <option value="LOW">Düşük</option><option value="NORMAL">Normal</option><option value="HIGH">Yüksek</option><option value="URGENT">Acil</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Satınalma Türü</Label>
            <Select value={f.purchaseType} onChange={(e) => set({ purchaseType: e.target.value })}>
              <option value="GOODS">Malzeme</option><option value="SERVICE">Hizmet</option><option value="EXPENSE">Masraf</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Operasyon Türü</Label>
            <Select value={f.operationType} onChange={(e) => set({ operationType: e.target.value })}>
              <option value="DOMESTIC_PURCHASE">Yurt İçi Satınalma</option><option value="IMPORT_PURCHASE">İthalat</option><option value="EXPORT_RELATED_PURCHASE">İhracat Bağlantılı</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>İstenen Teslim Tarihi</Label>
            <Input type="date" value={f.neededBy} onChange={(e) => set({ neededBy: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Talep Kalemleri</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="size-4" /> Kalem Ekle</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {f.lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
              <div className="sm:col-span-5"><Label className="text-xs">Açıklama *</Label>
                <Input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Malzeme / hizmet açıklaması" />
              </div>
              <div className="sm:col-span-3"><Label className="text-xs">Kategori</Label>
                <Select value={l.categoryId} onChange={(e) => updateLine(i, { categoryId: e.target.value })}>
                  <option value="">-</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-1"><Label className="text-xs">Miktar</Label>
                <Input value={l.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
              </div>
              <div className="sm:col-span-2"><Label className="text-xs">Birim</Label>
                <Select value={l.uom} onChange={(e) => updateLine(i, { uom: e.target.value })}>
                  <option value="">-</option>
                  {uoms.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
              </div>
              <div className="flex items-end sm:col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Gerekçe</Label>
            <Textarea value={f.justification} onChange={(e) => set({ justification: e.target.value })} placeholder="Talebin gerekçesi" />
          </div>
          <div className="space-y-1.5"><Label>İç Not (tedarikçiye gösterilmez)</Label>
            <Textarea value={f.internalNote} onChange={(e) => set({ internalNote: e.target.value })} placeholder="Dahili not" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push(`/requisitions/${f.id}`)} disabled={busy}>İptal</Button>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}{busy ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}</Button>
      </div>
    </div>
  );
}
