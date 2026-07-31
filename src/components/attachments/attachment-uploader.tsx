"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  uploadAttachment,
  listAttachments,
  deleteAttachment,
  getAttachmentData,
  type AttachmentMeta,
} from "@/app/actions/attachments";

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Yeniden kullanılabilir dosya/görsel yükleyici (polimorfik Attachment).
 * entityType/entityId ile herhangi bir varlığa bağlanır. Görseller küçük
 * önizleme olarak gösterilir; diğer dosyalar indirilebilir çip olur.
 *
 * isInternal=false ise ek tedarikçi tarafında da görünür (kalem fotoğrafı gibi).
 */
export function AttachmentUploader({
  entityType,
  entityId,
  isInternal = true,
  label = "Dosya / Görsel Ekle",
  accept = "image/png,image/jpeg,image/webp,application/pdf",
  canEdit = true,
  compact = false,
  includeInternal = true,
  showInternalToggle = false,
  internalToggleLabel = "İç belge (tedarikçi görmez)",
}: {
  entityType: string;
  entityId: string;
  isInternal?: boolean;
  label?: string;
  accept?: string;
  canEdit?: boolean;
  compact?: boolean;
  /** false ise yalnız isInternal=false ekler listelenir (tedarikçi yüzeyi). */
  includeInternal?: boolean;
  /** true ise yüklerken "iç belge" onay kutusu gösterilir (iç kullanıcı seçebilir). */
  showInternalToggle?: boolean;
  internalToggleLabel?: string;
}) {
  const [items, setItems] = useState<AttachmentMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [uploadInternal, setUploadInternal] = useState(isInternal);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const res = await listAttachments(entityType, entityId, includeInternal);
    if (res.ok) setItems(res.data);
    setLoaded(true);
  }, [entityType, entityId, includeInternal]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setError("");
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entityType", entityType);
      fd.set("entityId", entityId);
      fd.set("isInternal", String(showInternalToggle ? uploadInternal : isInternal));
      const res = await uploadAttachment(fd);
      if (!res.ok) {
        setError(res.error);
        break;
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    await reload();
    setBusy(false);
  }

  async function onDelete(id: string) {
    setBusy(true);
    const res = await deleteAttachment(id);
    if (!res.ok) setError(res.error);
    await reload();
    setBusy(false);
  }

  async function onDownload(id: string) {
    const res = await getAttachmentData(id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const a = document.createElement("a");
    a.href = res.data.dataUrl;
    a.download = res.data.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">{error}</p>}

      {(items.length > 0 || loaded) && (
        <div className="flex flex-wrap gap-2">
          {items.map((it) =>
            it.isImage && it.dataUrl ? (
              <div key={it.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.dataUrl}
                  alt={it.fileName}
                  className={`rounded border object-cover ${compact ? "size-12" : "size-20"}`}
                  title={it.fileName}
                />
                {!it.isInternal && (
                  <span className="absolute left-0 top-0 rounded-br bg-success/90 px-1 text-[9px] font-medium text-white">
                    Tedarikçi
                  </span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onDelete(it.id)}
                    disabled={busy}
                    className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-destructive text-xs text-white group-hover:flex"
                    title="Sil"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              <div
                key={it.id}
                className="flex items-center gap-1.5 rounded border bg-muted/40 px-2 py-1 text-xs"
              >
                <button type="button" onClick={() => onDownload(it.id)} className="max-w-[160px] truncate text-primary hover:underline" title={it.fileName}>
                  📎 {it.fileName}
                </button>
                <span className="text-muted-foreground">{fmtSize(it.size)}</span>
                {canEdit && (
                  <button type="button" onClick={() => onDelete(it.id)} disabled={busy} className="text-destructive" title="Sil">
                    ×
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Yükleniyor…" : `＋ ${label}`}
          </Button>
          {showInternalToggle && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={uploadInternal} onChange={(e) => setUploadInternal(e.target.checked)} />
              {internalToggleLabel}
            </label>
          )}
        </div>
      )}
    </div>
  );
}
