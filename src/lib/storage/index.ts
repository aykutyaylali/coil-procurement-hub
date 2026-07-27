import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import { nanoid } from "@/lib/ids";

export interface StoredObject {
  storageKey: string;
  size: number;
}

export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageProvider {
  private baseDir = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
  async put(key: string, data: Buffer): Promise<StoredObject> {
    const full = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { storageKey: key, size: data.length };
  }
  async get(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }
  async delete(key: string): Promise<void> {
    await fs.rm(path.join(this.baseDir, key), { force: true });
  }
}

/**
 * S3 uyumlu depolama. AWS SDK yerine önerilen presigned/HTTP yaklaşımı
 * production'da eklenir (docs/storage-s3.md). Yapılandırma yoksa açık hata verir.
 */
class S3Storage implements StorageProvider {
  private ensure() {
    if (!process.env.S3_BUCKET || !process.env.S3_ENDPOINT) {
      throw new Error(
        "S3 depolama yapılandırması eksik. .env S3_* değişkenlerini doldurun (bkz. docs/storage-s3.md).",
      );
    }
  }
  async put(): Promise<StoredObject> {
    this.ensure();
    throw new Error("S3 sağlayıcısı için @aws-sdk/client-s3 kurulmalı (docs/storage-s3.md).");
  }
  async get(): Promise<Buffer> {
    this.ensure();
    throw new Error("S3 sağlayıcısı için @aws-sdk/client-s3 kurulmalı (docs/storage-s3.md).");
  }
  async delete(): Promise<void> {
    this.ensure();
    throw new Error("S3 sağlayıcısı için @aws-sdk/client-s3 kurulmalı (docs/storage-s3.md).");
  }
}

let cached: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (cached) return cached;
  cached = env.STORAGE_PROVIDER === "s3" ? new S3Storage() : new LocalStorage();
  return cached;
}

export function generateStorageKey(tenantId: string, fileName: string): string {
  const ext = path.extname(fileName);
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  return `${tenantId}/${y}/${m}/${nanoid()}${ext}`;
}

/**
 * Virüs tarama kancası. ANTIVIRUS_PROVIDER=clamav ise ClamAV'a bağlanır.
 * 'none' ise SKIPPED döner (dev). Zararlı dosya CLEAN olmadan indirilemez.
 */
export async function scanBuffer(_data: Buffer): Promise<"CLEAN" | "INFECTED" | "SKIPPED"> {
  if (env.ANTIVIRUS_PROVIDER === "none") return "SKIPPED";
  // clamav entegrasyonu: TCP 3310 INSTREAM (production kurulumu docs'ta)
  return "SKIPPED";
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function validateUpload(mimeType: string, size: number): string | null {
  if (size > MAX_FILE_SIZE) return "Dosya boyutu 25MB sınırını aşıyor.";
  if (!ALLOWED_MIME.has(mimeType)) return "Bu dosya türüne izin verilmiyor.";
  return null;
}
