"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { addOfferNote, deleteOfferNote } from "../../actions";

export type NoteItem = { id: string; title: string | null; body: string; author: string; createdAt: string };

export function OfferNotes({ offerId, notes, canManage }: { offerId: string; notes: NoteItem[]; canManage: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
            <div className="space-y-1.5"><Label>İçerik *</Label><Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" placeholder="Not içeriği…" /></div>
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
                        <p className="whitespace-pre-wrap text-sm text-foreground/90">{n.body}</p>
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
