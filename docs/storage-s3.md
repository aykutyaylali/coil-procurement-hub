# S3 Uyumlu Dosya Depolama Kurulumu

Uygulama, dosya depolama için adapter kullanır: `local` (varsayılan, dev) ve `s3` (üretim). Arayüz: [`src/lib/storage/index.ts`](../src/lib/storage/index.ts).

## Yerel (dev)

```env
STORAGE_PROVIDER="local"
STORAGE_LOCAL_DIR="./storage"
```

## S3 / MinIO / uyumlu

```env
STORAGE_PROVIDER="s3"
S3_ENDPOINT="https://s3.eu-central-1.amazonaws.com"   # MinIO: http://minio:9000
S3_REGION="eu-central-1"
S3_BUCKET="coil-procurement"
S3_ACCESS_KEY_ID="..."
S3_SECRET_ACCESS_KEY="..."
S3_FORCE_PATH_STYLE="true"   # MinIO için true
```

### Etkinleştirme adımları

1. `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
2. `S3Storage` sınıfındaki `put/get/delete` metodlarını `PutObjectCommand` / `GetObjectCommand` ile doldurun (arayüz hazırdır; yapılandırma yoksa açık hata verir).
3. İndirmeler **presigned URL** (kısa süreli) ile sunulmalı; doğrudan public erişim kapalı olmalı.

## Güvenlik

- Dosya türü ve boyut limiti uygulanır (`validateUpload`: 25MB, izinli MIME listesi).
- **Virüs tarama:** `ANTIVIRUS_PROVIDER=clamav` ile yükleme sonrası tarama; `CLEAN` olmayan dosyalar indirilemez.
- Erişim yetki kontrollüdür (`Attachment.isInternal` → iç notlar tedarikçiye kapalı).
- Bucket'ta sunucu tarafı şifreleme (SSE) ve sürümleme önerilir.
