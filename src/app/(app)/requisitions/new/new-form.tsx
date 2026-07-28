"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/components/i18n-provider";
import { createRequisition, createAndSubmitRequisition } from "../actions";
import { suggestCategory } from "../ai-actions";

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

const TXT = {
  tr: {
    draftSaved: "Taslak başarıyla kaydedildi.",
    submitted: "Talep onaya gönderildi.",
    saveFailed: "Talep kaydedilemedi. Lütfen işaretli alanları kontrol edin.",
    unexpected: "İşlem sırasında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    summaryTitle: "Lütfen aşağıdaki alanları düzeltin:",
    saving: "Kaydediliyor…",
    sending: "Gönderiliyor…",
  },
  en: {
    draftSaved: "Draft saved successfully.",
    submitted: "Requisition submitted for approval.",
    saveFailed: "The requisition could not be saved. Please check the highlighted fields.",
    unexpected: "An unexpected error occurred. Please try again.",
    summaryTitle: "Please fix the following fields:",
    saving: "Saving…",
    sending: "Submitting…",
  },
} as const;

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
  const { toast } = useToast();
  const { locale } = useI18n();
  const t = TXT[(locale as "tr" | "en") in TXT ? (locale as "tr" | "en") : "tr"];

  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [purchaseType, setPurchaseType] = useState("GOODS");
  const [operationType, setOperationType] = useState("DOMESTIC_PURCHASE");
  const [exportProjectNo, setExportProjectNo] = useState("");
  const [targetCountry, setTargetCountry] = useState("");
  // Para birimi talebi açan tarafından girilmez; kayıt için şirket varsayılanı (TRY) kullanılır.
  const currency = currencies[0] ?? "TRY";
  const [neededBy, setNeededBy] = useState("");
  const [justification, setJustification] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [suggesting, setSuggesting] = useState<number | null>(null);

  async function onSuggestCategory(i: number) {
    const desc = lines[i]?.description ?? "";
    if (desc.trim().length < 3) {
      toast({ type: "info", title: "Önce kalem açıklamasını yazın.", description: "Kategori önerisi açıklamaya göre yapılır." });
      return;
    }
    setSuggesting(i);
    const res = await suggestCategory(desc);
    setSuggesting(null);
    if (!res.ok) { toast({ type: "error", title: "Öneri alınamadı.", description: res.error }); return; }
    if (!res.data) { toast({ type: "info", title: "Uygun kategori bulunamadı.", description: "Lütfen listeden seçin." }); return; }
    updateLine(i, { categoryId: res.data.categoryId });
    toast({ type: "success", title: `Önerilen kategori: ${res.data.categoryName}`, description: "Dilerseniz değiştirebilirsiniz." });
  }

  // Idempotency: bir istek anahtarı; başarıda sıfırlanır (çift tıklama tek talep üretir)
  const requestIdRef = useRef<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const filteredDepts = departments.filter((d) => d.companyId === companyId);
  const filteredProjects = projects.filter((p) => p.companyId === companyId);
  const filteredCC = costCenters.filter((c) => c.companyId === companyId);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function fieldId(path: string) {
    return `field-${path.replace(/\./g, "-")}`;
  }

  function focusFirstError(fields: Record<string, string>) {
    const first = Object.keys(fields)[0];
    if (!first) return;
    // Önce hata özetine, sonra ilk hatalı alana kaydır ve odakla
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const el = document.getElementById(fieldId(first));
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        (el as HTMLElement).focus({ preventScroll: true });
      }
    }, 150);
  }

  function buildPayload() {
    if (!requestIdRef.current) {
      requestIdRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    }
    return {
      clientRequestId: requestIdRef.current,
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
    };
  }

  async function onDraft() {
    if (busy) return;
    setBusy("draft");
    setFieldErrors({});
    setSummary("");
    const res = await createRequisition(buildPayload());
    if (!res.ok) {
      setBusy(null);
      setFieldErrors(res.fields ?? {});
      setSummary(res.error);
      toast({ type: "error", title: t.saveFailed, description: res.error });
      if (res.fields) focusFirstError(res.fields);
      return;
    }
    requestIdRef.current = null;
    toast({ type: "success", title: t.draftSaved });
    router.push(`/requisitions/${res.data.id}`);
  }

  async function onSubmitApproval() {
    if (busy) return;
    setBusy("submit");
    setFieldErrors({});
    setSummary("");
    const res = await createAndSubmitRequisition(buildPayload());
    if (!res.ok) {
      setBusy(null);
      setFieldErrors(res.fields ?? {});
      setSummary(res.error);
      toast({ type: "error", title: res.fields ? t.saveFailed : t.unexpected, description: res.error });
      if (res.fields) focusFirstError(res.fields);
      return;
    }
    requestIdRef.current = null;
    toast({ type: "success", title: t.submitted });
    router.push(`/requisitions/${res.data.id}`);
  }

  const err = (path: string) => fieldErrors[path];
  const errClass = (path: string) => (err(path) ? "border-destructive focus-visible:ring-destructive" : "");

  return (
    <div className="space-y-6">
      {summary && (
        <div
          ref={summaryRef}
          role="alert"
          className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
        >
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium text-destructive">{summary}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 list-inside list-disc text-destructive/90">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Genel Bilgiler</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Şirket *</Label>
            <Select id={fieldId("companyId")} value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={errClass("companyId")} aria-invalid={!!err("companyId")}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {err("companyId") && <p className="text-xs text-destructive">{err("companyId")}</p>}
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
              <div className="sm:col-span-5">
                <Label className="text-xs">Açıklama *</Label>
                <Input
                  id={fieldId(`lines.${i}.description`)}
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="Malzeme / hizmet açıklaması"
                  className={errClass(`lines.${i}.description`)}
                  aria-invalid={!!err(`lines.${i}.description`)}
                />
                {err(`lines.${i}.description`) && <p className="mt-1 text-xs text-destructive">{err(`lines.${i}.description`)}</p>}
              </div>
              <div className="sm:col-span-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Kategori</Label>
                  <button
                    type="button"
                    onClick={() => onSuggestCategory(i)}
                    disabled={suggesting === i}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
                    title="Açıklamaya göre kategori öner (ücretsiz, yerel)"
                  >
                    {suggesting === i ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    Öner
                  </button>
                </div>
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
                <Input
                  id={fieldId(`lines.${i}.quantity`)}
                  value={l.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  className={errClass(`lines.${i}.quantity`)}
                  aria-invalid={!!err(`lines.${i}.quantity`)}
                />
                {err(`lines.${i}.quantity`) && <p className="mt-1 text-xs text-destructive">{err(`lines.${i}.quantity`)}</p>}
              </div>
              <div className="sm:col-span-2">
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
              <div className="flex items-end sm:col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Fiyat, para birimi ve KDV talebi açan tarafından girilmez; bu bilgiler satınalma tarafından teklif/sipariş aşamasında belirlenir.
          </p>
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

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={!!busy}>
          İptal
        </Button>
        <Button variant="secondary" onClick={onDraft} disabled={!!busy}>
          {busy === "draft" && <Loader2 className="size-4 animate-spin" />}
          {busy === "draft" ? t.saving : "Taslak Kaydet"}
        </Button>
        <Button onClick={onSubmitApproval} disabled={!!busy}>
          {busy === "submit" && <Loader2 className="size-4 animate-spin" />}
          {busy === "submit" ? t.sending : "Kaydet ve Onaya Gönder"}
        </Button>
      </div>
    </div>
  );
}
