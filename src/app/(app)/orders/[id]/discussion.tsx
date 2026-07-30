"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, CornerDownRight, Paperclip, Send, X, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useI18n } from "@/components/i18n-provider";
import { uploadAttachment } from "@/app/actions/attachments";
import { postComment, searchMentionUsers, markThreadRead } from "./discussion-actions";
import type { DiscComment } from "@/domain/discussion";

interface MentionUser { id: string; name: string; email: string }

/** Yorum yazma bileşeni: metin + @mention otomatik tamamlama + ek + iç-not + gönder. */
function Composer({
  entityType,
  entityId,
  parentId,
  canInternal,
  placeholder,
  onDone,
}: {
  entityType: string;
  entityId: string;
  parentId?: string;
  canInternal: boolean;
  placeholder: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<Map<string, string>>(new Map());
  const [files, setFiles] = useState<File[]>([]);
  const [isInternal, setIsInternal] = useState(false);
  const [menu, setMenu] = useState<MentionUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onBodyChange(v: string) {
    setBody(v);
    const m = /(?:^|\s)@([^\s@]*)$/u.exec(v);
    if (m) {
      const res = await searchMentionUsers(m[1] ?? "");
      setMenu(res.ok ? res.data : []);
    } else {
      setMenu([]);
    }
  }

  function pickMention(u: MentionUser) {
    setBody((prev) => prev.replace(/(?:^|\s)@([^\s@]*)$/u, (full) => (full.startsWith(" ") ? " " : "") + "@" + u.name + " "));
    setMentions((prev) => new Map(prev).set(u.id, u.name));
    setMenu([]);
  }

  async function send() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError("");
    const res = await postComment({ entityType, entityId, body, isInternal, parentId, mentionedUserIds: [...mentions.keys()] });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    // Staged ekleri oluşan yoruma yükle (aynı isInternal görünürlüğü)
    for (const f of files) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("entityType", "Comment");
      fd.set("entityId", res.data.id);
      fd.set("isInternal", String(isInternal));
      await uploadAttachment(fd);
    }
    setBody("");
    setMentions(new Map());
    setFiles([]);
    setIsInternal(false);
    setBusy(false);
    onDone();
  }

  return (
    <div className="relative space-y-2">
      {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}
      <Textarea value={body} onChange={(e) => onBodyChange(e.target.value)} placeholder={placeholder} className="min-h-[64px]" />
      {menu.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 overflow-hidden rounded-md border bg-white shadow-lg dark:bg-slate-900">
          {menu.map((u) => (
            <button key={u.id} type="button" onClick={() => pickMention(u)} className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-accent">
              <span className="font-medium">{u.name}</span>
              <span className="text-xs text-muted-foreground">{u.email}</span>
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5 text-xs">
              {f.name}
              <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== i))} className="text-destructive"><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={send} disabled={busy}>
          {busy ? t("po.workspace.discussion.posting") : <><Send className="size-4" /> {t("action.send")}</>}
        </Button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" multiple className="hidden" onChange={(e) => { setFiles((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
        <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title={t("po.workspace.discussion.attach")}>
          <Paperclip className="size-4" />
        </Button>
        {canInternal && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            <Lock className="size-3" /> {t("po.workspace.discussion.internalToggle")}
          </label>
        )}
      </div>
    </div>
  );
}

function CommentCard({
  c,
  entityType,
  entityId,
  currentUserId,
  canInternal,
  canComment,
  isReply = false,
  onDone,
}: {
  c: DiscComment;
  entityType: string;
  entityId: string;
  currentUserId: string;
  canInternal: boolean;
  canComment: boolean;
  isReply?: boolean;
  onDone: () => void;
}) {
  const { t, locale } = useI18n();
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const mine = c.authorId === currentUserId;
  const when = new Date(c.createdAt).toLocaleString(locale === "en" ? "en-US" : "tr-TR", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className={isReply ? "border-l-2 border-border pl-3" : "rounded-lg border bg-white p-3 dark:bg-slate-900"}>
      <div className="flex items-center gap-2 text-sm">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {(c.authorName || "?").slice(0, 2).toUpperCase()}
        </span>
        <span className="font-medium">{mine ? t("po.workspace.discussion.you") : c.authorName}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
        {c.isInternal && (
          <span className="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
            <Lock className="size-2.5" /> {t("po.workspace.internalBadge")}
          </span>
        )}
      </div>

      <p className="mt-1.5 whitespace-pre-wrap text-sm">{c.body}</p>

      {c.mentions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {c.mentions.map((m) => (
            <span key={m.userId} className="rounded bg-primary/10 px-1.5 text-[11px] text-primary">@{m.name}</span>
          ))}
        </div>
      )}

      {c.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.attachments.map((a) =>
            a.isImage && a.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="size-16 rounded border object-cover" title={a.name} /></a>
            ) : (
              <span key={a.id} className="flex items-center gap-1 rounded border bg-muted/40 px-2 py-1 text-xs">📎 {a.name}</span>
            ),
          )}
        </div>
      )}

      {!isReply && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          {canComment && (
            <button type="button" onClick={() => setReplying((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <CornerDownRight className="size-3" /> {t("po.workspace.discussion.reply")}
            </button>
          )}
          {c.replies.length > 0 && (
            <button type="button" onClick={() => setShowReplies((v) => !v)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              {showReplies ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              {t("po.workspace.discussion.repliesCount", { n: c.replies.length })}
            </button>
          )}
        </div>
      )}

      {replying && (
        <div className="mt-2">
          <Composer entityType={entityType} entityId={entityId} parentId={c.id} canInternal={canInternal} placeholder={t("po.workspace.discussion.replyPlaceholder")} onDone={() => { setReplying(false); onDone(); }} />
        </div>
      )}

      {!isReply && showReplies && c.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {c.replies.map((r) => (
            <CommentCard key={r.id} c={r} entityType={entityType} entityId={entityId} currentUserId={currentUserId} canInternal={canInternal} canComment={canComment} isReply onDone={onDone} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiscussionFeed({
  entityType = "PurchaseOrder",
  entityId,
  comments,
  currentUserId,
  canInternal,
  canComment,
}: {
  entityType?: string;
  entityId: string;
  comments: DiscComment[];
  currentUserId: string;
  canInternal: boolean;
  canComment: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const refresh = () => router.refresh();

  // Görüntülenince "okundu" işaretle
  useEffect(() => {
    void markThreadRead(entityType, entityId);
  }, [entityType, entityId]);

  return (
    <div className="space-y-4">
      {canComment && <Composer entityType={entityType} entityId={entityId} canInternal={canInternal} placeholder={t("po.workspace.discussion.newMessage")} onDone={refresh} />}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <MessageSquare className="size-8 opacity-40" />
          {t("po.workspace.discussion.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <CommentCard key={c.id} c={c} entityType={entityType} entityId={entityId} currentUserId={currentUserId} canInternal={canInternal} canComment={canComment} onDone={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
