"use server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/context";
import { getStorage, generateStorageKey, validateUpload, scanBuffer } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { ok, fail, type Result } from "@/lib/errors";

/**
 * Genel dosya yÃ¼kleme. Yetki kontrolÃ¼, tÃ¼r/boyut doÄŸrulama ve virÃ¼s tarama
 * kancasÄ± uygulanÄ±r. Ä°Ã§ notlar (isInternal) tedarikÃ§iye kapalÄ±dÄ±r.
 */
export async function uploadAttachment(formData: FormData): Promise<Result<{ id: string; fileName: string }>> {
  try {
    const user = await requireUser();
    const file = formData.get("file") as File | null;
    const entityType = String(formData.get("entityType") ?? "");
    const entityId = String(formData.get("entityId") ?? "");
    const isInternal = String(formData.get("isInternal") ?? "false") === "true";
    if (!file || !entityType || !entityId) {
      return fail(new Error("Dosya ve baÄŸlam bilgisi zorunludur."));
    }

    const validationError = validateUpload(file.type, file.size);
    if (validationError) return fail(new Error(validationError));

    const buffer = Buffer.from(await file.arrayBuffer());
    const scanStatus = await scanBuffer(buffer);
    if (scanStatus === "INFECTED") return fail(new Error("Dosya gÃ¼venlik taramasÄ±ndan geÃ§emedi."));

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

/** Yetki kontrollÃ¼ dosya indirme (base64 data URL dÃ¶ner). */
export async function getAttachmentData(id: string): Promise<Result<{ fileName: string; mimeType: string; dataUrl: string }>> {
  try {
    const user = await requireUser();
    const att = await prisma.attachment.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!att) return fail(new Error("Dosya bulunamadÄ±."));
    if (att.scanStatus === "INFECTED") return fail(new Error("Bu dosyaya eriÅŸilemez."));
    const storage = getStorage();
    const buffer = await storage.get(att.storageKey);
    const dataUrl = `data:${att.mimeType};base64,${buffer.toString("base64")}`;
    return ok({ fileName: att.fileName, mimeType: att.mimeType, dataUrl });
  } catch (e) {
    return fail(e);
  }
}
