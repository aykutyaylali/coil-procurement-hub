"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Split, Info, ImagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createRfqFromRequisition } from "@/app/(app)/rfqs/actions";
import { AttachmentUploader } from "@/components/attachments/attachment-uploader";
import { formatQty } from "@/lib/money";

export interface ReqLine {
  id: string;
  lineNo: number;
  description: string;
  categoryName: string | null;
  quantity: string;
  uom: string | null;
  status: string;
}

export function RequisitionLinesPanel({
  requisitionId,
  canCreateRfq,
  canEditLines = false,
  reqStatus,
  lines,
}: {
  requisitionId: string;
  canCreateRfq: boolean;
  canEditLines?: boolean;
  reqStatus: string;
  lines: ReqLine[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openPhotos, setOpenPhotos] = useState<Set<string>>(new Set());

  function togglePhotos(id: string) {
    setOpenPhotos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const canSplit = canCreateRfq && ["APPROVED", "ASSIGNED", "IN_RFQ"].includes(reqStatus);
  const openLines = lines.filter((l) => l.status === "OPEN");
  const openCategories = new Set(openLines.map((l) => l.categoryName ?? "-"));
  const multiCategory = openCategories.size > 1;

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === openLines.length ? new Set() : new Set(openLines.map((l) => l.id))));
  }

  async function createRfq(useAll: boolean) {
    if (busy) return;
    const ids = useAll ? openLines.map((l) => l.id) : [...selected];
    if (ids.length === 0) {
      toast({ type: "info", title: "Kalem seçin.", description: "RFQ'ya alınacak en az bir açık kalem seçin." });
      return;
    }
    setBusy(true);
    const res = await createRfqFromRequisition(requisitionId, ids);
    setBusy(false);
    if (!res.ok) { toast({ type: "error", title: "RFQ oluşturulamadı.", description: res.error }); return; }
    toast({ type: "success", title: "Teklif talebi (RFQ) oluşturuldu.", description: `${ids.length} kalem eklendi.` });
    router.push(`/rfqs/${res.data.id}`);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Talep Kalemleri</CardTitle>
        {canSplit && openLines.length > 0 && (
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => createRfq(false)} disabled={busy || selected.size === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Split className="size-4" />}
              Seçili kalemlerden RFQ oluştur ({selected.size})
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {canSplit && multiCategory && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            Bu talepte birden fazla kategori var. Farklı tedarikçilere gidecek kalemleri <b>ayrı ayrı seçip</b> birden fazla RFQ oluşturabilirsiniz.
          </div>
        )}
        <Table>
          <THead>
            <TR>
              {canSplit && (
                <TH className="w-10">
                  <input type="checkbox" aria-label="Tümünü seç" checked={openLines.length > 0 && selected.size === openLines.length} onChange={toggleAll} disabled={openLines.length === 0} />
                </TH>
              )}
              <TH>#</TH>
              <TH>Açıklama</TH>
              <TH>Kategori</TH>
              <TH className="text-right">Miktar</TH>
              <TH>Durum</TH>
              <TH>Görsel</TH>
            </TR>
          </THead>
          <TBody>
            {lines.map((l) => {
              const selectable = canSplit && l.status === "OPEN";
              const photosOpen = openPhotos.has(l.id);
              return (
                <Fragment key={l.id}>
                  <TR className={selected.has(l.id) ? "bg-primary/5" : ""}>
                    {canSplit && (
                      <TD>
                        {selectable ? (
                          <input type="checkbox" aria-label={`Kalem ${l.lineNo} seç`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TD>
                    )}
                    <TD>{l.lineNo}</TD>
                    <TD className="font-medium">{l.description}</TD>
                    <TD className="text-sm text-muted-foreground">{l.categoryName ?? "-"}</TD>
                    <TD className="text-right">{formatQty(l.quantity)} {l.uom ?? ""}</TD>
                    <TD>{l.status === "OPEN" ? <Badge tone="default">Açık</Badge> : <StatusBadge status={l.status} />}</TD>
                    <TD>
                      <Button type="button" variant={photosOpen ? "secondary" : "ghost"} size="sm" onClick={() => togglePhotos(l.id)}>
                        <ImagePlus className="size-4" /> Foto
                      </Button>
                    </TD>
                  </TR>
                  {photosOpen && (
                    <TR>
                      <TD colSpan={canSplit ? 7 : 6} className="bg-muted/20">
                        <div className="px-2 py-1">
                          <p className="mb-2 text-xs text-muted-foreground">
                            Bu kaleme ait fotoğraf/dosya ekleyin. Yüklenen görseller <b>tedarikçinin teklif sayfasında</b> görünür.
                          </p>
                          <AttachmentUploader
                            entityType="RequisitionLine"
                            entityId={l.id}
                            isInternal={false}
                            canEdit={canEditLines}
                            compact
                            label="Kalem Görseli / Dosya"
                          />
                        </div>
                      </TD>
                    </TR>
                  )}
                </Fragment>
              );
            })}
          </TBody>
        </Table>
        {canSplit && openLines.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
            <span className="text-xs text-muted-foreground">{openLines.length} açık kalem · {selected.size} seçili</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => createRfq(true)} disabled={busy}>
                Tüm açık kalemlerden tek RFQ
              </Button>
              <Button type="button" size="sm" onClick={() => createRfq(false)} disabled={busy || selected.size === 0}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Split className="size-4" />}
                Seçili kalemlerden RFQ oluştur
              </Button>
            </div>
          </div>
        )}
        {canSplit && openLines.length === 0 && lines.length > 0 && (
          <p className="border-t p-4 text-sm text-muted-foreground">{"Tüm kalemler RFQ'ya alınmış. Yeni açık kalem yok."}</p>
        )}
      </CardContent>
    </Card>
  );
}
