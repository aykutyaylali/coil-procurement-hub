"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, ChevronDown, ChevronRight, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import { uploadAttachment } from "@/app/actions/attachments";
import { REVIEW_TYPES, REVIEW_ACTIONS, REVIEW_RISKS, REVIEW_PRIORITIES } from "@/domain/technical-review-constants";
import type { TechReview } from "@/domain/technical-review";
import type { DiscComment } from "@/domain/discussion";
import { createTechnicalReview, decideTechnicalReview } from "./technical-review-actions";
import { DiscussionFeed } from "./discussion";

function statusTone(status: string): "default" | "success" | "danger" | "warning" | "info" {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "OPEN") return "default";
  return "warning";
}

function CreateReviewForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ reviewType: "DIMENSION", currentValue: "", proposedValue: "", reason: "", technicalExplanation: "", impact: "", risk: "MEDIUM", priority: "NORMAL", deadline: "" });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const up = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await createTechnicalReview({ orderId, ...f, deadline: f.deadline || undefined });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    for (const file of files) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entityType", "TechnicalReview");
      fd.set("entityId", res.data.id);
      fd.set("isInternal", "false");
      await uploadAttachment(fd);
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>{t("techreview.reviewType")}</Label>
          <Select value={f.reviewType} onChange={(e) => up({ reviewType: e.target.value })}>
            {REVIEW_TYPES.map((x) => <option key={x} value={x}>{t(`techreview.type.${x}` as TranslationKey)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.risk")}</Label>
          <Select value={f.risk} onChange={(e) => up({ risk: e.target.value })}>
            {REVIEW_RISKS.map((x) => <option key={x} value={x}>{t(`techreview.riskLevel.${x}` as TranslationKey)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.priority")}</Label>
          <Select value={f.priority} onChange={(e) => up({ priority: e.target.value })}>
            {REVIEW_PRIORITIES.map((x) => <option key={x} value={x}>{t(`priority.${x}` as TranslationKey)}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.currentValue")}</Label>
          <Input value={f.currentValue} onChange={(e) => up({ currentValue: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.proposedValue")}</Label>
          <Input value={f.proposedValue} onChange={(e) => up({ proposedValue: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.deadline")}</Label>
          <Input type="date" value={f.deadline} onChange={(e) => up({ deadline: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("techreview.reason")}</Label>
        <Textarea value={f.reason} onChange={(e) => up({ reason: e.target.value })} className="min-h-[52px]" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("techreview.technicalExplanation")}</Label>
          <Textarea value={f.technicalExplanation} onChange={(e) => up({ technicalExplanation: e.target.value })} className="min-h-[52px]" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("techreview.impact")}</Label>
          <Textarea value={f.impact} onChange={(e) => up({ impact: e.target.value })} className="min-h-[52px]" />
        </div>
      </div>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((x, i) => (
            <span key={i} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5 text-xs">
              {x.name}<button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} className="text-destructive"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>{busy ? t("techreview.creating") : t("techreview.create")}</Button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple className="hidden" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
        <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title={t("techreview.attachments")}><Paperclip className="size-4" /></Button>
      </div>
    </div>
  );
}

function DecisionBar({ reviewId, onDone }: { reviewId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await decideTechnicalReview({ reviewId, action, note: note || undefined });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNote("");
    onDone();
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <Label className="text-xs font-semibold">{t("techreview.decision")}</Label>
      {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("techreview.decisionNote")} className="min-h-[44px]" />
      <div className="flex flex-wrap gap-1.5">
        {REVIEW_ACTIONS.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === "APPROVE" ? "success" : a === "REJECT" ? "destructive" : "outline"}
            disabled={busy}
            onClick={() => decide(a)}
          >
            {t(`techreview.action.${a}` as TranslationKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({
  r,
  comments,
  canDecide,
  canComment,
  canInternal,
  currentUserId,
  onDone,
}: {
  r: TechReview;
  comments: DiscComment[];
  canDecide: boolean;
  canComment: boolean;
  canInternal: boolean;
  currentUserId: string;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const when = new Date(r.createdAt).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR", { dateStyle: "medium" });

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-900">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <span className="font-medium">{t(`techreview.type.${r.reviewType}` as TranslationKey)}</span>
        <Badge tone={statusTone(r.status)}>{t(`techreview.status.${r.status}` as TranslationKey)}</Badge>
        {(r.priority === "HIGH" || r.priority === "URGENT") && <Badge tone="warning">{t(`priority.${r.priority}` as TranslationKey)}</Badge>}
        {r.risk === "HIGH" && <Badge tone="danger">{t("techreview.risk")}: {t(`techreview.riskLevel.${r.risk}` as TranslationKey)}</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">{r.createdByName} · {when}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            {(r.currentValue || r.proposedValue) && (
              <div className="rounded bg-muted/40 px-2 py-1">
                <span className="text-xs text-muted-foreground">{t("techreview.currentValue")} → {t("techreview.proposedValue")}</span>
                <div className="font-medium">{r.currentValue ?? "-"} → {r.proposedValue ?? "-"}</div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="info">{t("techreview.priority")}: {t(`priority.${r.priority}` as TranslationKey)}</Badge>
              {r.risk && <Badge tone="default">{t("techreview.risk")}: {t(`techreview.riskLevel.${r.risk}` as TranslationKey)}</Badge>}
              {r.deadline && <Badge tone="default">{t("techreview.deadline")}: {new Date(r.deadline).toLocaleDateString(locale === "en" ? "en-US" : "tr-TR")}</Badge>}
            </div>
          </div>
          {r.reason && <Field label={t("techreview.reason")} value={r.reason} />}
          {r.technicalExplanation && <Field label={t("techreview.technicalExplanation")} value={r.technicalExplanation} />}
          {r.impact && <Field label={t("techreview.impact")} value={r.impact} />}

          {r.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {r.attachments.map((a) =>
                a.isImage && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="size-16 rounded border object-cover" /></a>
                ) : (
                  <span key={a.id} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">📎 {a.name}</span>
                ),
              )}
            </div>
          )}

          {canDecide && <DecisionBar reviewId={r.id} onDone={onDone} />}

          {r.actions.length > 0 && (
            <div>
              <Label className="text-xs font-semibold">{t("techreview.actionHistory")}</Label>
              <div className="mt-1 space-y-1">
                {r.actions.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 border-l-2 border-primary/30 pl-2 text-xs">
                    <Badge tone="default">{t(`techreview.action.${a.action}` as TranslationKey)}</Badge>
                    <span className="text-muted-foreground">{a.byName} · {new Date(a.createdAt).toLocaleString(locale === "en" ? "en-US" : "tr-TR", { dateStyle: "short", timeStyle: "short" })}</span>
                    {a.note && <span>· {a.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-2">
            <Label className="text-xs font-semibold">{t("techreview.discussion")}</Label>
            <div className="mt-2">
              <DiscussionFeed entityType="TechnicalReview" entityId={r.id} comments={comments} currentUserId={currentUserId} canInternal={canInternal} canComment={canComment} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}

export function TechnicalReviewPanel({
  orderId,
  reviews,
  discussionsByReview,
  canCreate,
  canDecide,
  canComment,
  canInternal,
  currentUserId,
}: {
  orderId: string;
  reviews: TechReview[];
  discussionsByReview: Record<string, DiscComment[]>;
  canCreate: boolean;
  canDecide: boolean;
  canComment: boolean;
  canInternal: boolean;
  currentUserId: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const refresh = () => router.refresh();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><FlaskConical className="size-5" /> {t("techreview.title")}</CardTitle>
        {canCreate && (
          <Button size="sm" variant={creating ? "secondary" : "outline"} onClick={() => setCreating((v) => !v)}>
            <Plus className="size-4" /> {t("techreview.new")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {creating && canCreate && <CreateReviewForm orderId={orderId} onDone={() => { setCreating(false); refresh(); }} />}
        {reviews.length === 0 && !creating && <p className="text-sm text-muted-foreground">{t("techreview.empty")}</p>}
        {reviews.map((r) => (
          <ReviewCard
            key={r.id}
            r={r}
            comments={discussionsByReview[r.id] ?? []}
            canDecide={canDecide}
            canComment={canComment}
            canInternal={canInternal}
            currentUserId={currentUserId}
            onDone={refresh}
          />
        ))}
      </CardContent>
    </Card>
  );
}
