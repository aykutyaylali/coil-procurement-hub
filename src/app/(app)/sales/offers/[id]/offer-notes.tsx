"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Bold, Italic, List } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { addOfferNote, deleteOfferNote } from "../../actions";

export type NoteItem = { id: string; title: string | null; body: string; author: string; createdAt: string };

/** Güvenli mini-markdown: **kalın**, *italik*, satır sonları, "- " madde işaretleri. dangerouslySetInnerHTML KULLANMAZ. */
function inlineFmt(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((p) => p !== "");
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={`${keyBase}-${i}`}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={`${keyBase}-${i}`}>{p.slice(1, -1)}</em>;
    return <span key={`${keyBase}-${i}`}>{p}</span>;
  });
}
export function RichText({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-0.5 text-sm text-foreground/90">
      {lines.map((ln, i) => {
        if (ln.trim() === "") return <div key={i} className="h-2" />;
        if (/^\s*-\s+/.test(ln)) return <div key={i} className="flex gap-1.5"><span className="text-muted-foreground">•</span><span>{inlineFmt(ln.replace(/^\s*-\s+/, ""), String(i))}</span></div>;
        return <div key={i}>{inlineFmt(ln, String(i))}</div>;
      })}
    </div>
  );
}

export function OfferNotes({ offerId, notes, canManage }: { offerId: string; notes: NoteItem[]; canManage: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  function wrap(marker: string, linePrefix?: string) {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = body.slice(s, e);
    let insert: string;
    if (linePrefix) insert = (sel || "madde").split("\n").map((l) => `${linePrefix}${l}`).join("\n");
    else insert = `${marker}${sel || "metin"}${marker}`;
    const next = body.slice(0, s) + insert + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s, s + insert.length); });
  }

  async function add() {
    if (busy || !body.trim()) return;
    setBusy(true); setError("");
    const res = await addOfferNote({ offerId, title: title || undefined, body });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setTitle(""); setBody(""); router.refresh();
  }
  async function del(id: string) {
    if (!confirm("Bu not silinsin mi?")) return;
    const res = await deleteOfferNote(id);
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {canManage && (
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Yeni Not</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {error && <p className="rounded bg-destructive/10 px-2 py-1 text-sm text-destructive">{error}</p>}
            <div className="space-y-1.5"><Label>Başlık (opsiyonel)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="örn. Müşteri görüşmesi" /></div>
            <div className="space-y-1.5">
              <Label>İçerik *</Label>
              <div className="flex gap-1">
                <button type="button" onClick={() => wrap("**")} title="Kalın" className="rounded border px-2 py-1 hover:bg-accent"><Bold className="size-3.5" /></button>
                <button type="button" onClick={() => wrap("*")} title="İtalik" className="rounded border px-2 py-1 hover:bg-accent"><Italic className="size-3.5" /></button>
                <button type="button" onClick={() => wrap("", "- ")} title="Madde" className="rounded border px-2 py-1 hover:bg-accent"><List className="size-3.5" /></button>
              </div>
              <Textarea ref={taRef} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" placeholder="Not içeriği… **kalın**, *italik*, satır başına '- ' ile madde" />
            </div>
            <Button onClick={add} disabled={busy || !body.trim()}>{busy ? "Ekleniyor…" : "Not Ekle"}</Button>
          </CardContent>
        </Card>
      )}

      <div className={canManage ? "lg:col-span-2" : "lg:col-span-3"}>
        <Card>
          <CardHeader><CardTitle className="text-base">Zaman Çizelgesi ({notes.length})</CardTitle></CardHeader>
          <CardContent>
            {notes.length === 0 ? <p className="text-sm text-muted-foreground">Henüz not eklenmemiş.</p> : (
              <ol className="relative space-y-4 border-l pl-5">
                {notes.map((n) => (
                  <li key={n.id} className="relative">
                    <span className="absolute -left-[1.4rem] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        {n.title && <p className="text-sm font-medium">{n.title}</p>}
                        <RichText body={n.body} />
                        <p className="mt-1 text-xs text-muted-foreground">{n.author} · {n.createdAt}</p>
                      </div>
                      {canManage && <button onClick={() => del(n.id)} className="shrink-0 rounded p-1 text-destructive hover:bg-destructive/10" title="Sil"><Trash2 className="size-3.5" /></button>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
