"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { updateNonConformance, createCAPA, updateCAPA } from "../../actions";
import { CAPA_TYPES, label } from "@/domain/labels";
import { formatDate } from "@/lib/dates";
import { useI18n } from "@/components/i18n-provider";

interface Capa { id: string; code: string; title: string; type: string; status: string; dueDate: string | null }

export function NcrPanel({
  ncr,
  capas,
  users,
}: {
  ncr: { id: string; status: string; rootCause: string | null; correctiveAction: string | null; preventiveAction: string | null; disposition: string | null };
  capas: Capa[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [rootCause, setRootCause] = useState(ncr.rootCause ?? "");
  const [corrective, setCorrective] = useState(ncr.correctiveAction ?? "");
  const [preventive, setPreventive] = useState(ncr.preventiveAction ?? "");
  const [disposition, setDisposition] = useState(ncr.disposition ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // CAPA
  const [capaTitle, setCapaTitle] = useState("");
  const [capaType, setCapaType] = useState("CORRECTIVE");
  const [capaAction, setCapaAction] = useState("");
  const [capaResp, setCapaResp] = useState("");
  const [capaDue, setCapaDue] = useState("");

  async function save(status?: "OPEN" | "IN_PROGRESS" | "DONE", verify?: boolean) {
    setBusy(true); setError(""); setMsg("");
    const res = await updateNonConformance({ id: ncr.id, rootCause, correctiveAction: corrective, preventiveAction: preventive, disposition, status, verify });
    setBusy(false);
    if (!res.ok) setError(res.error); else { setMsg(t("ncr.saved")); router.refresh(); }
  }

  async function addCapa() {
    if (!capaTitle.trim()) { setError(t("ncr.capaTitleRequired")); return; }
    setBusy(true); setError("");
    const res = await createCAPA({ ncrId: ncr.id, title: capaTitle, type: capaType, rootCause, action: capaAction || undefined, responsibleUserId: capaResp || undefined, dueDate: capaDue || undefined });
    setBusy(false);
    if (!res.ok) setError(res.error); else { setCapaTitle(""); setCapaAction(""); router.refresh(); }
  }

  async function setCapaStatus(id: string, status: "OPEN" | "IN_PROGRESS" | "DONE") {
    setBusy(true);
    const res = await updateCAPA({ id, status, verify: status === "DONE" });
    setBusy(false);
    if (!res.ok) setError(res.error); else router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {msg && <p className="rounded bg-success/10 px-3 py-2 text-sm text-success">{msg}</p>}

      <Card>
        <CardHeader><CardTitle>{t("ncr.rootCauseActions")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>{t("ncr.rootCause")}</Label><Textarea value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>{t("ncr.correctiveAction")}</Label><Textarea value={corrective} onChange={(e) => setCorrective(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("ncr.preventiveAction")}</Label><Textarea value={preventive} onChange={(e) => setPreventive(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>{t("ncr.disposition")}</Label><Input value={disposition} onChange={(e) => setDisposition(e.target.value)} placeholder={t("ncr.dispositionHint")} /></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => save()} disabled={busy}>{t("action.save")}</Button>
            <Button variant="secondary" onClick={() => save("IN_PROGRESS")} disabled={busy}>{t("ncr.inProgress")}</Button>
            <Button variant="success" onClick={() => save("DONE", true)} disabled={busy}>{t("ncr.verify")}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("ncr.capaRecords")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {capas.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
              <div>
                <div className="font-medium">{c.code} · {c.title}</div>
                <div className="text-xs text-muted-foreground">{label(c.type)} · {t("ncr.target")}: {c.dueDate ? formatDate(c.dueDate) : "-"}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                {c.status !== "DONE" && <Button size="sm" variant="outline" onClick={() => setCapaStatus(c.id, "DONE")} disabled={busy}>{t("ncr.close")}</Button>}
              </div>
            </div>
          ))}
          {capas.length === 0 && <p className="text-sm text-muted-foreground">{t("ncr.capaEmpty")}</p>}

          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">{t("ncr.newCapa")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={capaTitle} onChange={(e) => setCapaTitle(e.target.value)} placeholder={t("ncr.capaTitlePh")} />
              <Select value={capaType} onChange={(e) => setCapaType(e.target.value)}>
                {CAPA_TYPES.map((ct) => (<option key={ct} value={ct}>{label(ct)}</option>))}
              </Select>
            </div>
            <Textarea value={capaAction} onChange={(e) => setCapaAction(e.target.value)} placeholder={t("ncr.capaActionPh")} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={capaResp} onChange={(e) => setCapaResp(e.target.value)}>
                <option value="">{t("ncr.selectResponsible")}</option>
                {users.map((u) => (<option key={u.id} value={u.id}>{u.name}</option>))}
              </Select>
              <Input type="date" value={capaDue} onChange={(e) => setCapaDue(e.target.value)} />
            </div>
            <Button onClick={addCapa} disabled={busy}>{t("ncr.createCapa")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
