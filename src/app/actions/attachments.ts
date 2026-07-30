"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";
import { getStorage, generateStorageKey, validateUpload, scanBuffer } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";

/**
 * Genel dosya yükleme. Yetki kontrolü, tür/boyut doğrulama ve virüs tarama
 * kancası uygulanır. İç notlar (isInternal) tedarikçiye kapalıdır.
 */
export async function uploadAttachment(formData: FormData): Promise<Result<{ id: string; fileName: string }>> {
  try {
    const user = await requireUser();
    const file = formData.get("file") as File | null;
    const entityType = String(formData.get("entityType") ?? "");
    const entityId = String(formData.get("entityId") ?? "");
    const isInternal = String(formData.get("isInternal") ?? "false") === "true";
    if (!file || !entityType || !entityId) {
      return fail(new Error("Dosya ve bağlam bilgisi zorunludur."));
    }

    const validationError = validateUpload(file.type, file.size);
    if (validationError) return fail(new Error(validationError));

    const buffer = Buffer.from(await file.arrayBuffer());
    const scanStatus = await scanBuffer(buffer);
    if (scanStatus === "INFECTED") return fail(new Error("Dosya güvenlik taramasından geçemedi."));

    const storage = getStorage();
    const key = generateStorageKey(user.tenantId, file.name);
    await storage.put(key, buffer, file.type);

    const attachment = await prisma.attachment.create({
      data: {
        tenantId: user.tenantId,
        entityType,
        entityId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        storageKey: key,
        isInternal,
        scanStatus,
        uploadedById: user.id,
      },
    });

    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "CREATE",
      entityType: "Attachment",
      entityId: attachment.id,
      after: { fileName: file.name, entityType, entityId },
    });

    return ok({ id: attachment.id, fileName: file.name });
  } catch (e) {
    return fail(e);
  }
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  isInternal: boolean;
  isImage: boolean;
  dataUrl: string | null; // görseller için küçük önizleme; diğer dosyalarda null
  createdAt: string;
}

/**
 * Bir varlığa (entityType/entityId) bağlı ekleri listeler (görsellerde önizleme dahil).
 * includeInternal=false ise yalnız tedarikçiye açık (isInternal=false) ekler döner —
 * tedarikçi yüzeyinde iç belgelerin sızmaması için.
 */
export async function listAttachments(entityType: string, entityId: string, includeInternal = true): Promise<Result<AttachmentMeta[]>> {
  try {
    const user = await requireUser();
    const rows = await prisma.attachment.findMany({
      where: { tenantId: user.tenantId, entityType, entityId, ...(includeInternal ? {} : { isInternal: false }) },
      orderBy: { createdAt: "asc" },
    });
    const storage = getStorage();
    const items: AttachmentMeta[] = [];
    for (const a of rows) {
      const isImage = a.mimeType.startsWith("image/");
      let dataUrl: string | null = null;
      if (isImage && a.scanStatus !== "INFECTED") {
        try {
          const buffer = await storage.get(a.storageKey);
          dataUrl = `data:${a.mimeType};base64,${buffer.toString("base64")}`;
        } catch {
          dataUrl = null;
        }
      }
      items.push({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        isInternal: a.isInternal,
        isImage,
        dataUrl,
        createdAt: a.createdAt.toISOString(),
      });
    }
    return ok(items);
  } catch (e) {
    return fail(e);
  }
}

/** Yetki kontrollü ek silme (yalnızca aynı tenant). */
export async function deleteAttachment(id: string): Promise<Result<{ id: string }>> {
  try {
    const user = await requireUser();
    const att = await prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!att) return fail(new Error("Dosya bulunamadı."));
    const storage = getStorage();
    try {
      await storage.delete(att.storageKey);
    } catch {
      // depodan silinemese bile kaydı kaldır (yetim dosya temizliği ayrı yapılır)
    }
    await prisma.attachment.delete({ where: { id: att.id } });
    await writeAudit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "DELETE",
      entityType: "Attachment",
      entityId: att.id,
      before: { fileName: att.fileName, entityType: att.entityType, entityId: att.entityId },
    });
    return ok({ id: att.id });
  } catch (e) {
    return fail(e);
  }
}

/** Yetki kontrollü dosya indirme (base64 data URL döner). */
export async function getAttachmentData(id: string): Promise<Result<{ fileName: string; mimeType: string; dataUrl: string }>> {
  try {
    const user = await requireUser();
    const att = await prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!att) return fail(new Error("Dosya bulunamadı."));
    if (att.scanStatus === "INFECTED") return fail(new Error("Bu dosyaya erişilemez."));
    const storage = getStorage();
    const buffer = await storage.get(att.storageKey);
    const dataUrl = `data:${att.mimeType};base64,${buffer.toString("base64")}`;
    return ok({ fileName: att.fileName, mimeType: att.mimeType, dataUrl });
  } catch (e) {
    return fail(e);
  }
}
